// src/pages/Patients.js — fully responsive container + even form grid + safe-area padding (fixed)
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

// ✅ API config
const API_BASE = process.env.REACT_APP_BACKEND_URL || "/api";
const API = `${API_BASE}/patients`;



/* ---------------- Styles scoped to this page ---------------- */
const Styles = () => (
  <style>{`
    :root{
      --bg:#f6f7fb;--card:#fff;--muted:#6b7280;--text:#111827;--primary:#1e40af;--danger:#dc2626;--border:#e5e7eb;--gray:#f3f4f6;--radius:16px;
      --green:#16a34a;
    }
    *{ box-sizing:border-box }
    html,body,#root{ height:100% }
    body{ margin:0; background:var(--bg); color:var(--text) }

    .patients-page{
      --gutter:clamp(12px, 3.2vw, 24px);
      --gap:12px; --card-pad:16px;
      overflow-x: clip;
      padding:16px var(--gutter) 24px var(--gutter);
      display:flex; justify-content:center; /* center the frame */
    }
    @supports (padding: max(0px)){
      .patients-page{
        padding-left:max(var(--gutter), env(safe-area-inset-left));
        padding-right:max(var(--gutter), env(safe-area-inset-right));
      }
    }

    /* ✅ Single rounded frame (both sides curved, crisp edges) */
    .container-1200{
      inline-size:min(1200px, 100%);
      min-block-size:calc(100dvh - 40px);
      border:1px solid var(--border);
      border-radius:var(--radius);
      background:var(--bg);
      box-shadow:0 8px 24px rgba(0,0,0,.06);
      clip-path: inset(0 round var(--radius));
      overflow:hidden;      /* keep inner content inside the curve */
      padding:0;            /* padding handled by section spacing */
      display:block;
    }

    /* give inner content breathing room that respects curve */
    .page-inner{
      padding:16px clamp(12px, 3.2vw, 24px) 24px;
    }

    .patients-page .card{
      background:var(--card);
      border:1px solid var(--border);
      border-radius:var(--radius);
      padding:var(--card-pad);
      overflow:hidden;
      min-width:0;
      background-clip: padding-box; /* ✅ avoids faint halo at edges */
    }
    .patients-page h3{ margin:0 0 10px; color:var(--primary); font-size:clamp(16px, 2.4vw, 20px) }

    /* --- Grid utilities (12-col) --- */
    .patients-page .row{ display:grid; grid-template-columns:repeat(12, minmax(0,1fr)); gap:var(--gap); min-width:0; }
    .patients-page .row > *{ min-width:0 }
    .col-12{ grid-column: span 12 }
    .col-6 { grid-column: span 6  }
    .col-4 { grid-column: span 4  }
    .col-3 { grid-column: span 3  }

    /* ≥1100px=3 cols, 700–1100px=2 cols, ≤700px=1 col (even layout) */
    @media (max-width:1100px){ .col-4, .col-3 { grid-column: span 6 } }
    @media (max-width:700px){ .col-6, .col-4, .col-3 { grid-column: span 12 } }

    /* Fields */
    .field{ display:flex; flex-direction:column; gap:6px }
    .label{ font-size:12px; color:var(--muted) }
    .label.req::after{ content:" *"; color:var(--danger) }

    .input, select{
      width:100%; background:#fff; border:1px solid var(--border); border-radius:12px;
      padding:10px 12px; min-height:44px;
      outline:none; color:var(--text);
      font-size:clamp(14px, 1.8vw, 16px);
      -webkit-appearance:none; appearance:none;
      line-height:1.3;
    }
    .input::placeholder{ color:#9ca3af }
    .input.error, select.error{ border-color:var(--danger); box-shadow:0 0 0 3px rgba(220,38,38,.08) }
    .error-text{ color:var(--danger); font-size:12px; line-height:1.2 }

    .input.date::-webkit-datetime-edit{ color:transparent }
    .input.date.has-value::-webkit-datetime-edit{ color:inherit }
    .input.date::-webkit-calendar-picker-indicator{ opacity:1 }

    /* Buttons */
    .pill{
      appearance:none; border:1px solid var(--border); border-radius:999px;
      padding:10px 14px; font-weight:700; cursor:pointer; white-space:nowrap;
      display:inline-flex; align-items:center; justify-content:center; gap:8px; background:#fff; color:#111827; min-height:40px;
    }
    .pill.blue{  background:var(--primary); color:#fff; border-color:transparent }
    .pill.green{ background:var(--green);   color:#fff; border-color:transparent }
    .pill.gray{  background:#4b5563;        color:#fff; border-color:transparent }
    .pill.red{   background:var(--danger);  color:#fff; border-color:transparent }
    .pill:disabled{ opacity:.6; cursor:not-allowed }
    @media (max-width:560px){
      .cell-actions{ flex-direction:column; align-items:stretch !important }
      .cell-actions .pill{ width:100% }
    }

    /* KPI row */
    .kpi-row{ align-items:stretch }
    .kpi-row > .card{ grid-column: span 3; display:flex; flex-direction:column; justify-content:center }
    @media (max-width:980px){ .kpi-row > .card{ grid-column: span 6 } }
    @media (max-width:560px){ .kpi-row > .card{ grid-column: 1/-1 } }

    /* Table */
    .table-wrap{ overflow:auto; border-radius:12px }
    table{ width:100%; border-collapse:separate; border-spacing:0; background:#fff }
    thead th{ position:sticky; top:0; background:var(--primary); color:#fff; text-align:left; padding:10px 12px; font-size:14px }
    tbody td{ padding:12px; border-bottom:1px solid var(--border); color:var(--text); background:#fff; vertical-align:top }
    tbody tr:nth-child(2n) td{ background:#f9fafb }

    .cell-actions{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end }

    /* Phone: card list (no zebra lines, fully rounded) */
    @media (max-width:720px){
      .table-wrap thead{ display:none }
      .table-wrap table, .table-wrap tbody, .table-wrap tr, .table-wrap td{ display:block; width:100% }
      .table-wrap tbody tr{
        border:1px solid var(--border); border-radius:var(--radius); margin:12px 0; overflow:hidden; background:var(--card);
        box-shadow:0 1px 3px rgba(0,0,0,.08)
      }
      .table-wrap tbody tr:nth-child(2n) td{ background:transparent } /* ✅ kill zebra in card mode */
      .table-wrap tbody td{
        display:grid; grid-template-columns:minmax(120px, 44%) 1fr; gap:10px; background:transparent; padding:12px 14px
      }
      .table-wrap tbody td + td{ border-top:1px solid var(--border) }
      .table-wrap tbody td::before{ content:attr(data-label); font-weight:600; color:var(--muted) }
    }

    /* Modal */
    .modal-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:1000; padding:16px }
    .modal-card{ width:min(720px,100%); background:#fff; border:1px solid var(--border); border-radius:16px; padding:18px; box-shadow:0 8px 28px rgba(0,0,0,.2) }
  `}</style>
);


