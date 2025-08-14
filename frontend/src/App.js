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

function App() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState("realtime");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // smoke test call
    axios.get(`${API}/`).catch(()=>{});
  }, []);

  const onScrape = async () => {
    setLoading(true); setError(""); setData(null); setJob(null);
    try {
      const res = await axios.post(`${API}/scrape/url`, { url, mode });
      setData(res.data.data);
      setJob(res.data);
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message;
      setError(msg);
    } finally { setLoading(false); }
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
            <h1>DataHarvester</h1>
          </div>
          <div className="nav">
            <a href="#features">Features</a>
            <a href="#docs">Docs</a>
            <a href="#support">Support</a>
          </div>
        </div>

        <div className="hero">
          <div className="card">
            <h2 className="title">AI-powered company data scraper</h2>
            <p className="subtitle">Paste a company website URL. Choose Real-time (quick) or Deep (multi-page) mode. We extract, normalize, and export to Excel matching Moth.xlsx structure.</p>
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
              <div style={{display:'flex',gap:12,alignItems:'center'}}>
                <button className="btn" onClick={onScrape} disabled={loading || !url}>{loading? 'Scraping…':'Run Scrape'}</button>
                {job && (
                  <a className="badge" href={downloadHref} target="_blank" rel="noreferrer">
                    <span className="dot"/> Download Excel
                  </a>
                )}
              </div>
              {error && <div className="card" style={{borderColor:'#5b0f12', background:'rgba(255,100,100,0.06)'}}>{error}</div>}
            </div>
            <div className="kpis" style={{marginTop:16}}>
              <div className="kpi"><h4>Verification</h4><div className="v">Basic</div></div>
              <div className="kpi"><h4>Export</h4><div className="v">Excel</div></div>
              <div className="kpi"><h4>AI</h4><div className="v">Gemini</div></div>
            </div>
          </div>
          <div className="card panel">
            <h3 style={{margin:0}}>How it works</h3>
            <ol className="small" style={{lineHeight:1.8}}>
              <li>We crawl the URL (quick in Real-Time, broader in Deep).</li>
              <li>Gemini cleans and maps content to our fixed schema.</li>
              <li>We export to Excel aligned to Moth.xlsx columns.</li>
              <li>Download instantly from the dashboard.</li>
            </ol>
            <div className="small">Coming next: Name+Geo search, email/phone verification APIs, CRM push.</div>
          </div>
        </div>

        {data && (
          <div className="result">
            <div className="card">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <h3 style={{margin:0}}>Extracted Data</h3>
                {job && <a className="badge" href={downloadHref} target="_blank" rel="noreferrer"><span className="dot"/> Download Excel</a>}
              </div>
              <table className="table">
                <tbody>
                  {pairs.map(({k,v}) => <Pair key={k} k={k} v={v} />)}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="footer small">
          © {new Date().getFullYear()} DataHarvester. Clean, minimal, glass UI. Built for speed.
        </div>
      </div>
    </div>
  );
}

export default App;