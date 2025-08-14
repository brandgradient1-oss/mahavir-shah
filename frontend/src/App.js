import { useEffect, useMemo, useState } from "react";
import "./App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function Field({label, children}){
  return (
    <div className="field">
      <div className="small" style={{marginBottom:6}}>{label}</div>
      {children}
    </div>
  );
}

function Pair({k,v}){
  return (
    <tr className="tr">
      <td className="th">{k}</td>
      <td className="td code">{v || "—"}</td>
    </tr>
  );
}

const steps = [
  {k:"discover", t:"Finding website"},
  {k:"crawl", t:"Crawling pages"},
  {k:"ai", t:"Extracting with AI"},
  {k:"export", t:"Exporting Excel"},
];

function ProgressInline({running}){
  const [p, setP] = useState(0);
  const [idx, setIdx] = useState(0);
  useEffect(()=>{
    if(!running){ setP(0); setIdx(0); return; }
    let sec = 0; const tm = setInterval(()=>{
      sec += 0.25; // 250ms
      const ratio = Math.min(1, sec/15);
      setP(Math.floor(ratio*100));
      setIdx(Math.min(steps.length-1, Math.floor(ratio*steps.length)));
    }, 250);
    return ()=> clearInterval(tm);
  },[running]);
  return (
    <div className="card" style={{padding:16}}>
      <div className="small" style={{marginBottom:8,color:"#b8c2cc"}}>{steps[idx].t}</div>
      <div style={{height:10, background:"rgba(255,255,255,0.08)", borderRadius:999, overflow:'hidden'}}>
        <div style={{width:`${p}%`, height:'100%', background:"linear-gradient(90deg,#d4fbf1,#aee9ff)", transition:"width .2s ease"}}/>
      </div>
      <div className="small" style={{marginTop:8}}>{p}%</div>
    </div>
  );
}

