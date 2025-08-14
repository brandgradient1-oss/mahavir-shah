import os
import re
import uuid
import json
import time
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any

import pandas as pd
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import JSONResponse, FileResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

# ---------- Env & Config ----------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Mongo connection - MUST use MONGO_URL and DB_NAME from .env
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ.get('DB_NAME', 'test_database')
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# External API keys (Gemini)
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    logging.warning('GEMINI_API_KEY not set. AI extraction will fail until provided.')

# Google GenAI SDK (official 2025)
try:
    from google import genai
except Exception as e:
    genai = None
    logging.warning('google-genai not installed or failed to import. Install google-genai in requirements.txt')

# ---------- FastAPI ----------
app = FastAPI()
api_router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------- Models ----------
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Fixed JSON schema fields for extraction
class ScrapeMode(str):
    REALTIME = 'realtime'
    DEEP = 'deep'

class ScrapeRequest(BaseModel):
    url: str
    mode: str = Field(default=ScrapeMode.REALTIME)

class ScrapeResult(BaseModel):
    job_id: str
    status: str
    data: Dict[str, Any]
    excel_path: Optional[str]
    created_at: datetime

# ---------- Utilities ----------
SOCIAL_DOMAINS = [
    'linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'youtube.com', 't.me'
]

MOTH_HEADERS = [
    "Company Name","Website","Industry","Description","Services","Address","Country","State","City","Postal Code","Phone","Email","Social Media Links","Founders/Key People","Verification Status","Scraped At"
]

def clean_text(s: Optional[str]) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", BeautifulSoup(s, 'lxml').get_text(" ").strip())


def find_emails(text: str) -> List[str]:
    if not text:
        return []
    pattern = r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"
    return sorted(set(re.findall(pattern, text)))


def find_phones(text: str) -> List[str]:
    if not text:
        return []
    # Simple phone finder; normalization handled by AI later
    pattern = r"\+?\d[\d\s().-]{6,}\d"
    return sorted(set(re.findall(pattern, text)))


def absolute_url(base: str, link: str) -> str:
    try:
        return requests.compat.urljoin(base, link)
    except Exception:
        return link


def crawl_site(url: str, mode: str = ScrapeMode.REALTIME, max_pages: int = 10) -> Dict[str, Any]:
    visited = set()
    to_visit = [url]
    pages = {}
    count_limit = 2 if mode == ScrapeMode.REALTIME else max_pages

    while to_visit and len(visited) < count_limit:
        current = to_visit.pop(0)
        if current in visited:
            continue
        try:
            r = requests.get(current, timeout=12)
            if r.status_code != 200:
                visited.add(current)
                continue
            html = r.text
            pages[current] = html
            visited.add(current)

            # enqueue internal links and social profiles
            soup = BeautifulSoup(html, 'lxml')
            for a in soup.find_all('a', href=True):
                href = a['href']
                if any(dom in href for dom in SOCIAL_DOMAINS):
                    full = absolute_url(current, href)
                    pages[full] = ''  # mark presence
                elif current.split('/')[2] in absolute_url(current, href):
                    absu = absolute_url(current, href)
                    if absu not in visited and len(to_visit) < 50:
                        to_visit.append(absu)
        except Exception as e:
            logger.warning(f"Failed to fetch {current}: {e}")
            visited.add(current)
            continue
    return pages


def init_gemini_client():
    if genai is None:
        raise HTTPException(status_code=500, detail='google-genai not installed')
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=400, detail='GEMINI_API_KEY missing in backend/.env')
    try:
        return genai.Client(api_key=GEMINI_API_KEY)
    except Exception as e:
        logger.error(f"Gemini client init failed: {e}")
        raise HTTPException(status_code=500, detail=f"Gemini init failed: {e}")


