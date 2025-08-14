import { useEffect, useMemo, useRef, useState } from "react";
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
  {k:"ai", t:"Extracting structured data"},
  {k:"export", t:"Exporting Excel"},
];

function ProgressInline({running}){
  const [p, setP] = useState(0);
  const [idx, setIdx] = useState(0);
  useEffect(()=>{
    if(!running){ setP(0); setIdx(0); return; }
    let sec = 0; const tm = setInterval(()=>{
      sec += 0.25;
      const ratio = Math.min(1, sec/15);
      setP(Math.floor(ratio*100));
      setIdx(Math.min(steps.length-1, Math.floor(ratio*steps.length)));
    }, 250);
    return ()=> clearInterval(tm);
  },[running]);
  return (
    <div className="card" style={{padding:16}}>
      <div className="small" style={{marginBottom:8,color:"var(--muted)"}}>{steps[idx].t}</div>
      <div className="progress"><div className="progress-fill" style={{width:`${p}%`}}/></div>
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

  // Session state
  const [sessionId, setSessionId] = useState("");
  const [addToSession, setAddToSession] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

  const featuresRef = useRef(null);
  const docsRef = useRef(null);
  const supportRef = useRef(null);

  useEffect(() => { axios.get(`${API}/`).catch(()=>{}); }, []);

  const ensureSession = async () => {
    if(sessionId) return sessionId;
    const res = await axios.post(`${API}/session/start`);
    setSessionId(res.data.session_id);
    return res.data.session_id;
  };

  const refreshSession = async (sid) => {
    const res = await axios.get(`${API}/session/${sid}`);
    setSessionCount(res.data.count || 0);
  };

  const runUrl = async () => {
    setLoading(true); setError(""); setData(null); setJob(null); setBulkInfo(null);
    try {
      if(addToSession){
        const sid = await ensureSession();
        const form = new FormData();
        form.append('session_id', sid);
        form.append('url', url);
        form.append('mode', mode);
        await axios.post(`${API}/session/add/url`, form);
        await refreshSession(sid);
      } else {
        const res = await axios.post(`${API}/scrape/url`, { url, mode });
        setData(res.data.data);
        setJob(res.data);
      }
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message;
      setError(msg);
    } finally { setLoading(false); }
  };

  const runName = async () => {
    setLoading(true); setError(""); setData(null); setJob(null); setBulkInfo(null);
    try {
      if(addToSession){
        const sid = await ensureSession();
        const form = new FormData();
        form.append('session_id', sid);
        form.append('company_name', company);
        form.append('geography', geo);
        form.append('mode', mode);
        await axios.post(`${API}/session/add/name`, form);
        await refreshSession(sid);
      } else {
        const res = await axios.post(`${API}/scrape/name`, { company_name: company, geography: geo, mode });
        setData(res.data.data);
        setJob(res.data);
      }
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
  const sessionDownloadHref = useMemo(() => sessionId ? `${API}/session/${sessionId}/download` : "#", [sessionId]);

  const pairs = useMemo(()=>{
    if(!data) return [];
    const order = [
      "Company Name","Website","Industry","Description","Services","Address","Country","State","City","Postal Code","Phone","Email","Social Media Links","Founders/Key People","Verification Status"
    ];
    return order.map(k => ({k, v: data[k]}));
  }, [data]);

  const scrollTo = (ref) => { if(ref?.current){ ref.current.scrollIntoView({behavior:'smooth', block:'start'}); } };

  return (
    <div>
      <div className="container">
        <div className="header">
          <div className="brand">
            <span className="dot"/>
            <h1>SHOREWAY EXIM SCRAPPER</h1>
          </div>
          <div className="nav">
            <a href="#features" onClick={(e)=>{e.preventDefault(); scrollTo(featuresRef);}}>Features</a>
            <a href="#docs" onClick={(e)=>{e.preventDefault(); scrollTo(docsRef);}}>Docs</a>
            <a href="#support" onClick={(e)=>{e.preventDefault(); scrollTo(supportRef);}}>Support</a>
          </div>
        </div>

        {/* Session controls */}
        <div className="card" style={{marginTop:16, display:'flex', alignItems:'center', gap:12}}>
          <label className="small" style={{display:'flex', alignItems:'center', gap:8}}>
            <input type="checkbox" checked={addToSession} onChange={e=>setAddToSession(e.target.checked)} />
            Add each run to a session (single combined download)
          </label>
          {!sessionId && addToSession && (
            <button className="badge" onClick={async()=>{const s = await ensureSession(); await refreshSession(s);}}>Start Session</button>
          )}
          {sessionId && (
            <>
              <span className="badge">Session: {sessionCount} item(s)</span>
              {sessionCount>0 && <a className="badge" href={sessionDownloadHref} target="_blank" rel="noreferrer">Download All</a>}
            </>
          )}
        </div>

        <div className="hero">
          <div className="card">
            <h2 className="title">Global company data, in one click</h2>
            <p className="subtitle">Crawl websites, extract structured profiles with AI, and export clean Excel files. Works for single URLs, company + geography lookup, and bulk lists. Designed for sourcing, compliance, and go‑to‑market teams.</p>

            <div className="badge" style={{marginBottom:12}}>
              <span className="dot"/> AI‑powered data extraction (provider agnostic)
            </div>

            <div style={{display:'flex',gap:8,marginBottom:12}}>
              <button className="badge" onClick={()=>setMethod('url')} style={{borderColor: method==='url'? '#0b0d10':'#e5e7eb'}}>Single URL</button>
              <button className="badge" onClick={()=>setMethod('name')} style={{borderColor: method==='name'? '#0b0d10':'#e5e7eb'}}>Name + Geography</button>
              <button className="badge" onClick={()=>setMethod('bulk')} style={{borderColor: method==='bulk'? '#0b0d10':'#e5e7eb'}}>Bulk Upload</button>
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
                <a className="badge" href={downloadHref} target="_blank" rel="noreferrer">Download Excel</a>
              )}
            </div>

            {loading && <div style={{marginTop:12}}><ProgressInline running={loading}/></div>}
            {error && <div className="card" style={{borderColor:'#ef4444', background:'#fff1f2', marginTop:12, color:'#991b1b'}}>{error}</div>}

            <div className="kpis" style={{marginTop:16}}>
              <div className="kpi"><h4>Inputs</h4><div className="v">URL • Name+Geo • Bulk</div></div>
              <div className="kpi"><h4>Export</h4><div className="v">Excel</div></div>
              <div className="kpi"><h4>AI</h4><div className="v">Engine</div></div>
            </div>
          </div>

          <div className="card panel" ref={featuresRef} id="features">
            <h3 style={{margin:0}}>Features</h3>
            <ul className="small" style={{lineHeight:1.8, marginTop:8, color:'var(--text)'}}>
              <li>Real-time or deep multi‑page crawling for richer context</li>
              <li>Automatic discovery of social links, emails, and phone numbers</li>
              <li>Schema‑mapped output with instant Excel export</li>
              <li>Bulk ingestion for CSV/XLSX with error reporting</li>
            </ul>
          </div>
        </div>

        <div className="card" ref={docsRef} id="docs" style={{marginTop:24}}>
          <h3 style={{marginTop:0}}>Docs</h3>
          <ol className="small" style={{lineHeight:1.9, color:'var(--text)'}}>
            <li>Single URL: paste the official website and click Run.</li>
            <li>Name + Geography: enter company and optional geography; we locate the official site using AI-only resolution when search is unavailable.</li>
            <li>Bulk: upload CSV/XLSX containing url/website or company + geography columns. Download consolidated Excel.</li>
            <li>Modes: Real-Time (fast) or Deep (multi‑page) crawl.</li>
          </ol>
        </div>

        {data && (
          <div className="result">
            <div className="card">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <h3 style={{margin:0}}>Extracted Data</h3>
                {job && <a className="badge" href={downloadHref} target="_blank" rel="noreferrer">Download Excel</a>}
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
              {job && <div style={{marginTop:8}}><a className="badge" href={downloadHref} target="_blank" rel="noreferrer">Download Consolidated Excel</a></div>}
            </div>
          </div>
        )}

        <div className="card" ref={supportRef} id="support" style={{marginTop:24}}>
          <h3 style={{marginTop:0}}>Support</h3>
          <div className="small" style={{color:'var(--text)'}}>We’re here to help. Reach us at:</div>
          <ul className="small" style={{lineHeight:1.9, marginTop:8}}>
            <li>Phone: <a href="tel:8376890776" className="link">8376890776</a></li>
            <li>Email: <a href="mailto:RAHUL@THEGAMINGHUB.IO" className="link">RAHUL@THEGAMINGHUB.IO</a></li>
          </ul>
        </div>

        <div className="footer small">© {new Date().getFullYear()} Shoreway Exim Scrapper. Crafted with balanced typography and color contrast for clarity.</div>
      </div>
    </div>
  );
}

export default App;