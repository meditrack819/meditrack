// src/pages/Stock.jsx — Updated with Stock vs Demand comparison
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, ReferenceLine
} from "recharts";

const API =
  process.env.REACT_APP_BACKEND_URL ||
  process.env.REACT_APP_API_URL ||
  "http://localhost:5000/api";

// ML backend (FastAPI/uvicorn) — must match .env
const ML_API = process.env.REACT_APP_ML_API || "http://127.0.0.1:8000/api/ml";

console.log("🔍 Using ML API:", ML_API);

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
    .warning{margin:6px 0 12px;padding:12px;border:1px solid #fbbf24;background:#fef3c7;border-radius:10px;color:#92400e}
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
    .charts{display:grid;grid-template-columns:1fr;gap:16px}
    .form-row{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:12px}
    @media (max-width: 900px){.form-row{grid-template-columns:1fr}}
    .searchbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .switch{display:inline-flex;align-items:center;gap:6px}
    .switch input{accent-color:var(--primary)}

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

    .modal-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:1000; padding:16px; }
    .modal-card{ width:min(560px,100%); background:var(--modal-bg); border:1px solid var(--border); border-radius:16px; padding:16px; box-shadow:0 8px 28px rgba(0,0,0,.2); color:var(--text); }
  `}</style>
);

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
const fmtMonthName = (ym) => {
  if (!ym) return "N/A";
  const [y,m] = ym.split("-").map(Number);
  return new Date(y,m-1,1).toLocaleDateString(undefined,{month:"short",year:"numeric"});
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
  const [theme, setTheme] = useState(() => localStorage.getItem("ui-theme") || "light");
  useEffect(() => { localStorage.setItem("ui-theme", theme); }, [theme]);

  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ medicine_name: "", quantity: "", expiration_date: "" });
  const [error, setError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editVal, setEditVal] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  const [showCriticalModal, setShowCriticalModal] = useState(false);
  

  // 🧾 Stock movement logs modal state
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const loadLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await axios.get(`${API}/api/stock/movements`);
      setLogs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      alert("Failed to load stock logs");
    } finally {
      setLoadingLogs(false);
    }
  };

  // Automatically load logs when modal opens
  useEffect(() => {
    if (logsOpen) loadLogs();
  }, [logsOpen]);


  const now = new Date();
  const [horizon, setHorizon] = useState(6);
  const [loadingCharts, setLoadingCharts] = useState(true);
  const [peaks, setPeaks] = useState([]);
  const [mlOk, setMlOk] = useState(null);
  const [mlMsg, setMlMsg] = useState("");

  // 🆕 NEW: Stock vs Demand data
  const [stockVsDemand, setStockVsDemand] = useState([]);
  const [selectedMedicine, setSelectedMedicine] = useState("");

  const [query, setQuery] = useState("");
  const [zeroOnly, setZeroOnly] = useState(false);
  const [expSoon, setExpSoon] = useState(false);

  const loadTable = async () => {
    try {
      setError("");
      const res = await axios.get(`${API}/api/stock`);
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Failed to load stock.");
      setItems([]);
    }
  };

  async function pingML(){
    try{
      const { data } = await axios.get(`${ML_API}/health`);
      setMlOk(!!data?.ok);
      setMlMsg(data?.ok ? `OK ${data?.status || ""}` : "ML not reachable");
    }catch(e){
      setMlOk(false);
      setMlMsg(e?.response?.data?.error || e.message);
    }
  }

  const loadCharts = async () => {
    setLoadingCharts(true);
    let hadError = false;
    
    try{
      const { data: s } = await axios.get(`${ML_API}/seasonality_db`);
      setPeaks(Array.isArray(s) ? s : []);
    }catch(e){ 
      setPeaks([]); 
      hadError = true; 
    }

    // 🆕 NEW: Load stock vs demand data
    try{
      const { data: svd } = await axios.get(`${ML_API}/stock_vs_demand`, { 
        params: { horizon } 
      });
      setStockVsDemand(Array.isArray(svd) ? svd : []);
      
      // Auto-select first medicine if none selected
      if (svd && svd.length > 0 && !selectedMedicine) {
        const medicines = [...new Set(svd.map(r => r.medicine))];
        setSelectedMedicine(medicines[0]);
      }
    }catch(e){ 
      setStockVsDemand([]); 
      hadError = true; 
      setError(prev => prev || "Stock vs demand service not reachable."); 
    }

    if(!hadError) setError("");
    setLoadingCharts(false);
  };

  useEffect(() => {
    (async () => {
      await loadTable();
      await pingML();
      await loadCharts();
      // In save() function, after await loadCharts();
      await loadLogs(); // Refresh logs

      // In saveEdit() function, after await loadCharts();
      await loadLogs(); // Refresh logs to show the edit
    })();
  }, []);



  useEffect(() => { loadCharts(); }, [horizon]);

  const save = async () => {
    setError("");
    try{
      const body = {
        medicine_name: (form.medicine_name || "").trim(),
        quantity: Number(form.quantity || 0),
        expiration_date: form.expiration_date || null
      };
      if(!body.medicine_name) return alert("Medicine name is required");
      await axios.post(`${API}/api/stock`, body);
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
      await axios.delete(`${API}/api/stock/${id}`);
      await loadTable();
      await loadCharts();
    }catch(err){
      setError(err?.response?.data?.error || err?.message || "Failed to delete.");
    }
  };

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
      await axios.put(`${API}/api/stock/${v.id}`, payload);
      setEditOpen(false);
      await loadTable();
      await loadCharts();
    }catch(err){
      alert(`Failed to update: ${err?.response?.data?.error || err.message}`);
    }finally{
      setEditSaving(false);
    }
  };

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
    
    // Calculate critical medicines count
    const criticalMeds = [...new Set(
      stockVsDemand
        .filter(r => r.stock_status === 'critical')
        .map(r => r.medicine)
    )].length;

    // Count medicines needing immediate restock (within 2 months)
    const needsRestockNow = [...new Set(
      stockVsDemand
        .filter(r => {
          if (r.stock_status !== 'critical') return false;
          // Check if stockout is within next 2 months
          const monthsData = stockVsDemand.filter(d => d.medicine === r.medicine);
          const criticalIndex = monthsData.findIndex(d => d.stock_status === 'critical');
          return criticalIndex >= 0 && criticalIndex <= 2;
        })
        .map(r => r.medicine)
    )].length;

    return { totalItems, totalUnits, zeroCount, criticalMeds, needsRestockNow };
  }, [items, stockVsDemand]);

  const pieData = useMemo(() => {
    const nonzero = items.filter(r => (Number(r.quantity) || 0) > 0).length;
    const zero = items.length - nonzero;
    return [{ name: "In Stock", value: nonzero }, { name: "Zero", value: zero }];
  }, [items]);

  // 🆕 NEW: Prepare chart data for selected medicine
  const chartData = useMemo(() => {
    if (!selectedMedicine || !stockVsDemand.length) return [];
    
    return stockVsDemand
      .filter(r => r.medicine === selectedMedicine)
      .map(r => ({
        month: fmtMonthName(r.month),
        stock: Number(r.projected_stock).toFixed(1),
        demand: Number(r.demand).toFixed(1),
        status: r.stock_status
      }));
  }, [stockVsDemand, selectedMedicine]);

  // Get list of available medicines
  // ✅ FIXED: Move stockoutInfo ABOVE useEffect
  // Check if selected medicine has critical status and find crossover point
  const stockoutInfo = useMemo(() => {
    if (!chartData.length) return null;
    
    const critical = chartData.find(d => d.status === 'critical');
    if (!critical) return null;
    
    // Find the first month where stock crosses below demand
    const crossoverIndex = chartData.findIndex(d => d.status === 'critical');
    const crossoverMonth = chartData[crossoverIndex]?.month;
    
    // Calculate restock date (1 month before stockout to account for delivery time)
    const restockNoticeIndex = Math.max(0, crossoverIndex - 1);
    const restockNoticeMonth = chartData[restockNoticeIndex]?.month || crossoverMonth;
    
    // ETA: 1 month delivery time
    const restockETA = (new Date(crossoverMonth).setMonth(new Date(crossoverMonth).getMonth() + 3));  // Set 3-month delivery ETA

    
    return {
      hasCritical: true,
      stockoutMonth: crossoverMonth,
      restockNoticeMonth,
      restockETA,
      daysUntilStockout: crossoverIndex * 30 // Rough estimate
    };
  }, [chartData]);

  // 🆕 NEW: Browser notification for critical stock (now safe)
  useEffect(() => {
    if (stockoutInfo && stockoutInfo.hasCritical) {
      // Request notification permission
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      
      // Show notification if permitted
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🚨 MediTrack: Restock Alert!', {
          body: `${selectedMedicine} will run out by ${stockoutInfo.stockoutMonth}. Order now! (3 months delivery)`,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `restock-${selectedMedicine}`, // Prevents duplicate notifications
        });
      }
    }
  }, [stockoutInfo, selectedMedicine]);

  const availableMedicines = useMemo(() => {
    const fromStock = items.map(r => r.medicine_name);
    const fromML = stockVsDemand.map(r => r.medicine);
    return [...new Set([...fromStock, ...fromML])].sort();
  }, [items, stockVsDemand]);

  const peakMap = useMemo(() => {
    const m = new Map();
    for(const p of peaks) m.set(p.medicine, p.peak_month_name);
    return m;
  }, [peaks]);

  // 🆕 NEW: Detailed list of critical medicines for modal
  const criticalMedicines = useMemo(() => {
    const byMed = new Map();

    stockVsDemand
      .filter(r => r.stock_status === "critical")
      .forEach(r => {
        if (byMed.has(r.medicine)) return;

        const medRows = stockVsDemand.filter(d => d.medicine === r.medicine);
        const criticalIndex = medRows.findIndex(d => d.stock_status === "critical");
        const stockoutMonthRaw = medRows[criticalIndex]?.month;
        const stockoutMonth = stockoutMonthRaw ? fmtMonthName(stockoutMonthRaw) : "N/A";

        const currentStock = items.find(i => i.medicine_name === r.medicine)?.quantity ?? 0;

        byMed.set(r.medicine, {
          medicine: r.medicine,
          stockoutMonth,
          criticalIndex,
          currentStock
        });
      });

    const arr = Array.from(byMed.values());
    arr.sort((a,b) => (a.criticalIndex ?? 999) - (b.criticalIndex ?? 999));
    return arr;
  }, [stockVsDemand, items]);

  return (
    <div className={theme === "dark" ? "page dark" : "page"}>
      <InjectStyles/>

      <div className="title">
        <h2>📦 Inventory / Stock</h2>
        <span className="subtitle">Track quantities, compare stock vs. prescription demand.</span>
      </div> 

      {error && <div className="error" role="alert">{error}</div>}

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
          </div>
        </div>
      </div>

      <div className="grid grid-4" style={{marginTop:12, marginBottom:12}}>
        <KPI label="Items" value={kpis.totalItems} />
        <KPI label="Units on Hand" value={kpis.totalUnits} />
        <KPI label="Zero-Stock Items" value={kpis.zeroCount} />
        <div className="card" style={{borderRadius:"14px", position: 'relative'}}>
          <div className="kpi-label">Medicines at Risk</div>
          <div className="kpi-value" style={{color: kpis.criticalMeds > 0 ? '#dc2626' : 'inherit'}}>
            {kpis.criticalMeds}
          </div>
          {kpis.needsRestockNow > 0 && (
            <div
              style={{
                marginTop: 8,
                padding: '6px 10px',
                background: '#dc2626',
                color: '#fff',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'center',
                animation: 'pulse 2s infinite',
                cursor: 'pointer'
              }}
              onClick={() => setShowCriticalModal(true)}
            >
              🚨 {kpis.needsRestockNow} need restock NOW! (View details)
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>

      {/* 🆕 NEW: Stock vs Demand Chart */}
      <Panel title="📊 Stock Level vs. Prescription Demand">
        <div style={{marginBottom: 16}}>
          <label className="kpi-label">Select Medicine:</label>
          <select 
            className="select" 
            value={selectedMedicine} 
            onChange={(e) => setSelectedMedicine(e.target.value)}
            disabled={!availableMedicines.length}
          >
            {availableMedicines.length === 0 && (
              <option value="">No data available</option>
            )}
            {availableMedicines.map(med => (
              <option key={med} value={med}>{med}</option>
            ))}
          </select>
          {/* 🧠 Show the model used and accuracy (optional enhancement) */}
          {stockVsDemand.length > 0 && selectedMedicine && (
            <div style={{
              marginTop: 8,
              background: 'var(--badge-bg)',
              color: 'var(--badge-text)',
              borderRadius: 8,
              padding: '6px 10px',
              display: 'inline-block',
              fontWeight: 600
            }}>
              {(() => {
                const medData = stockVsDemand.find(r => r.medicine === selectedMedicine);
                if (!medData) return "No model data available";
                const model = medData.model_used || "unknown";
                const acc = medData.accuracy_score ? medData.accuracy_score.toFixed(2) : "N/A";
                return `Model used: ${model.replace("_", " ")}`;
              })()}
            </div>
          )}

        </div>

        {stockoutInfo && (
          <div className="error" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 24 }}>🚨</span>
              <strong>RESTOCK ALERT: Stock and Demand Lines Will Cross!</strong>
            </div>

            <div style={{ marginLeft: 32 }}>
              {/* ✅ Cleaned-up formatted date display */}
              <p style={{ margin: "4px 0" }}>
                📉 <strong>Projected Stockout:</strong> {stockoutInfo.stockoutMonth}
              </p>

              {/* 🧮 Compute restock and arrival dates */}
              {(() => {
                const stockoutDate = new Date(stockoutInfo.stockoutMonth);
                const restockBy = new Date(stockoutDate);
                restockBy.setMonth(stockoutDate.getMonth() - 3); // 3 months before
                const arrivalDate = new Date(stockoutDate);
                arrivalDate.setMonth(stockoutDate.getMonth() + 3); // 3 months after

                const fmt = (d) =>
                  d.toLocaleString("en-US", { month: "short", year: "numeric" });

                // 🧠 Find shortage amount
                const shortage = chartData
                  .filter((r) => r.status === "critical")
                  .reduce((sum, r) => sum + (Number(r.demand) - Number(r.stock)), 0);

                return (
                  <>
                    <p style={{ margin: "4px 0" }}>
                      📦 <strong>Order NOW to avoid stockout</strong> — Place restock order by{" "}
                      <b>{fmt(restockBy)}</b>
                    </p>
                    <p style={{ margin: "4px 0" }}>
                      🚚 <strong>Delivery ETA:</strong> 3 months from order date
                    </p>
                    <p style={{ margin: "4px 0" }}>
                      ⏰ <strong>Expected Arrival:</strong> {fmt(arrivalDate)}{" "}
                      <i>(if ordered immediately)</i>
                    </p>
                    <p style={{ margin: "4px 0" }}>
                      💊 <strong>Medicine to Restock:</strong> {selectedMedicine || "N/A"}
                    </p>
                    <p style={{ margin: "4px 0" }}>
                      📦 <strong>Quantity Needed:</strong>{" "}
                      {shortage > 0 ? `${Math.round(shortage)} units` : "No shortage data"}
                    </p>

                    <div
                      style={{
                        marginTop: 12,
                        padding: 12,
                        background: "rgba(220, 38, 38, 0.1)",
                        borderRadius: 8,
                      }}
                    >
                      <strong>⚠️ Action Required:</strong> Contact supplier to restock{" "}
                      <strong>{selectedMedicine}</strong> before{" "}
                      <strong>{fmt(restockBy)}</strong>.
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}


        <div style={{width:"100%", height:380}}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 12 }} 
                angle={-30} 
                textAnchor="end" 
                height={80}
              />
              <YAxis 
                label={{ value: 'Units', angle: -90, position: 'insideLeft' }}
                domain={[0, 'auto']}
              />
              <Tooltip 
                formatter={(value, name, props) => {
                  const row = props.payload || {};
                  const note = row.note ? ` (${row.note})` : "";
                  return [`${value} units${note}`, name === 'stock' ? 'Available Stock' : 'Prescription Demand'];
                }}
              />

              <Legend 
                verticalAlign="top"
                height={36}
              />
              
              {/* Stock line (blue - decreasing over time) */}
              <Line 
                type="monotone" 
                dataKey="stock" 
                stroke="#2563eb" 
                strokeWidth={3}
                name="Stock Level"
                dot={{ fill: '#2563eb', r: 4 }}
                activeDot={{ r: 6 }}
              />
              
              {/* Demand line (red/orange - consumption pattern) */}
              <Line 
                type="monotone" 
                dataKey="demand" 
                stroke="#dc2626" 
                strokeWidth={3}
                name="Prescription Demand"
                dot={{ fill: '#dc2626', r: 4 }}
                activeDot={{ r: 6 }}
                strokeDasharray="5 5"
              />
              
              {/* Reference line at y=0 */}
              <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
              
              {/* Mark the crossover point if it exists */}
              {stockoutInfo && (
                <ReferenceLine 
                  x={stockoutInfo.restockETA}  // 3 months delivery time
                  stroke="#dc2626" 
                  strokeWidth={2}
                  label={{ 
                    value: '⚠️ STOCKOUT', 
                    position: 'top',
                    fill: '#dc2626',
                    fontWeight: 'bold'
                  }}
                />
              )}

            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="hint" style={{marginTop: 12}}>
          <strong>How to read:</strong> Blue line shows remaining stock after each month's consumption. 
          Red dashed line shows monthly prescription demand. 
          <strong style={{color: 'var(--danger)'}}> When lines cross = RESTOCK NEEDED!</strong>
          <br/>
          <strong>📦 Restock Lead Time:</strong> 1 month delivery time - order before stockout month to ensure continuity.
        </div>
      </Panel>

      {/* Stock Status Pie Chart */}
      <div className="grid grid-2" style={{marginTop: 16}}>
        <Panel title="Stock Status Overview">
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={110}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={["#4CAF50", "#F44336"][i % 2]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="📈 Quick Stats">
          <div style={{padding: "20px 0"}}>
            <div style={{marginBottom: 20}}>
              <div className="kpi-label">Total Stock Value</div>
              <div className="kpi-value">{kpis.totalUnits}</div>
              <div className="hint">units across all medicines</div>
            </div>
            
            <div style={{marginBottom: 20}}>
              <div className="kpi-label">Low Stock Items</div>
              <div className="kpi-value" style={{color: kpis.zeroCount > 0 ? 'var(--danger)' : 'inherit'}}>
                {kpis.zeroCount}
              </div>
              <div className="hint">medicines with zero quantity</div>
            </div>

            <div>
              <div className="kpi-label">At-Risk Medicines</div>
              <div className="kpi-value" style={{color: kpis.criticalMeds > 0 ? '#f59e0b' : 'inherit'}}>
                {kpis.criticalMeds}
              </div>
              <div className="hint">projected stockouts within {horizon} months</div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Form */}
      <div className="card" style={{marginTop: 16}}>
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
                <td data-label="Action" style={{ textAlign: "right" }}>

                  <div className="actions">
                    <button
                      className="btn"
                      style={{ background: "#f59e0b", color: "#fff" }}
                      onClick={() => {
                        setSelectedMedicine(it.medicine_name);
                        setLogsOpen(true);
                      }}
                      aria-label={`View logs for ${it.medicine_name}`}
                    >
                      📜 Logs
                    </button>

                    <button
                      className="btn"
                      onClick={() => beginEdit(it)}
                      aria-label={`Edit ${it.medicine_name}`}
                      style={{ background: "#3b82f6", color: "#fff" }}
                    >
                      ✏️ Edit
                    </button>

                    <button
                      className="btn danger"
                      onClick={() => remove(it.id)}
                      aria-label={`Delete ${it.medicine_name}`}
                    >
                      ❌ Delete
                    </button>
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

      {/* 🧾 Logs Modal for Stock Movements */}
      {logsOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div
            className="modal-card"
            style={{
              maxHeight: "80vh",
              overflowY: "auto",
              width: "min(800px, 100%)",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0 }}>
                📜 Stock Movement Logs — {selectedMedicine || "All Medicines"}
              </h3>
              <button className="btn gray" onClick={() => setLogsOpen(false)}>
                Close
              </button>
            </div>

            {/* Body */}
            {loadingLogs ? (
              <p className="hint" style={{ marginTop: 16 }}>
                Loading logs…
              </p>
            ) : logs.length === 0 ? (
              <p className="hint" style={{ marginTop: 16 }}>
                No stock movement history found.
              </p>
            ) : (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Medicine</th>
                      <th>Change (Qty)</th>
                      <th>Patient ID</th>
                      <th>Reason</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs
                      .filter((entry) =>
                        selectedMedicine
                          ? entry.medicine_name === selectedMedicine
                          : true
                      )
                      .sort((a, b) => new Date(b.date_given) - new Date(a.date_given)) // newest first
                      .map((entry) => (
                        <tr key={entry.id}>
                          <td data-label="ID">{entry.id}</td>
                          <td data-label="Medicine">{entry.medicine_name}</td>
                          <td
                            data-label="Change (Qty)"
                            style={{
                              color:
                                entry.change_qty < 0
                                  ? "var(--pill-bad-text)"
                                  : "var(--pill-good-text)",
                              fontWeight: 600,
                            }}
                          >
                            {entry.change_qty > 0
                              ? `+${entry.change_qty}`
                              : entry.change_qty}
                          </td>
                          <td data-label="Patient">
                            {(() => {
                              console.log('Row data:', entry);
                              
                              // Try all possible field names
                              const patientId = entry.patient_id || 
                                                entry.prescription_patient_id || 
                                                entry.patient_user_id ||
                                                entry.prescription_id;
                              
                              return patientId ? (
                                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                                  {patientId}
                                </span>
                              ) : (
                                <span style={{ color: "var(--muted)", fontStyle: "italic" }}>
                                  No patient
                                </span>
                              );
                            })()}
                          </td>
                          <td data-label="Reason">
                            {entry.reason || (
                              <span style={{ color: "var(--muted)" }}>—</span>
                            )}
                          </td>
                          <td data-label="Date">
                            {entry.date_given
                              ? fmtDateTime(entry.date_given)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🆕 NEW: Critical Medicines Modal */}
      {showCriticalModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div
            className="modal-card"
            style={{
              maxHeight: "80vh",
              overflowY: "auto",
              width: "min(800px, 100%)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8
              }}
            >
              <h3 style={{ margin: 0 }}>🚨 Medicines at Risk of Stockout</h3>
              <button className="btn gray" onClick={() => setShowCriticalModal(false)}>
                Close
              </button>
            </div>

            {criticalMedicines.length === 0 ? (
              <p className="hint" style={{ marginTop: 8 }}>
                No medicines are currently flagged as critical.
              </p>
            ) : (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th>Current Stock</th>
                      <th>Projected Stockout</th>
                      <th>Time to Stockout</th>
                      <th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criticalMedicines.map((m) => (
                      <tr key={m.medicine}>
                        <td data-label="Medicine">{m.medicine}</td>
                        <td data-label="Current Stock">{m.currentStock}</td>
                        <td data-label="Projected Stockout">{m.stockoutMonth}</td>
                        <td data-label="Time to Stockout">
                          {m.criticalIndex <= 0
                            ? "Now"
                            : `${m.criticalIndex} month(s)`}
                        </td>
                        <td data-label="Priority">
                          {m.criticalIndex <= 2 ? (
                            <span
                              style={{
                                background: "#dc2626",
                                color: "#fff",
                                padding: "4px 8px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 600
                              }}
                            >
                              🚨 Urgent
                            </span>
                          ) : (
                            <span
                              style={{
                                background: "#f59e0b",
                                color: "#fff",
                                padding: "4px 8px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 600
                              }}
                            >
                              ⚠️ Monitor
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 8,
                background: "rgba(220, 38, 38, 0.08)",
                fontSize: 14
              }}
            >
              <strong>💡 Tip:</strong> Start with the <b>Urgent</b> medicines (stockout in 0–2
              months) and coordinate purchase orders with suppliers. Use the forecast horizon
              above to simulate different restock scenarios.
            </div>
          </div>
        </div>
      )}

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