def gemini_extract(company_url: str, pages: Dict[str, str]) -> Dict[str, Any]:
    client = init_gemini_client()
    # Concatenate key HTML texts
    combined = []
    take = 2  # first two pages content for prompt token safety
    for i, (u, html) in enumerate(pages.items()):
        if i >= take:
            break
        text = clean_text(html)
        combined.append(f"URL: {u}\n{text[:8000]}")
    prompt_text = "\n\n".join(combined)[:16000]

    system_prompt = (
        "You are an AI data extractor. Input is raw text from a company website. "
        "Return JSON exactly in this schema with English fields: {\n"
        "\"Company Name\": \"\",\n"
        "\"Website\": \"\",\n"
        "\"Industry\": \"\",\n"
        "\"Description\": \"\",\n"
        "\"Services\": \"\",\n"
        "\"Address\": \"\",\n"
        "\"Country\": \"\",\n"
        "\"State\": \"\",\n"
        "\"City\": \"\",\n"
        "\"Postal Code\": \"\",\n"
        "\"Phone\": \"\",\n"
        "\"Email\": \"\",\n"
        "\"Social Media Links\": \"\",\n"
        "\"Founders/Key People\": \"\",\n"
        "\"Verification Status\": \"UNVERIFIED\"\n}"
    )

    schema = {
        "type": "object",
        "properties": {h: {"type": "string"} for h in MOTH_HEADERS[:-1]},
        "required": MOTH_HEADERS[:-1]
    }

    try:
        resp = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                {"role": "user", "parts": [{"text": prompt_text}]}
            ],
            system_instruction=system_prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": schema
            }
        )
        data = resp.parsed if hasattr(resp, 'parsed') and resp.parsed else json.loads(resp.text)
    except Exception as e:
        logger.error(f"Gemini extraction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Gemini extraction failed: {e}")

    # Post-fill website if empty
    if not data.get("Website"):
        data["Website"] = company_url

    # Emails and phones fallback from HTML
    html_concat = "\n".join(pages.values())
    emails = find_emails(html_concat)
    phones = find_phones(html_concat)
    if emails and not data.get("Email"):
        data["Email"] = ", ".join(emails[:3])
    if phones and not data.get("Phone"):
        data["Phone"] = ", ".join(phones[:3])

    # Collect social links discovered
    socials = sorted({u for u in pages.keys() if any(dom in u for dom in SOCIAL_DOMAINS)})
    if socials:
        existing = data.get("Social Media Links", "")
        merged = ", ".join(sorted(set([*([s.strip() for s in existing.split(',') if s.strip()]), *socials])))
        data["Social Media Links"] = merged

    data["Verification Status"] = "UNVERIFIED"
    return data


def to_excel_rows(data_list: List[Dict[str, Any]]) -> pd.DataFrame:
    rows = []
    ts = datetime.utcnow().isoformat()
    for d in data_list:
        row = [d.get(h, "") for h in MOTH_HEADERS[:-1]] + [ts]
        rows.append(row)
    df = pd.DataFrame(rows, columns=MOTH_HEADERS)
    return df


def save_excel_highlight_unverified(df: pd.DataFrame, out_path: str) -> str:
    # Using pandas ExcelWriter with openpyxl engine
    with pd.ExcelWriter(out_path, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Results')
        ws = writer.sheets['Results']
        # Highlight Phone/Email cells if UNVERIFIED
        from openpyxl.styles import PatternFill
        red_fill = PatternFill(start_color='FFCDD2', end_color='FFCDD2', fill_type='solid')
        # find column indices
        headers = {cell.value: idx for idx, cell in enumerate(ws[1], start=1)}
        phone_col = headers.get('Phone')
        email_col = headers.get('Email')
        ver_col = headers.get('Verification Status')
        if phone_col and email_col and ver_col:
            for r in range(2, ws.max_row + 1):
                ver = ws.cell(row=r, column=ver_col).value
                if ver and 'FAIL' in str(ver).upper() or 'UNVERIFIED' in str(ver).upper():
                    ws.cell(row=r, column=phone_col).fill = red_fill
                    ws.cell(row=r, column=email_col).fill = red_fill
    return out_path

# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(client_name=input.client_name)
    await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    items = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**it) for it in items]

@api_router.post("/scrape/url", response_model=ScrapeResult)
async def scrape_url(req: ScrapeRequest):
    # Basic fetch and AI extraction
    pages = crawl_site(req.url, mode=req.mode)
    if not pages:
        raise HTTPException(status_code=400, detail='Failed to fetch the site')

    data = gemini_extract(req.url, pages)

    # Basic verification placeholders (later integrate Twilio/Hunter)
    ver_status = []
    ver_status.append('Phone: UNVERIFIED')
    ver_status.append('Email: UNVERIFIED')
    data['Verification Status'] = '; '.join(ver_status)

    # Save to DB
    job_id = str(uuid.uuid4())
    record = {
        'job_id': job_id,
        'input_url': req.url,
        'mode': req.mode,
        'data': data,
        'created_at': datetime.utcnow().isoformat(),
        'excel_path': None
    }
    await db.scrape_jobs.insert_one(record)

    # Create Excel
    df = to_excel_rows([data])
    out_dir = ROOT_DIR / 'exports'
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = str(out_dir / f'{job_id}.xlsx')
    save_excel_highlight_unverified(df, out_path)

    await db.scrape_jobs.update_one({'job_id': job_id}, {'$set': {'excel_path': out_path}})

    return ScrapeResult(job_id=job_id, status='DONE', data=data, excel_path=out_path, created_at=datetime.utcnow())

@api_router.get("/download/{job_id}")
async def download_excel(job_id: str):
    item = await db.scrape_jobs.find_one({'job_id': job_id})
    if not item or not item.get('excel_path') or not Path(item['excel_path']).exists():
        raise HTTPException(status_code=404, detail='File not found')
    return FileResponse(item['excel_path'], filename=f"{job_id}.xlsx")

# Include router
app.include_router(api_router)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()