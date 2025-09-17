// src/pages/Stock.jsx — light-first UI with manual theme toggle (no deps)
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line
} from "recharts";

const API =
  process.env.REACT_APP_BACKEND_URL ||
  process.env.REACT_APP_API_URL ||
  "http://localhost:5000";

/* --------------------------------------------------------------
   Inline design system (CSS variables) — light-first
   Dark styles apply ONLY when a parent has class "dark"
-------------------------------------------------------------- */
const InjectStyles = () => (
  <style>{`
    :root{
      --bg:#f6f7fb; --card:#ffffff; --muted:#6b7280; --text:#111827;
      --primary:#1e40af; --primary-600:#1d4ed8; --primary-700:#1e3a8a;
      --danger:#dc2626; --ring:#dbeafe; --border:#e5e7eb;
      --shadow:0 1px 3px rgba(0,0,0,0.08),0 1px 2px rgba(0,0,0,0.04);
      --radius:16px; --radius-sm:10px; --pad:16px; --gap:12px;
      --fs-sm: clamp(12px, 1.4vw, 14px);
      --fs-md: clamp(14px, 1.6vw, 16px);
      --fs-lg: clamp(18px, 2.0vw, 22px);
      --table-even:#f9fafb;
      --table-hover:#eef2ff;
      --pill-neutral-bg:#f3f4f6; --pill-neutral-text:#374151;
      --pill-good-bg:#dcfce7; --pill-good-text:#166534;
      --pill-bad-bg:#fee2e2; --pill-bad-text:#991b1b;
      --badge-bg:#eef2ff; --badge-text:#4338ca;
      --input-bg:#fff; --modal-bg:#fff;
    }

    /* Dark theme overrides ONLY when .dark is on a parent container */
    .dark{
      --bg:#0b1020; --card:#0f162b; --text:#f8fafc; --muted:#9aa4b2;
      --border:#1f2a44; --ring:#172554;
      --table-even:#0c1326; --table-hover:#172042;
      --pill-neutral-bg:#1f2937; --pill-neutral-text:#e5e7eb;
      --pill-good-bg:#052e16; --pill-good-text:#86efac;
      --pill-bad-bg:#3b0a0a; --pill-bad-text:#fecaca;
      --badge-bg:#1f2a55; --badge-text:#c7d2fe;
      --input-bg:#0f162b; --modal-bg:#0f162b;
    }

    *{box-sizing:border-box}
    body{margin:0;background:var(--bg); color:var(--text); font-size:var(--fs-md);}

    .page{max-width:1200px;margin:0 auto;padding:clamp(12px,2vw,24px)}
    .title{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin:0 0 12px}
    .title h2{margin:0;color:var(--primary); font-size:var(--fs-lg)}
    .subtitle{color:var(--muted);font-size:var(--fs-sm)}

    .toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}
    .pill{padding:4px 12px;border-radius:999px;border:1px solid var(--border);font-weight:600}
    .pill.neutral{background:var(--pill-neutral-bg);color:var(--pill-neutral-text)}
    .pill.good{background:var(--pill-good-bg);color:var(--pill-good-text)}
    .pill.bad{background:var(--pill-bad-bg);color:var(--pill-bad-text)}

    .btn{appearance:none;border:1px solid var(--border);background:var(--card);padding:10px 14px;border-radius:12px;cursor:pointer;font-weight:600;box-shadow:var(--shadow);min-height:44px;color:var(--text)}
    .btn:hover{transform:translateY(-1px)}
    .btn.primary{background:var(--primary);border-color:transparent;color:#fff}
    .btn.danger{background:var(--danger);border-color:transparent;color:#fff}
    .btn.gray{background:#4b5563;border-color:transparent;color:#fff}
    .btn:disabled{opacity:.6;cursor:not-allowed}

    .input, .select{
      width:100%;padding:12px;border:1px solid var(--border);border-radius:12px;
      background:var(--input-bg);outline:none;min-height:44px;font-size:var(--fs-md);color:var(--text)
    }
    .input:focus, .select:focus{border-color:var(--primary-600);box-shadow:0 0 0 4px var(--ring)}

    .grid{display:grid;gap:var(--gap)}
    .grid-4{grid-template-columns:repeat(4,1fr)}
    .grid-3{grid-template-columns:repeat(3,1fr)}
    .grid-2{grid-template-columns:repeat(2,1fr)}
    @media (max-width: 900px){.grid-4{grid-template-columns:repeat(2,1fr)}.grid-3{grid-template-columns:1fr}.grid-2{grid-template-columns:1fr}}

    .card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:var(--pad);box-shadow:var(--shadow)}
    .panel h3{margin:0 0 12px 0}
    .kpi-label{font-size:var(--fs-sm);color:var(--muted)}
    .kpi-value{font-size:clamp(22px,2.4vw,30px);font-weight:800}
    .error{margin:6px 0 12px;padding:12px;border:1px solid #fca5a5;background:#fee2e2;border-radius:10px;color:#991b1b}
    .hint{color:var(--muted);font-size:var(--fs-sm)}

    .table-wrap{margin-top:12px;overflow:auto;border-radius:12px;box-shadow:var(--shadow)}
    table{width:100%;border-collapse:separate;border-spacing:0}
    thead th{
      position:sticky;top:0;background:var(--primary);color:#fff;text-align:left;
      padding:10px;border-right:1px solid rgba(255,255,255,.15);font-size:var(--fs-sm)
    }
    thead th:last-child{border-right:none}
    tbody td{
      padding:10px;border-bottom:1px solid var(--border);background:var(--card);
      color:var(--text);vertical-align:top
    }
    tbody tr:nth-child(2n) td{background:var(--table-even)}
    tbody tr:hover td{background:var(--table-hover)}
    .badge{padding:2px 8px;border-radius:999px;background:var(--badge-bg);color:var(--badge-text);font-weight:600;font-size:12px}
    .actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
    .charts{display:grid;grid-template-columns:2fr 1fr;gap:16px}
    @media (max-width: 1000px){.charts{grid-template-columns:1fr}}
    .form-row{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:12px}
    @media (max-width: 900px){.form-row{grid-template-columns:1fr}}
    .searchbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .switch{display:inline-flex;align-items:center;gap:6px}
    .switch input{accent-color:var(--primary)}

    /* Phones: table -> cards */
    @media (max-width: 720px){
      thead{display:none}
      table, tbody, tr, td{display:block; width:100%}
      tbody tr{
        border:1px solid var(--border);
        border-radius:12px;
        margin:12px 0;
        overflow:hidden;
        background:var(--card);
        box-shadow:var(--shadow);
      }
      tbody td{
        display:grid;
        grid-template-columns:minmax(110px, 40%) 1fr;
        gap:10px;
        background:transparent;
        padding:12px 14px;
      }
      tbody td::before{
        content:attr(data-label);
        font-weight:600;
        color:var(--muted);
      }
      .cell-val{ word-break:break-word; overflow-wrap:anywhere; }
      tbody td + td{ border-top:1px solid var(--border); }
      td[data-label="Action"] .actions,
      td[data-label="Actions"] .actions{ justify-content:flex-end; }
    }

    /* Modal */
    .modal-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:1000; padding:16px; }
    .modal-card{ width:min(560px,100%); background:var(--modal-bg); border:1px solid var(--border); border-radius:16px; padding:16px; box-shadow:0 8px 28px rgba(0,0,0,.2); color:var(--text); }
  `}</style>
);