/* ---------------- Helpers ---------------- */
const fmtDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(d);
};
const compiledName = (obj = {}) =>
  [obj.first_name, obj.middle_name, obj.last_name]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/* ---------------- Credentials Modal ---------------- */
function CredsModal({ data, onClose }) {
  if (!data) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h3 style={{ marginTop: 0 }}>🔐 New Patient Account</h3>
        <p><strong>Email:</strong> {data.email}</p>
        <p>
          <strong>Password:</strong>{" "}
          <code style={{ background:"#f3f4f6", border:"1px solid #e5e7eb", padding:"4px 8px", borderRadius:8 }}>
            {data.password}
          </code>
        </p>
        <div className="cell-actions" style={{ justifyContent:"center", marginTop:8 }}>
          <button className="pill blue" onClick={()=>navigator.clipboard.writeText(`${data.email} / ${data.password}`)}>📋 Copy</button>
          <button className="pill gray" onClick={onClose}>Close</button>
        </div>
        <p style={{ color:"#6b7280", marginTop:8, fontSize:14 }}>Share these credentials with the patient for app login.</p>
      </div>
    </div>
  );
}

/* ---------------- Edit Modal ---------------- */
function EditModal({ open, value, onChange, onSave, onClose, saving }) {
  if (!open) return null;
  const nameHeader = compiledName(value||{});
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
          <h3 style={{margin:0}}>✏️ Edit Patient{ nameHeader ? ` — ${nameHeader}` : "" }</h3>
          <button className="pill" onClick={onClose} disabled={saving}>Close</button>
        </div>

        <div className="row">
          <div className="field col-4">
            <label className="label req">First name</label>
            <input className="input" value={value.first_name||""} onChange={(e)=>onChange({...value, first_name:e.target.value})} />
          </div>
          <div className="field col-4">
            <label className="label">Middle name (optional)</label>
            <input className="input" value={value.middle_name||""} onChange={(e)=>onChange({...value, middle_name:e.target.value})} />
          </div>
          <div className="field col-4">
            <label className="label req">Last name</label>
            <input className="input" value={value.last_name||""} onChange={(e)=>onChange({...value, last_name:e.target.value})} />
          </div>

          <div className="field col-6">
            <label className="label">Email (optional)</label>
            <input className="input" type="email" value={value.email||""} onChange={(e)=>onChange({...value, email:e.target.value})} />
          </div>
          <div className="field col-6">
            <label className="label req">Phone number</label>
            <input className="input" value={value.phone||""} onChange={(e)=>onChange({...value, phone:e.target.value})} />
          </div>

          <div className="field col-6">
            <label className="label req">Birthdate</label>
            <input className={`input date ${value.birthdate?'has-value':''}`} type="date"
                   value={(value.birthdate||"").slice(0,10)} onChange={(e)=>onChange({...value, birthdate:e.target.value})}/>
          </div>
          <div className="field col-6">
            <label className="label req">Sex</label>
            <select className="input" value={value.sex||""} onChange={(e)=>onChange({...value, sex:e.target.value})}>
              <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
            </select>
          </div>

          <div className="field col-3">
            <label className="label req">Bldg/House No.</label>
            <input className="input" value={value.building_no||""} onChange={(e)=>onChange({...value, building_no:e.target.value})} />
          </div>
          <div className="field col-3">
            <label className="label req">Street</label>
            <input className="input" value={value.street||""} onChange={(e)=>onChange({...value, street:e.target.value})} />
          </div>
          <div className="field col-3">
            <label className="label req">Barangay</label>
            <input className="input" value={value.barangay||""} onChange={(e)=>onChange({...value, barangay:e.target.value})} />
          </div>
          <div className="field col-3">
            <label className="label req">City</label>
            <input className="input" value={value.city||""} onChange={(e)=>onChange({...value, city:e.target.value})} />
          </div>

          <div className="field col-6">
            <label className="label">Last Visit</label>
            <input className={`input date ${value.last_visit?'has-value':''}`} type="date"
                   value={(value.last_visit||"").slice(0,10)} onChange={(e)=>onChange({...value, last_visit:e.target.value})}/>
          </div>
        </div>

        <div className="cell-actions" style={{justifyContent:"flex-end", marginTop:12}}>
          <button className="pill blue" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Page ---------------- */
export default function Patients(){
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState({
    first_name:"", middle_name:"", last_name:"",
    email:"", phone:"", birthdate:"", sex:"",
    building_no:"", street:"", barangay:"", city:"", last_visit:""
  });
  const [formErrors, setFormErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalData, setModalData] = useState(null);
  const [search, setSearch] = useState("");

  const [editingOpen, setEditingOpen] = useState(false);
  const [editingValue, setEditingValue] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const navigate = useNavigate();

  const toNull = (v)=> (v==null || (typeof v==="string" && v.trim()==="")) ? null : v;
  const isoDateOrNull = (v)=>{ if(toNull(v)===null) return null; const d=new Date(v); return Number.isNaN(d.getTime())?null:v; };

  const validate = (values) => {
    const errs = {};
    const need = (key, msg) => { if(!values[key] || String(values[key]).trim()==="") errs[key] = msg; };
    need("first_name","First name is required.");
    need("last_name","Last name is required.");
    need("phone","Phone number is required.");
    need("birthdate","Birthdate is required.");
    need("sex","Sex is required.");
    need("building_no","Bldg/House No. is required.");
    need("street","Street is required.");
    need("barangay","Barangay is required.");
    need("city","City is required.");
    return errs;
  };

  async function load(nameFilter){
    try{
      setLoading(true); setError("");
      const res = await axios.get(API, { params: nameFilter ? { name: nameFilter } : undefined });
      const rows = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.patients) ? res.data.patients : []);
      const normalized = (rows ?? []).map(r => ({ ...r, name: r?.name && r.name.trim() ? r.name : compiledName(r) }));
      setPatients(normalized);
    }catch(e){
      setError(e.response?.data?.error || e.message);
      setPatients([]);
    }finally{ setLoading(false); }
  }

  useEffect(()=>{ load(); },[]);
  useEffect(()=>{ const t=setTimeout(()=>load(search), 350); return ()=>clearTimeout(t); },[search]);

  const kpis = useMemo(()=>({
    total: patients.length,
    avgAge: patients.length ? Math.round(patients.reduce((s,p)=> s + (parseInt(p.age,10)||0),0)/Math.max(1,patients.length)) : 0,
    withPhone: patients.filter(p=>!!p.phone).length
  }),[patients]);

  // Clear an error as user types
  const bind = (key) => ({
    value: form[key],
    onChange: (e) => {
      const val = e.target.value;
      setForm(f => ({...f, [key]: val}));
      if(formErrors[key]) setFormErrors(errs => { const n={...errs}; delete n[key]; return n; });
    }
  });

  async function add(e){
    e.preventDefault();
    const errs = validate(form);
    setFormErrors(errs);
    if(Object.keys(errs).length){ return; }

    const payload = {
      first_name: String(form.first_name).trim(),
      middle_name: toNull(form.middle_name) ? String(form.middle_name).trim() : null,
      last_name: String(form.last_name).trim(),
      email: toNull(form.email) ? String(form.email).trim().toLowerCase() : null,
      phone: toNull(form.phone) ? String(form.phone).trim() : null,
      birthdate: isoDateOrNull(form.birthdate),
      sex: toNull(form.sex) ? String(form.sex).trim() : null,
      building_no: toNull(form.building_no) ? String(form.building_no).trim() : null,
      street: toNull(form.street) ? String(form.street).trim() : null,
      barangay: toNull(form.barangay) ? String(form.barangay).trim() : null,
      city: toNull(form.city) ? String(form.city).trim() : null,
      last_visit: isoDateOrNull(form.last_visit),
    };

    try{
      const res = await axios.post(API, payload, { headers:{ "Content-Type":"application/json" }});
      await load();
      setForm({ first_name:"", middle_name:"", last_name:"", email:"", phone:"", birthdate:"", sex:"", building_no:"", street:"", barangay:"", city:"", last_visit:"" });
      setFormErrors({});
      if(res.data?.password && payload.email) setModalData({ email: payload.email, password: res.data.password });
    }catch(err){
      const apiErr = err.response?.data;
      alert(`Failed to add patient: ${apiErr?.error || apiErr?.detail || err.message}`);
    }
  }

  async function del(id){
    if(!window.confirm("Delete this patient?")) return;
    try{
      await axios.delete(`${API}/${id}`);
      setPatients(p=>p.filter(x=>String(x.id)!==String(id)));
    }catch(err){
      alert(`Failed to delete patient: ${err.response?.data?.error || err.message}`);
    }
  }

  async function beginEdit(p){
    try{
      const { data } = await axios.get(`${API}/${p.id}`);
      setEditingValue({
        id: data.id,
        first_name: data.first_name || "",
        middle_name: data.middle_name || "",
        last_name: data.last_name || "",
        email: data.email || "",
        phone: data.phone || "",
        birthdate: data.birthdate ? String(data.birthdate).slice(0,10) : "",
        sex: data.sex || "",
        building_no: data.building_no || "",
        street: data.street || "",
        barangay: data.barangay || "",
        city: data.city || "",
        last_visit: data.last_visit ? String(data.last_visit).slice(0,10) : "",
      });
      setEditingOpen(true);
    }catch(e){
      alert(`Failed to open edit: ${e.response?.data?.error || e.message}`);
    }
  }

  async function saveEdit(){
    const v = editingValue || {};
    // Validate required on edit as well
    const miss = [];
    ["first_name","last_name","phone","birthdate","sex","building_no","street","barangay","city"].forEach(k=>{
      if(!v[k] || String(v[k]).trim()==="") miss.push(k);
    });
    if(miss.length){ return alert("Please fill all required fields before saving."); }

    const payload = {
      first_name: String(v.first_name).trim(),
      middle_name: toNull(v.middle_name) ? String(v.middle_name).trim() : null,
      last_name: String(v.last_name).trim(),
      email: toNull(v.email) ? String(v.email).trim().toLowerCase() : null,
      phone: toNull(v.phone) ? String(v.phone).trim() : null,
      birthdate: isoDateOrNull(v.birthdate),
      sex: toNull(v.sex) ? String(v.sex).trim() : null,
      building_no: toNull(v.building_no) ? String(v.building_no).trim() : null,
      street: toNull(v.street) ? String(v.street).trim() : null,
      barangay: toNull(v.barangay) ? String(v.barangay).trim() : null,
      city: toNull(v.city) ? String(v.city).trim() : null,
      last_visit: isoDateOrNull(v.last_visit),
    };

    setSavingEdit(true);
    try{
      await axios.put(`${API}/${v.id}`, payload, { headers:{ "Content-Type":"application/json" }});
      setEditingOpen(false);
      setSavingEdit(false);
      await load();
    }catch(err){
      setSavingEdit(false);
      const apiErr = err.response?.data;
      alert(`Failed to update patient: ${apiErr?.error || apiErr?.detail || err.message}`);
    }
  }

  const blank = v => (v==null || v==="") ? "—" : v;

  return (
    <div className="patients-page">
      <Styles/>
      <div className="container-1200">

        {/* KPI strip (auto-wrap) */}
        <div className="row kpi-row" style={{marginBottom:12}}>
          <div className="card">
            <div style={{color:"var(--muted)", fontSize:13}}>Total Patients</div>
            <div style={{fontSize:22, fontWeight:800}}>{kpis.total}</div>
          </div>
          <div className="card">
            <div style={{color:"var(--muted)", fontSize:13}}>Avg Age</div>
            <div style={{fontSize:22, fontWeight:800}}>{kpis.avgAge}</div>
          </div>
          <div className="card">
            <div style={{color:"var(--muted)", fontSize:13}}>With Phone</div>
            <div style={{fontSize:22, fontWeight:800}}>{kpis.withPhone}</div>
          </div>
          <div className="card">
            <div style={{color:"var(--muted)", fontSize:13}}>Search</div>
            <input className="input" placeholder="Search by name…" value={search} onChange={(e)=>setSearch(e.target.value)} />
          </div>
        </div>

        {/* Add Patient */}
        <div className="card" style={{marginBottom:12}}>
          <h3>Add Patient</h3>
          <form onSubmit={add} noValidate>
            <div className="row add">
              <div className="field col-4">
                <label className="label req">First name</label>
                <input
                  className={`input ${formErrors.first_name?'error':''}`}
                  aria-invalid={!!formErrors.first_name}
                  aria-describedby={formErrors.first_name ? "err-first_name" : undefined}
                  {...bind("first_name")}
                />
                {formErrors.first_name && <span id="err-first_name" className="error-text">{formErrors.first_name}</span>}
              </div>

              <div className="field col-4">
                <label className="label">Middle name (optional)</label>
                <input className="input" {...bind("middle_name")} />
              </div>

              <div className="field col-4">
                <label className="label req">Last name</label>
                <input
                  className={`input ${formErrors.last_name?'error':''}`}
                  aria-invalid={!!formErrors.last_name}
                  aria-describedby={formErrors.last_name ? "err-last_name" : undefined}
                  {...bind("last_name")}
                />
                {formErrors.last_name && <span id="err-last_name" className="error-text">{formErrors.last_name}</span>}
              </div>

              <div className="field col-6">
                <label className="label">Email (optional)</label>
                <input className="input" type="email" {...bind("email")} />
              </div>

              <div className="field col-6">
                <label className="label req">Phone number</label>
                <input
                  className={`input ${formErrors.phone?'error':''}`}
                  aria-invalid={!!formErrors.phone}
                  aria-describedby={formErrors.phone ? "err-phone" : undefined}
                  {...bind("phone")}
                />
                {formErrors.phone && <span id="err-phone" className="error-text">{formErrors.phone}</span>}
              </div>

              <div className="field col-6">
                <label className="label req">Birthdate</label>
                <input
                  className={`input date ${form.birthdate?'has-value':''} ${formErrors.birthdate?'error':''}`}
                  type="date"
                  aria-invalid={!!formErrors.birthdate}
                  aria-describedby={formErrors.birthdate ? "err-birthdate" : undefined}
                  {...bind("birthdate")}
                />
                {formErrors.birthdate && <span id="err-birthdate" className="error-text">{formErrors.birthdate}</span>}
              </div>

              <div className="field col-6">
                <label className="label req">Sex</label>
                <select
                  className={`input ${formErrors.sex?'error':''}`}
                  aria-invalid={!!formErrors.sex}
                  aria-describedby={formErrors.sex ? "err-sex" : undefined}
                  {...bind("sex")}
                >
                  <option value="">Select</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
                {formErrors.sex && <span id="err-sex" className="error-text">{formErrors.sex}</span>}
              </div>

              <div className="field col-3">
                <label className="label req">Bldg/House No.</label>
                <input
                  className={`input ${formErrors.building_no?'error':''}`}
                  aria-invalid={!!formErrors.building_no}
                  aria-describedby={formErrors.building_no ? "err-building_no" : undefined}
                  {...bind("building_no")}
                />
                {formErrors.building_no && <span id="err-building_no" className="error-text">{formErrors.building_no}</span>}
              </div>

              <div className="field col-3">
                <label className="label req">Street</label>
                <input
                  className={`input ${formErrors.street?'error':''}`}
                  aria-invalid={!!formErrors.street}
                  aria-describedby={formErrors.street ? "err-street" : undefined}
                  {...bind("street")}
                />
                {formErrors.street && <span id="err-street" className="error-text">{formErrors.street}</span>}
              </div>

              <div className="field col-3">
                <label className="label req">Barangay</label>
                <input
                  className={`input ${formErrors.barangay?'error':''}`}
                  aria-invalid={!!formErrors.barangay}
                  aria-describedby={formErrors.barangay ? "err-barangay" : undefined}
                  {...bind("barangay")}
                />
                {formErrors.barangay && <span id="err-barangay" className="error-text">{formErrors.barangay}</span>}
              </div>

              <div className="field col-3">
                <label className="label req">City</label>
                <input
                  className={`input ${formErrors.city?'error':''}`}
                  aria-invalid={!!formErrors.city}
                  aria-describedby={formErrors.city ? "err-city" : undefined}
                  {...bind("city")}
                />
                {formErrors.city && <span id="err-city" className="error-text">{formErrors.city}</span>}
              </div>

              <div className="col-12" style={{display:"flex", gap:8, justifyContent:"flex-end", flexWrap:"wrap"}}>
                <button className="pill blue" type="submit">➕ Add</button>
              </div>
            </div>
          </form>
          {error && <div style={{color:"#b91c1c", marginTop:8}}>⚠ {error}</div>}
        </div>

        {/* Patients Table */}
        <div className="card">
          <h3>Patients</h3>
          <div className="table-wrap" role="region" aria-label="Patients table">
            <table>
              <thead>
                <tr>{["ID","Name","Email","Phone","Age","Last Visit","Actions"].map(h=> <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{textAlign:"center", padding:16}}>Loading…</td></tr>
                ) : patients.length ? (
                  patients.map(p=>(
                    <tr key={p.id}>
                      <td data-label="ID">{blank(p.id)}</td>
                      <td data-label="Name" style={{fontWeight:600}}>{blank(p.name)}</td>
                      <td data-label="Email">{blank(p.email)}</td>
                      <td data-label="Phone">{blank(p.phone)}</td>
                      <td data-label="Age">{blank(p.age)}</td>
                      <td data-label="Last Visit">{blank(fmtDate(p.last_visit))}</td>
                      <td data-label="Actions">
                        <div className="cell-actions">
                          <button className="pill green" onClick={()=>navigate(`/patients/${p.id}/manage`, { state:{patient:p} })} disabled={!p?.id}>📋 Manage</button>
                          <button className="pill blue" onClick={()=>beginEdit(p)}>✏️ Edit</button>
                          <button className="pill red" onClick={()=>del(p.id)}>❌ Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={7} style={{textAlign:"center", padding:16, color:"var(--muted)"}}>No patients found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <CredsModal data={modalData} onClose={()=>setModalData(null)} />
        <EditModal
          open={editingOpen}
          value={editingValue}
          onChange={setEditingValue}
          onSave={saveEdit}
          onClose={()=>setEditingOpen(false)}
          saving={savingEdit}
        />
      </div>
    </div>
  );
}