function App() {
  const [method, setMethod] = useState("url"); // url | name | bulk
  const [url, setUrl] = useState("");
  const [company, setCompany] = useState("");
  const [geo, setGeo] = useState("");
  const [mode, setMode] = useState("realtime");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [job, setJob] = useState(null);
  const [bulkInfo, setBulkInfo] = useState(null);
  const [error, setError] = useState("");
  const [file, setFile] = useState(null);

  useEffect(() => { axios.get(`${API}/`).catch(()=>{}); }, []);

  const runUrl = async () => {
    setLoading(true); setError(""); setData(null); setJob(null); setBulkInfo(null);
    try {
      const res = await axios.post(`${API}/scrape/url`, { url, mode });
      setData(res.data.data);
      setJob(res.data);
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message;
      setError(msg);
    } finally { setLoading(false); }
  };

  const runName = async () => {
    setLoading(true); setError(""); setData(null); setJob(null); setBulkInfo(null);
    try {
      const res = await axios.post(`${API}/scrape/name`, { company_name: company, geography: geo, mode });
      setData(res.data.data);
      setJob(res.data);
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message;
      setError(msg);
    } finally { setLoading(false); }
  };

  const runBulk = async () => {
    if(!file) return;
    setLoading(true); setError(""); setData(null); setJob(null); setBulkInfo(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      const res = await axios.post(`${API}/bulk/upload`, form, { headers: { 'Content-Type': 'multipart/form-data' }});
      setBulkInfo(res.data);
      setJob({ job_id: res.data.job_id });
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message;
      setError(msg);
    } finally { setLoading(false); }
  };

  const onRun = () => {
    if(method === 'url') return runUrl();
    if(method === 'name') return runName();
    return runBulk();
  };

  const downloadHref = useMemo(() => job ? `${API}/download/${job.job_id}` : "#", [job]);

  const pairs = useMemo(()=>{
    if(!data) return [];
    const order = [
      "Company Name","Website","Industry","Description","Services","Address","Country","State","City","Postal Code","Phone","Email","Social Media Links","Founders/Key People","Verification Status"
    ];
    return order.map(k => ({k, v: data[k]}));
  }, [data]);

  return (
    <div>
      <div className="container">
        <div className="header">
          <div className="brand">
            <span className="dot"/>
            <h1>SHOREWAY EXIM SCRAPPER</h1>
          </div>
          <div className="nav">
            <a href="#features">Features</a>
            <a href="#docs">Docs</a>
            <a href="#support">Support</a>
          </div>
        </div>

        <div className="hero">
          <div className="card">
            <h2 className="title">Global company data, in one click</h2>
            <p className="subtitle">Crawl websites, extract structured profiles with AI, and export clean Excel files. Works for single URLs, company + geography lookup, and bulk lists. Designed for sourcing, compliance, and go‑to‑market teams.</p>

            <div className="badge" style={{marginBottom:12}}>
              <span className="dot"/> Using Google Gemini for extraction
            </div>

            <div style={{display:'flex',gap:8,marginBottom:12}}>
              <button className="badge" onClick={()=>setMethod('url')} style={{borderColor: method==='url'? '#d4fbf1':'var(--border)'}}>Single URL</button>
              <button className="badge" onClick={()=>setMethod('name')} style={{borderColor: method==='name'? '#d4fbf1':'var(--border)'}}>Name + Geography</button>
              <button className="badge" onClick={()=>setMethod('bulk')} style={{borderColor: method==='bulk'? '#d4fbf1':'var(--border)'}}>Bulk Upload</button>
            </div>

            {method==='url' && (
              <div className="form">
                <Field label="Company Website URL">
                  <input className="input" placeholder="https://example.com" value={url} onChange={e=>setUrl(e.target.value)} />
                </Field>
                <Field label="Mode">
                  <select className="select" value={mode} onChange={e=>setMode(e.target.value)}>
                    <option value="realtime">Real-Time</option>
                    <option value="deep">Deep</option>
                  </select>
                </Field>
              </div>
            )}

            {method==='name' && (
              <div className="form">
                <Field label="Company Name"><input className="input" placeholder="Acme Corp" value={company} onChange={e=>setCompany(e.target.value)} /></Field>
                <Field label="Geography (optional)"><input className="input" placeholder="United States" value={geo} onChange={e=>setGeo(e.target.value)} /></Field>
                <Field label="Mode">
                  <select className="select" value={mode} onChange={e=>setMode(e.target.value)}>
                    <option value="realtime">Real-Time</option>
                    <option value="deep">Deep</option>
                  </select>
                </Field>
              </div>
            )}

            {method==='bulk' && (
              <div className="form">
                <div className="small">Upload CSV/XLSX with columns: url or website; OR company and geography.</div>
                <input type="file" className="input" onChange={e=>setFile(e.target.files?.[0] || null)} />
                <Field label="Mode">
                  <select className="select" value={mode} onChange={e=>setMode(e.target.value)}>
                    <option value="realtime">Real-Time</option>
                    <option value="deep">Deep</option>
                  </select>
                </Field>
              </div>
            )}

            <div style={{display:'flex',gap:12,alignItems:'center',marginTop:12}}>
              <button className="btn" onClick={onRun} disabled={loading || (method==='url' && !url) || (method==='name' && !company) || (method==='bulk' && !file)}>{loading? 'Scraping…':'Run'}</button>
              {job && (
                <a className="badge" href={downloadHref} target="_blank" rel="noreferrer"><span className="dot"/> Download Excel</a>
              )}
            </div>

            {loading && <div style={{marginTop:12}}><ProgressInline running={loading}/></div>}
            {error && <div className="card" style={{borderColor:'#5b0f12', background:'rgba(255,100,100,0.06)', marginTop:12}}>{error}</div>}

            <div className="kpis" style={{marginTop:16}}>
              <div className="kpi"><h4>Inputs</h4><div className="v">URL • Name+Geo • Bulk</div></div>
              <div className="kpi"><h4>Export</h4><div className="v">Excel</div></div>
              <div className="kpi"><h4>AI</h4><div className="v">Gemini</div></div>
            </div>
          </div>

          <div className="card panel">
            <h3 style={{margin:0}}>About</h3>
            <p className="small" style={{lineHeight:1.8}}>Shoreway Exim Scrapper is a precision data engine for company intelligence. It crawls official sites, reads public pages, and uses AI to produce clean, ready‑to‑use profiles. Built for international sourcing, vendor onboarding, and sales prospecting.</p>
            <ul className="small" style={{lineHeight:1.8,marginTop:8}}>
              <li>Real-time or deep multi‑page crawl</li>
              <li>Automatic social profiles, phones, emails</li>
              <li>Instant Excel export with verification flags</li>
              <li>Bulk ingestion for lists from CSV/XLSX</li>
            </ul>
          </div>
        </div>

        {data && (
          <div className="result">
            <div className="card">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <h3 style={{margin:0}}>Extracted Data</h3>
                {job && <a className="badge" href={downloadHref} target="_blank" rel="noreferrer"><span className="dot"/> Download Excel</a>}
              </div>
              <table className="table"><tbody>{pairs.map(({k,v}) => <Pair key={k} k={k} v={v} />)}</tbody></table>
            </div>
          </div>
        )}

        {bulkInfo && (
          <div className="result">
            <div className="card">
              <h3 style={{marginTop:0}}>Bulk Results</h3>
              <div className="small">Processed rows: {bulkInfo.rows}. {bulkInfo.errors?.length? `Errors: ${bulkInfo.errors.length}`: ''}</div>
              {job && <div style={{marginTop:8}}><a className="badge" href={downloadHref} target="_blank" rel="noreferrer"><span className="dot"/> Download Consolidated Excel</a></div>}
            </div>
          </div>
        )}

        <div className="footer small">© {new Date().getFullYear()} Shoreway Exim Scrapper. Clean, minimal, glass UI—built for speed.</div>
      </div>
    </div>
  );
}

export default App;