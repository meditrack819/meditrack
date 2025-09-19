// src/pages/Patients.js — full version with CSS + CRUD + API integration
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

/* ---------------- API config ---------------- */
const API_BASE = process.env.REACT_APP_BACKEND_URL || "/api";
const API = `${API_BASE}/patients`;

/* ---------------- Styles ---------------- */
const Styles = () => (
  <style>{`
    :root{
      --bg:#f6f7fb;--card:#fff;--muted:#6b7280;--text:#111827;--primary:#1e40af;
      --danger:#dc2626;--border:#e5e7eb;--gray:#f3f4f6;--radius:16px;--green:#16a34a;
    }
    *{ box-sizing:border-box }
    html,body,#root{ height:100% }
    body{ margin:0; background:var(--bg); color:var(--text) }

    .patients-page{ --gutter:clamp(12px, 3.2vw, 24px); --gap:12px;
      padding:16px var(--gutter) 24px var(--gutter);
      display:flex; justify-content:center; overflow-x:clip;
    }
    .container-1200{ inline-size:min(1200px, 100%);
      min-block-size:calc(100dvh - 40px);
      border:1px solid var(--border); border-radius:var(--radius);
      background:var(--bg); box-shadow:0 8px 24px rgba(0,0,0,.06);
      clip-path: inset(0 round var(--radius)); overflow:hidden;
      padding:0; display:block;
    }
    .card{ background:var(--card); border:1px solid var(--border);
      border-radius:var(--radius); padding:16px; margin-bottom:12px;
    }
    h3{ margin:0 0 10px; color:var(--primary); font-size:18px }

    .row{ display:grid; grid-template-columns:repeat(12, minmax(0,1fr)); gap:12px; }
    .col-12{ grid-column: span 12 } .col-6{ grid-column: span 6 }
    .col-4{ grid-column: span 4 } .col-3{ grid-column: span 3 }
    @media (max-width:1100px){ .col-4,.col-3{ grid-column: span 6 } }
    @media (max-width:700px){ .col-6,.col-4,.col-3{ grid-column: span 12 } }

    .field{ display:flex; flex-direction:column; gap:6px }
    .label{ font-size:12px; color:var(--muted) }
    .label.req::after{ content:" *"; color:var(--danger) }

    .input, select{ width:100%; background:#fff; border:1px solid var(--border);
      border-radius:12px; padding:10px 12px; min-height:44px; outline:none;
    }
    .input.error, select.error{ border-color:var(--danger); box-shadow:0 0 0 3px rgba(220,38,38,.08) }
    .error-text{ color:var(--danger); font-size:12px }

    .pill{ border:1px solid var(--border); border-radius:999px;
      padding:10px 14px; font-weight:700; cursor:pointer;
    }
    .pill.blue{ background:var(--primary); color:#fff; border:none }
    .pill.green{ background:var(--green); color:#fff; border:none }
    .pill.red{ background:var(--danger); color:#fff; border:none }
    .pill.gray{ background:#4b5563; color:#fff; border:none }
    .pill:disabled{ opacity:.6; cursor:not-allowed }

    .table-wrap{ overflow:auto; border-radius:12px }
    table{ width:100%; border-collapse:separate; border-spacing:0; background:#fff }
    thead th{ background:var(--primary); color:#fff; padding:10px 12px; font-size:14px; text-align:left; }
    tbody td{ padding:12px; border-bottom:1px solid var(--border) }
    tbody tr:nth-child(2n) td{ background:#f9fafb }
    .cell-actions{ display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap }

    @media (max-width:720px){
      .table-wrap thead{ display:none }
      .table-wrap tr, .table-wrap td{ display:block; width:100% }
      .table-wrap tr{ border:1px solid var(--border); border-radius:var(--radius); margin:12px 0; padding:8px; background:var(--card) }
      .table-wrap td{ display:grid; grid-template-columns:120px 1fr; }
      .table-wrap td::before{ content:attr(data-label); font-weight:600; color:var(--muted) }
    }

    .modal-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.45);
      display:flex; align-items:center; justify-content:center; z-index:1000;
    }
    .modal-card{ width:min(720px,100%); background:#fff; border:1px solid var(--border);
      border-radius:16px; padding:18px;
    }
  `}</style>
);