/* -------------------- utils: friendly dates -------------------- */
const fmtDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(d);
};
const fmtDateTime = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(d);
};

/* -------------------- Edit Modal -------------------- */
function EditModal({ open, value, onChange, onSave, onClose, saving }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit stock item">
      <div className="modal-card">
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
          <h3 style={{margin:0}}>✏️ Edit Stock</h3>
          <button className="btn gray" onClick={onClose} disabled={saving}>Close</button>
        </div>

        <div className="grid grid-3">
          <div>
            <label className="kpi-label">Medicine name</label>
            <input className="input" value={value.medicine_name || ""} onChange={(e)=>onChange({...value, medicine_name:e.target.value})} />
          </div>
          <div>
            <label className="kpi-label">Quantity</label>
            <input className="input" type="number" value={value.quantity ?? ""} onChange={(e)=>onChange({...value, quantity:e.target.value})} />
          </div>
          <div>
            <label className="kpi-label">Expiration</label>
            <input className="input" type="date" value={(value.expiration_date || "").slice(0,10)} onChange={(e)=>onChange({...value, expiration_date:e.target.value})} />
          </div>
        </div>

        <div style={{display:"flex", justifyContent:"flex-end", gap:8, marginTop:12}}>
          <button className="btn primary" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}

export default function Stock(){
  // theme state (light-first)
  const [theme, setTheme] = useState(() => localStorage.getItem("ui-theme") || "light");
  useEffect(() => { localStorage.setItem("ui-theme", theme); }, [theme]);

  // table + form
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ medicine_name: "", quantity: "", expiration_date: "" });
  const [error, setError] = useState("");

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editVal, setEditVal] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  // ML state
  const now = new Date();
  const [horizon, setHorizon] = useState(6);
  const [loadingCharts, setLoadingCharts] = useState(true);
  const [forecastRows, setForecastRows] = useState([]);
  const [peaks, setPeaks] = useState([]);
  const [restockPlan, setRestockPlan] = useState([]);
  const [mlOk, setMlOk] = useState(null);
  const [mlMsg, setMlMsg] = useState("");

  // Dataset upload state
  const [uploading, setUploading] = useState(false);
  const [dsInfo, setDsInfo] = useState(null);

  // Local UX state
  const [query, setQuery] = useState("");
  const [zeroOnly, setZeroOnly] = useState(false);
  const [expSoon, setExpSoon] = useState(false);

  /* ------------------------------------------
     Load table (current inventory)
  ------------------------------------------ */
  const loadTable = async () => {
    try {
      setError("");
      const res = await axios.get(`${API}/stock`);
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Failed to load stock.");
      setItems([]);
    }
  };

  const buildCurrentStockPayload = () => {
    const map = new Map();
    for (const it of items) {
      const name = (it.medicine_name || "").trim();
      const qty = Number(it.quantity || 0);
      map.set(name, (map.get(name) || 0) + qty);
    }
    return Array.from(map.entries()).map(([medicine, current_stock]) => ({ medicine, current_stock }));
  };

  async function pingML(){
    try{
      const { data } = await axios.get(`${API}/stock/analytics/ping`);
      setMlOk(!!data?.ok);
      setMlMsg(data?.ok ? `OK ${data?.status || ""}` : "ML not reachable");
    }catch(e){
      setMlOk(false);
      setMlMsg(e?.response?.data?.error || e.message);
    }
  }
  async function refreshDatasetInfo(){
    try{
      const { data } = await axios.get(`${API}/stock/analytics/dataset`);
      setDsInfo(data);
    }catch{
      setDsInfo(null);
    }
  }
  async function handleUpload(e){
    const file = e.target.files?.[0];
    if(!file) return;
    setUploading(true);
    try{
      const fd = new FormData();
      fd.append("file", file);
      await axios.post(`${API}/stock/analytics/dataset`, fd, { headers: { "Content-Type": "multipart/form-data" }});
      await refreshDatasetInfo();
      await loadCharts();
      alert("Dataset uploaded ✔");
    }catch(err){
      alert(`Upload failed: ${err?.response?.data?.detail || err.message}`);
    }finally{
      setUploading(false);
      e.target.value = "";
    }
  }

  const loadCharts = async () => {
    setLoadingCharts(true);
    let hadError = false;
    try{
      const { data: f } = await axios.get(`${API}/stock/analytics/forecast`, { params: { horizon } });
      setForecastRows(Array.isArray(f) ? f : []);
    }catch(e){ setForecastRows([]); hadError = true; setError(prev => prev || "Forecast service not reachable."); }
    try{
      const { data: s } = await axios.get(`${API}/stock/analytics/seasonality`);
      setPeaks(Array.isArray(s) ? s : []);
    }catch(e){ setPeaks([]); hadError = true; }
    try{
      const payload = { current_stock: buildCurrentStockPayload(), horizon };
      const { data: r } = await axios.post(`${API}/stock/analytics/restock`, payload);
      setRestockPlan(Array.isArray(r) ? r : []);
    }catch(e){ setRestockPlan([]); hadError = true; }
    if(!hadError) setError("");
    setLoadingCharts(false);
  };

  useEffect(() => {
    (async () => {
      await loadTable();
      await refreshDatasetInfo();
      await pingML();
      await loadCharts();
    })();
  }, []);

  useEffect(() => { loadCharts(); /* eslint-disable-line */ }, [horizon, items]);

  const save = async () => {
    setError("");
    try{
      const body = {
        medicine_name: (form.medicine_name || "").trim(),
        quantity: Number(form.quantity || 0),
        expiration_date: form.expiration_date || null
      };
      if(!body.medicine_name) return alert("Medicine name is required");
      await axios.post(`${API}/stock`, body);
      setForm({ medicine_name: "", quantity: "", expiration_date: "" });
      await loadTable();
      await loadCharts();
    }catch(err){
      setError(err?.response?.data?.error || err?.message || "Failed to save.");
    }
  };

  const remove = async (id) => {
    if(!window.confirm("Delete item?")) return;
    setError("");
    try{
      await axios.delete(`${API}/stock/${id}`);
      await loadTable();
      await loadCharts();
    }catch(err){
      setError(err?.response?.data?.error || err?.message || "Failed to delete.");
    }
  };

  // begin edit
  const beginEdit = (row) => {
    setEditVal({
      id: row.id,
      medicine_name: row.medicine_name || "",
      quantity: row.quantity ?? "",
      expiration_date: (row.expiration_date || "").slice(0,10),
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    const v = editVal || {};
    if (!v.id) return;
    if (!v.medicine_name) return alert("Medicine name is required");
    if (v.quantity === "" || isNaN(Number(v.quantity))) return alert("Quantity must be a number");

    const payload = {
      medicine_name: String(v.medicine_name).trim(),
      quantity: Number(v.quantity),
      expiration_date: v.expiration_date || null,
    };

    setEditSaving(true);
    try{
      await axios.put(`${API}/stock/${v.id}`, payload);
      setEditOpen(false);
      await loadTable();
      await loadCharts();
    }catch(err){
      alert(`Failed to update: ${err?.response?.data?.error || err.message}`);
    }finally{
      setEditSaving(false);
    }
  };

  /* ------------- filters / KPIs / charts data ------------- */
  const filteredItems = useMemo(() => {
    let rows = items;
    if(query.trim()){
      const q = query.trim().toLowerCase();
      rows = rows.filter(r => (r.medicine_name || '').toLowerCase().includes(q));
    }
    if(zeroOnly){ rows = rows.filter(r => Number(r.quantity || 0) === 0); }
    if(expSoon){
      const in30 = Date.now() + 30*24*60*60*1000;
      rows = rows.filter(r => {
        if(!r.expiration_date) return false;
        const d = new Date(r.expiration_date).getTime();
        return !Number.isNaN(d) && d <= in30;
      });
    }
    return rows;
  }, [items, query, zeroOnly, expSoon]);

  const kpis = useMemo(() => {
    const totalItems = items.length;
    const totalUnits = items.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const zeroCount = items.filter(r => Number(r.quantity || 0) === 0).length;
    let nextMonthTotal = 0;
    if(forecastRows.length){
      const firstMonth = forecastRows.map(r => r.forecast_month).sort((a,b)=>a<b?-1:a>b?1:0)[0];
      nextMonthTotal = forecastRows
        .filter(r => r.forecast_month === firstMonth)
        .reduce((s,r)=> s + (Number(r.forecast_qty)||0), 0);
    }
    return { totalItems, totalUnits, zeroCount, nextMonthTotal: Number(nextMonthTotal.toFixed(2)) };
  }, [items, forecastRows]);

  const pieData = useMemo(() => {
    const nonzero = items.filter(r => (Number(r.quantity) || 0) > 0).length;
    const zero = items.length - nonzero;
    return [{ name: "In Stock", value: nonzero }, { name: "Zero", value: zero }];
  }, [items]);

  const topForecast = useMemo(() => {
    if(!forecastRows.length) return [];
    const firstMonth = forecastRows.map(r => r.forecast_month).sort((a,b)=>a<b?-1:a>b?1:0)[0];
    return forecastRows
      .filter(r => r.forecast_month === firstMonth)
      .sort((a,b)=> (b.forecast_qty||0) - (a.forecast_qty||0))
      .slice(0,10)
      .map(r => ({ name: r.medicine, value: Number(r.forecast_qty)||0 }));
  }, [forecastRows]);

  const monthsDiff = (yyyymm) => {
    try{
      const [y,m] = yyyymm.split("-").map(Number);
      const nowY = now.getFullYear();
      const nowM = now.getMonth()+1;
      return (y - nowY) * 12 + (m - nowM);
    }catch{ return null; }
  };

  const stockoutHorizon = useMemo(() => {
    if(!restockPlan.length) return [];
    return restockPlan
      .filter(r => r.restock_month)
      .map(r => ({ name: r.medicine, months: monthsDiff(r.restock_month) }))
      .filter(d => d.months != null && d.months >= 0)
      .sort((a,b)=> a.months - b.months)
      .slice(0,15);
  }, [restockPlan]);

  const peakMap = useMemo(() => {
    const m = new Map();
    for(const p of peaks) m.set(p.medicine, p.peak_month_name);
    return m;
  }, [peaks]);

  return (
    <div className={theme === "dark" ? "page dark" : "page"}>
      <InjectStyles/>

      <div className="title">
        <h2>📦 Inventory / Stock</h2>
        <span className="subtitle">Track quantities, forecast demand, and plan restocks.</span>
      </div>

      {/* ML status + dataset uploader + theme toggle */}
      <div className="toolbar">
        <span className={`pill ${mlOk==null?"neutral":mlOk?"good":"bad"}`} aria-live="polite">
          ML: {mlOk==null?"…":mlOk?"Online":"Offline"} {mlMsg?`• ${mlMsg}`:""}
        </span>

        <label style={{fontWeight:600}}>Dataset (.xlsx):</label>
        <input aria-label="Upload dataset (.xlsx)" type="file" accept=".xlsx" onChange={handleUpload} disabled={uploading} />
        <button className="btn" onClick={()=>{ pingML(); loadCharts(); }} disabled={uploading}>
          {uploading?"Uploading…":"🔄 Refresh"}
        </button>
        {dsInfo?.exists && (
          <span className="hint">
            Current: {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(dsInfo.mtime))}
            {" · "}
            {Math.max(1, Math.round((dsInfo.bytes || 0)/1024))} KB
          </span>
        )}

        <div className="switch" style={{marginLeft:"auto"}}>
          <input
            id="themeToggle"
            type="checkbox"
            checked={theme==="dark"}
            onChange={(e)=> setTheme(e.target.checked ? "dark" : "light")}
            aria-label="Toggle dark mode"
          />
          <label htmlFor="themeToggle">{theme==="dark" ? "Dark" : "Light"} mode</label>
        </div>
      </div>

      {error && <div className="error" role="alert">{error}</div>}

      {/* Controls for ML charts */}
      <div className="card" role="group" aria-label="Forecast controls">
        <div className="grid grid-2" style={{alignItems:"center"}}>
          <div>
            <label className="kpi-label">Forecast horizon (months)</label>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12,alignItems:"center"}}>
              <input className="input" type="range" min="3" max="12" value={horizon} onChange={e=>setHorizon(Number(e.target.value))} />
              <input className="input" style={{width:90}} type="number" min="3" max="12" value={horizon} onChange={e=>setHorizon(Number(e.target.value))} />
            </div>
            {loadingCharts && <div className="hint" style={{marginTop:8}}>Loading analytics…</div>}
          </div>
          <div className="searchbar" style={{justifyContent:"flex-end"}}>
            <input className="input" placeholder="Search medicine…" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search medicine"/>
            <label className="switch">
              <input type="checkbox" checked={zeroOnly} onChange={e=>setZeroOnly(e.target.checked)} /> Zero-stock only
            </label>
            <label className="switch">
              <input type="checkbox" checked={expSoon} onChange={e=>setExpSoon(e.target.checked)} /> Expiring in 30d
            </label>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-4" style={{marginTop:12, marginBottom:12}}>
        <KPI label="Items" value={kpis.totalItems} />
        <KPI label="Units on Hand" value={kpis.totalUnits} />
        <KPI label="Zero-Stock Items" value={kpis.zeroCount} />
        <KPI label="Next-Month Forecast (sum)" value={kpis.nextMonthTotal} />
      </div>

      {/* Charts */}
      <div className="charts">
        <Panel title="Top Forecast (Next Month)">
          <div style={{width:"100%",height:340}}>
            <ResponsiveContainer>
              <BarChart data={topForecast}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-30} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Stock Status">
          <div style={{width:"100%",height:340}}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={110}>
                  {pieData.map((_, i) => <Cell key={i} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Months Until Restock (Nearest 15)">
        <div style={{width:"100%",height:340}}>
          <ResponsiveContainer>
            <LineChart data={stockoutHorizon}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-30} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="months" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {!restockPlan.length && <p className="hint" style={{marginTop:8}}>Restock plan appears once the ML service is reachable.</p>}
      </Panel>

      {/* Form */}
      <div className="card">
        <h3 style={{marginTop:0}}>Add / Increment Stock</h3>
        <div className="form-row">
          <div>
            <label className="kpi-label">Medicine name</label>
            <input className="input" placeholder="e.g. Amoxicillin" value={form.medicine_name} onChange={e=> setForm({ ...form, medicine_name: e.target.value })} />
          </div>
          <div>
            <label className="kpi-label">Quantity</label>
            <input className="input" type="number" placeholder="0" value={form.quantity} onChange={e=> setForm({ ...form, quantity: e.target.value })} />
          </div>
          <div>
            <label className="kpi-label">Expiration</label>
            <input className="input" type="date" value={form.expiration_date} onChange={e=> setForm({ ...form, expiration_date: e.target.value })} />
          </div>
          <div style={{alignSelf:"end"}}>
            <button className="btn primary" onClick={save}>➕ Add / Increment</button>
          </div>
        </div>
      </div>

      {/* Table */}
      <h3 style={{marginTop:16, marginBottom:8}}>Current Inventory</h3>
      <div className="table-wrap stock-table" role="region" aria-label="Inventory table">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Medicine</th>
              <th>Quantity</th>
              <th>Peak Month</th>
              <th>Expiration</th>
              <th>Last Updated</th>
              <th style={{textAlign:"right"}}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((it) => (
              <tr key={it.id}>
                <td data-label="ID"><span className="cell-val">{it.id}</span></td>
                <td data-label="Medicine"><span className="cell-val">{it.medicine_name}</span></td>
                <td data-label="Quantity"><span className="cell-val">{it.quantity}</span></td>
                <td data-label="Peak Month">
                  <span className="cell-val">
                    {peakMap.get(it.medicine_name) ? <span className="badge">{peakMap.get(it.medicine_name)}</span> : "—"}
                  </span>
                </td>
                <td data-label="Expiration"><span className="cell-val">{fmtDate(it.expiration_date)}</span></td>
                <td data-label="Last Updated"><span className="cell-val">{fmtDateTime(it.last_updated)}</span></td>
                <td data-label="Action" style={{textAlign:"right"}}>
                  <div className="actions">
                    <button className="btn" onClick={()=>beginEdit(it)} aria-label={`Edit ${it.medicine_name}`}>✏️ Edit</button>
                    <button className="btn danger" onClick={()=> remove(it.id)} aria-label={`Delete ${it.medicine_name}`}>❌ Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {!filteredItems.length && (
              <tr>
                <td data-label="Info" colSpan={7} style={{textAlign:"center",padding:16,color:"var(--muted)"}}>No matching items</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EditModal
        open={editOpen}
        value={editVal}
        onChange={setEditVal}
        onSave={saveEdit}
        onClose={()=>setEditOpen(false)}
        saving={editSaving}
      />
    </div>
  );
}

function KPI({ label, value }){
  return (
    <div className="card" style={{borderRadius:"14px"}}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

function Panel({ title, children }){
  return (
    <div className="card panel" style={{marginTop:12, marginBottom:12}}>
      <h3 style={{marginTop:0}}>{title}</h3>
      {children}
    </div>
  );
}