/* ---------------- Helpers ---------------- */
const fmtDate = (v) => !v ? "—" : new Date(v).toLocaleDateString();
const compiledName = (o={}) => [o.first_name,o.middle_name,o.last_name].filter(Boolean).join(" ").trim();
const blank = (v) => (!v ? "—" : v);
const toNull = (v) => (v==null || v.trim()==="") ? null : v;
const isoDateOrNull = (v) => { if(!v) return null; const d=new Date(v); return isNaN(d)?null:v; };

/* ---------------- Credential Modal ---------------- */
function CredsModal({ data, onClose }) {
  if (!data) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h3>🔐 New Patient Account</h3>
        <p><strong>Email:</strong> {data.email}</p>
        <p><strong>Password:</strong> <code>{data.password}</code></p>
        <div className="cell-actions" style={{justifyContent:"center"}}>
          <button className="pill blue" onClick={()=>navigator.clipboard.writeText(`${data.email} / ${data.password}`)}>📋 Copy</button>
          <button className="pill gray" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Edit Modal ---------------- */
function EditModal({ open, value, onChange, onSave, onClose, saving }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h3>✏️ Edit Patient — {compiledName(value)}</h3>
        <div className="row">
          <div className="field col-6">
            <label className="label req">First name</label>
            <input className="input" value={value.first_name||""} onChange={(e)=>onChange({...value,first_name:e.target.value})}/>
          </div>
          <div className="field col-6">
            <label className="label req">Last name</label>
            <input className="input" value={value.last_name||""} onChange={(e)=>onChange({...value,last_name:e.target.value})}/>
          </div>
        </div>
        <div className="cell-actions" style={{marginTop:12}}>
          <button className="pill blue" onClick={onSave} disabled={saving}>{saving?"Saving…":"Save changes"}</button>
          <button className="pill gray" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Page ---------------- */
export default function Patients(){
  const [patients,setPatients] = useState([]);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [search,setSearch] = useState("");

  const [form,setForm] = useState({ first_name:"",middle_name:"",last_name:"",email:"",phone:"",birthdate:"",sex:"" });
  const [modalData,setModalData] = useState(null);

  const [editingOpen,setEditingOpen] = useState(false);
  const [editingValue,setEditingValue] = useState({});
  const [savingEdit,setSavingEdit] = useState(false);

  const navigate = useNavigate();

  async function load(nameFilter){
    try{
      setLoading(true);
      const res = await axios.get(API, { params: nameFilter?{name:nameFilter}:undefined });
      const rows = Array.isArray(res.data) ? res.data : res.data?.patients || [];
      setPatients(rows.map(r=>({...r,name:compiledName(r)})));
    }catch(e){
      setError(e.response?.data?.error || e.message);
      setPatients([]);
    }finally{ setLoading(false); }
  }
  useEffect(()=>{ load(); },[]);
  useEffect(()=>{ const t=setTimeout(()=>load(search),300); return ()=>clearTimeout(t); },[search]);

  async function add(e){
    e.preventDefault();
    const payload = {
      first_name:form.first_name.trim(), middle_name:toNull(form.middle_name),
      last_name:form.last_name.trim(), email:toNull(form.email),
      phone:toNull(form.phone), birthdate:isoDateOrNull(form.birthdate), sex:toNull(form.sex)
    };
    try{
      const res = await axios.post(API,payload,{headers:{ "Content-Type":"application/json" }});
      await load();
      setForm({first_name:"",middle_name:"",last_name:"",email:"",phone:"",birthdate:"",sex:""});
      if(res.data?.password && payload.email) setModalData({email:payload.email,password:res.data.password});
    }catch(err){ alert(`Failed to add: ${err.response?.data?.error||err.message}`); }
  }

  async function del(id){
    if(!window.confirm("Delete this patient?")) return;
    try{ await axios.delete(`${API}/${id}`); setPatients(p=>p.filter(x=>x.id!==id)); }
    catch(err){ alert(`Failed to delete: ${err.response?.data?.error||err.message}`); }
  }

  async function beginEdit(p){
    try{ const {data} = await axios.get(`${API}/${p.id}`); setEditingValue(data); setEditingOpen(true); }
    catch(e){ alert(`Failed to open edit: ${e.response?.data?.error||e.message}`); }
  }

  async function saveEdit(){
    try{
      setSavingEdit(true);
      await axios.put(`${API}/${editingValue.id}`, editingValue, {headers:{ "Content-Type":"application/json" }});
      setEditingOpen(false); setSavingEdit(false); await load();
    }catch(err){ setSavingEdit(false); alert(`Failed to update: ${err.response?.data?.error||err.message}`); }
  }

  const kpis = useMemo(()=>({
    total:patients.length,
    avgAge:patients.length?Math.round(patients.reduce((s,p)=>s+(parseInt(p.age,10)||0),0)/patients.length):0,
    withPhone:patients.filter(p=>!!p.phone).length
  }),[patients]);

  return (
    <div className="patients-page">
      <Styles/>
      <div className="container-1200">
        {/* KPIs */}
        <div className="row kpi-row">
          <div className="card"><div>Total Patients</div><div>{kpis.total}</div></div>
          <div className="card"><div>Avg Age</div><div>{kpis.avgAge}</div></div>
          <div className="card"><div>With Phone</div><div>{kpis.withPhone}</div></div>
          <div className="card"><div>Search</div>
            <input className="input" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search by name…"/>
          </div>
        </div>

        {/* Add */}
        <div className="card">
          <h3>Add Patient</h3>
          <form onSubmit={add}>
            <div className="row">
              <div className="field col-4"><label className="label req">First name</label>
                <input className="input" value={form.first_name} onChange={e=>setForm({...form,first_name:e.target.value})}/>
              </div>
              <div className="field col-4"><label className="label">Middle name</label>
                <input className="input" value={form.middle_name} onChange={e=>setForm({...form,middle_name:e.target.value})}/>
              </div>
              <div className="field col-4"><label className="label req">Last name</label>
                <input className="input" value={form.last_name} onChange={e=>setForm({...form,last_name:e.target.value})}/>
              </div>
              <div className="field col-6"><label className="label">Email</label>
                <input className="input" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
              </div>
              <div className="field col-6"><label className="label req">Phone</label>
                <input className="input" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
              </div>
              <div className="field col-6"><label className="label">Birthdate</label>
                <input type="date" className="input" value={form.birthdate} onChange={e=>setForm({...form,birthdate:e.target.value})}/>
              </div>
              <div className="field col-6"><label className="label">Sex</label>
                <select className="input" value={form.sex} onChange={e=>setForm({...form,sex:e.target.value})}>
                  <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
                </select>
              </div>
            </div>
            <div style={{marginTop:12, textAlign:"right"}}>
              <button className="pill blue" type="submit">➕ Add</button>
            </div>
          </form>
        </div>

        {/* Patients Table */}
        <div className="card">
          <h3>Patients</h3>
          {error && <div style={{color:"#b91c1c"}}>⚠ {error}</div>}
          <div className="table-wrap">
            <table>
              <thead><tr>{["ID","Name","Email","Phone","Age","Last Visit","Actions"].map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {loading?(
                  <tr><td colSpan={7} style={{textAlign:"center"}}>Loading…</td></tr>
                ):patients.length?(
                  patients.map(p=>(
                    <tr key={p.id}>
                      <td data-label="ID">{blank(p.id)}</td>
                      <td data-label="Name">{compiledName(p)}</td>
                      <td data-label="Email">{blank(p.email)}</td>
                      <td data-label="Phone">{blank(p.phone)}</td>
                      <td data-label="Age">{blank(p.age)}</td>
                      <td data-label="Last Visit">{blank(fmtDate(p.last_visit))}</td>
                      <td data-label="Actions">
                        <div className="cell-actions">
                          <button className="pill green" onClick={()=>navigate(`/patients/${p.id}/manage`, { state:{patient:p} })}>📋 Manage</button>
                          <button className="pill blue" onClick={()=>beginEdit(p)}>✏️ Edit</button>
                          <button className="pill red" onClick={()=>del(p.id)}>❌ Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                ):(
                  <tr><td colSpan={7} style={{textAlign:"center",color:"var(--muted)"}}>No patients found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modals */}
        <CredsModal data={modalData} onClose={()=>setModalData(null)} />
        <EditModal open={editingOpen} value={editingValue} onChange={setEditingValue} onSave={saveEdit} onClose={()=>setEditingOpen(false)} saving={savingEdit}/>
      </div>
    </div>
  );
}
