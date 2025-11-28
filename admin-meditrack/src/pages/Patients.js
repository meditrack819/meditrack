// src/pages/Patients.js
import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import PatientDetails from "./PatientDetails";

/* ---------- API ---------- */
const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const API = `${API_BASE}/api/patients`;

/* ---------- Dropdown Data ---------- */
const CITY_OPTIONS = ["Mandaluyong City"];
const BARANGAY_MAP = {
  "Mandaluyong City": [
    "Addition Hills","Bagong Silang","Barangka Drive","Barangka Ibaba","Barangka Ilaya",
    "Barangka Itaas","Buayang Bato","Daang Bakal","Hagdang Bato Itaas","Hagdang Bato Libis",
    "Harapin ang Bukas","Highway Hills","Hulo","Mabini–J. Rizal","Malamig","Mauway",
    "Namayan","New Zañiga","Old Zañiga","Pag-Asa","Plainview","Pleasant Hills",
    "Poblacion","San Jose","Vergara","Wack-Wack Greenhills"
  ],
};

/* ---------- Styles ---------- */
const InjectStyles = () => (
  <style>{`
:root {
  --primary:#1e40af; --danger:#dc2626; --success:#16a34a;
  --border:#e5e7eb; --bg:#f9fafb; --card:#fff; --muted:#6b7280; --radius:14px;
}

body {
  margin:0;
  background:var(--bg);
  color:#111827;
  font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif;
  overflow-x:hidden;
}
.patients-wrap, * { box-sizing:border-box; }
.patients-wrap {
  width:100%;
  margin:0 auto;
  padding:clamp(10px,3vw,24px);
  display:flex;
  flex-direction:column;
  gap:clamp(16px,3vw,28px);
  max-width:1280px;
  overflow-x:hidden;
}
.page-title {
  font-size:clamp(20px,2.2vw,24px);
  font-weight:700;
  color:var(--primary);
  margin:0 0 8px;
}
.card {
  background:var(--card);
  border:1px solid var(--border);
  border-radius:var(--radius);
  padding:clamp(16px,2vw,28px);
  box-shadow:0 2px 8px rgba(0,0,0,.05);
  width:100%;
  margin-inline:auto;
  overflow:hidden;
}
.form-row { display:grid; gap:14px; width:100%; }
@media(min-width:1200px){ .form-row{ grid-template-columns:repeat(4,minmax(0,1fr)); } }
@media(min-width:768px) and (max-width:1199px){ .form-row{ grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(max-width:767px){ .form-row{ grid-template-columns:1fr; gap:12px; } }
.field { display:flex; flex-direction:column; gap:4px; }
.label { font-size:13px; color:var(--muted); font-weight:500; }
.label.req::after { content:" *"; color:var(--danger); }
.input, select {
  border:1px solid var(--border);
  border-radius:8px;
  padding:10px 12px;
  font-size:14px;
  background:#fff;
  width:100%;
  transition:border-color .2s, box-shadow .2s;
}
.input:focus, select:focus {
  border-color:var(--primary);
  outline:none;
  box-shadow:0 0 0 2px rgba(30,64,175,.12);
}
.input.error { border-color:var(--danger); }
.error-text { color:var(--danger); font-size:12px; }
.btn {
  display:flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  border:none;
  border-radius:10px;
  height:38px;
  padding:0 16px;
  font-weight:700;
  font-size:13px;
  color:#fff;
  cursor:pointer;
  transition:opacity .2s, transform .1s;
}
.btn.primary { background:var(--primary); }
.btn.success { background:var(--success); }
.btn.danger { background:var(--danger); }
.btn:hover { opacity:.95; transform:translateY(-1px); }
.toolbar {
  display:flex;
  align-items:center;
  justify-content:space-between;
  flex-wrap:wrap;
  gap:12px;
  margin-bottom:14px;
}
.toolbar input[type="search"] {
  flex:1;
  max-width:320px;
  border:1.5px solid var(--border);
  border-radius:999px;
  padding:10px 14px;
  font-size:14px;
  background:#fff;
  box-shadow:0 2px 4px rgba(0,0,0,0.05);
}
.table-wrap { width:100%; overflow-x:auto; border-radius:10px; }
table {
  width:100%;
  border-collapse:collapse;
  background:#fff;
  font-size:14px;
  min-width:800px;
}
th, td {
  padding:10px 14px;
  border-bottom:1px solid var(--border);
  text-align:left;
  vertical-align:middle;
}
th {
  background:var(--primary);
  color:#fff;
  font-weight:600;
  position:sticky;
  top:0;
  z-index:2;
}
td.name-cell { font-weight:700; color:var(--primary); }
th.th-actions, td.td-actions { text-align:left; padding-left:14px; }
.cell-actions {
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  justify-content:flex-start;
  align-items:center;
  margin-left:-4px;
}
@media(max-width:768px){ .cell-actions { justify-content:center; margin-left:0; } }
.toast {
  position:fixed;
  top:20px;
  right:20px;
  z-index:9999;
  background:linear-gradient(90deg,#1e40af,#3b82f6);
  color:#fff;
  padding:12px 20px;
  border-radius:10px;
  font-weight:600;
  box-shadow:0 4px 12px rgba(0,0,0,.15);
}
.modal-backdrop {
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.45);
  display:flex;
  align-items:center;
  justify-content:center;
  z-index:1000;
  padding:16px;
}
.modal-card {
  background:#fff;
  border-radius:12px;
  padding:24px;
  width:100%;
  max-width:380px;
  box-shadow:0 4px 20px rgba(0,0,0,.15);
}
.modal-card h4 { margin-top:0; color:var(--primary); }
.modal-card p { font-size:14px; margin:8px 0 16px; }
`}</style>
);

/* ---------- Helpers ---------- */
const blank = (v) => (!v || v === "") ? "—" : v;
const cap = (s) => (!s ? "" : s.replace(/\b\w/g, (c) => c.toUpperCase()));

/* ---------- Component ---------- */
export default function Patients() {
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState({
  mode:"new-auto", family_no:"", id:"",
  first_name:"", middle_name:"", last_name:"", suffix:"",
  email:"", phone:"", birthdate:"", sex:"",
  religion:"", civil_status:"", work:"",
  building_no:"", street:"", barangay:"", city:"",
  diagnosis:"" // ✅ added
});

  const [formErrors, setFormErrors] = useState({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editingOpen, setEditingOpen] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState(null);
  const navigate = useNavigate();

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(null),3500); };

  const getAge = (birthdate) => {
    if (!birthdate) return null;
    const b = new Date(birthdate);
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age;
  };

  async function load(filter){
    try{
      setLoading(true);
      const res = await axios.get(API, { params: filter ? { name: filter } : undefined });
      setPatients(Array.isArray(res.data) ? [...res.data].reverse() : []);
    }catch(e){ console.error(e); }finally{ setLoading(false); }
  }
  useEffect(()=>{ load(); },[]);
  useEffect(()=>{ const t=setTimeout(()=>load(search),300); return()=>clearTimeout(t); },[search]);

  const bind = (key) => ({
    value: form[key],
    onChange: (e) => {
      let v = e.target.value;
      if(["first_name","middle_name","last_name","suffix","religion","work","building_no","street"].includes(key))
        v = cap(v);
      setForm(f => ({...f, [key]: v}));
      if(formErrors[key]) setFormErrors(errs => { const n={...errs}; delete n[key]; return n; });
    }
  });

  const validate = (v) => {
    const e = {};
    const req = (k) => { if(!v[k] || String(v[k]).trim()==="") e[k]="Required"; };
    if (v.mode === "existing") { req("family_no"); req("id"); }
    else if (v.mode === "new-known") { req("family_no"); }

    ["first_name","last_name","phone","birthdate","sex","religion","civil_status","work","building_no","street","barangay","city"].forEach(req);

    const clean = v.phone.replace(/\D/g,"");
    if(clean && !/^09\d{9}$/.test(clean)) e.phone="Phone must start with 09 and be 11 digits";

    const age = getAge(v.birthdate);
    if(age!==null && age<0) e.birthdate="Birthdate cannot be in the future";

    return e;
  };

async function add(e) {
  e.preventDefault();

  const errs = validate(form);
  setFormErrors(errs);
  if (Object.keys(errs).length)
    return showToast("⚠️ Please fill all required fields correctly.");


const diagnosisValue =
  form.diagnosis === "Other"
    ? form.customDiagnosis
    : form.diagnosis || "General Check-Up";

const payload = { ...form, email: "", diagnosis: diagnosisValue };


  try {
    const res = await axios.post(API, payload);

    // res.data includes: { id, family_no, email, password }
    setPatients((p) => [res.data, ...p]);

    // ✅ Show the backend-generated email in the form (so user sees it)
    setForm((f) => ({ ...f, email: res.data.email, id: res.data.id, family_no: res.data.family_no }));

    showToast(`✅ Patient added`);

    // (Optional) if you want to fully reset after add, keep this block.
    // Remove it if you want to keep showing the generated id/email in the form.
    setForm({
      mode: "new-auto",
      family_no: "",
      id: "",
      first_name: "",
      middle_name: "",
      last_name: "",
      suffix: "",
      email: "",
      phone: "",
      birthdate: "",
      sex: "",
      religion: "",
      civil_status: "",
      work: "",
      building_no: "",
      street: "",
      barangay: "",
      city: "",
    });
  } catch (err) {
    showToast(`⚠️ Failed: ${err?.response?.data?.error || err.message}`);
  }
}

  const confirmDelete = async() => {
    try{
      await axios.delete(`${API}/${deleteConfirm}`);
      setPatients(p => p.filter(x => x.id !== deleteConfirm));
      showToast("🗑️ Patient deleted successfully.");
    }catch(err){ showToast(`⚠️ Failed: ${err?.response?.data?.error || err.message}`); }
    setDeleteConfirm(null);
  };

  return (
    <div className="patients-wrap">
      <InjectStyles/>
      <h2 className="page-title">Patients Management</h2>

      {/* ---------- Add Patient ---------- */}
      <div className="card">
        <h2>Add Patient</h2>
        <form onSubmit={add}>
          <div className="form-row">
            <div className="field" style={{ gridColumn:"1 / -1" }}>
              <label className="label">Registration Type</label>
              <select className="input" value={form.mode} onChange={(e)=>{
                const val=e.target.value;
                setForm(f=>({...f,mode:val,family_no:val==="new-auto"?"":f.family_no,id:val!=="existing"?"":f.id}));
              }}>
                <option value="existing">Existing (Family No + ID)</option>
                <option value="new-known">New (know Family No)</option>
                <option value="new-auto">New (no Family No)</option>
              </select>
            </div>

            {form.mode==="existing"&&<>
              <div className="field"><label className="label req">Family No</label><input className="input" {...bind("family_no")}/></div>
              <div className="field"><label className="label req">Patient ID</label><input className="input" {...bind("id")}/></div>
            </>}
            {form.mode==="new-known"&&(
              <div className="field" style={{gridColumn:"span 4"}}>
                <label className="label req">Family No</label><input className="input" {...bind("family_no")}/>
              </div>
            )}

            {[
              ["first_name","First Name",true],
              ["middle_name","Middle Name",false],
              ["last_name","Last Name",true],
              ["suffix","Suffix",false],
              ["phone","Phone",true],
              ["email","Email",false,"email"],
            ].map(([k,l,r,t])=>(
              <div key={k} className="field">
                <label className={`label${r?" req":""}`}>{l}</label>
                <input className={`input ${formErrors[k]?"error":""}`} type={t||"text"} {...bind(k)}/>
                {formErrors[k]&&<div className="error-text">{formErrors[k]}</div>}
              </div>
            ))}

            <div className="field">
              <label className="label req">Birthdate</label>
              <input className={`input ${formErrors.birthdate?"error":""}`} type="date"
                max={new Date().toISOString().split("T")[0]}
                {...bind("birthdate")}/>
            </div>
            <div className="field">
              <label className="label req">Sex</label>
              <select className="input" {...bind("sex")}>
                <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
              </select>
            </div>

            {[
              ["religion","Religion",true],
              ["civil_status","Civil Status",true,"select"],
              ["work","Work",true],
              ["building_no","Bldg/House No",true],
              ["street","Street",true],
            ].map(([k,l,r,t])=>(
              <div key={k} className="field">
                <label className={`label${r?" req":""}`}>{l}</label>
                {t==="select"
                  ?<select className="input" {...bind(k)}><option value="">Select</option><option>Single</option><option>Married</option><option>Widowed</option><option>Separated</option></select>
                  :<input className="input" {...bind(k)}/>}
              </div>
            ))}

            <div className="field">
              <label className="label req">City</label>
              <select className="input" value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value,barangay:""}))}>
                <option value="">Select City</option>
                {CITY_OPTIONS.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label req">Barangay</label>
              <select className="input" value={form.barangay} onChange={e=>setForm(f=>({...f,barangay:e.target.value}))} disabled={!form.city}>
                <option value="">{form.city?"Select Barangay":"Select City first"}</option>
                {(BARANGAY_MAP[form.city]||[]).map(b=><option key={b} value={b}>{b}</option>)}
              </select>
            </div>

{/* ---------- Diagnosis Field ---------- */}
<div className="field" style={{ gridColumn: "1 / -1" }}>
  <label className="label">Diagnosis / Illness</label>
  <select
    className="input"
    value={form.diagnosis}
    onChange={(e) =>
      setForm((f) => ({
        ...f,
        diagnosis: e.target.value,
        customDiagnosis: "",
      }))
    }
  >
    <option value="">— None / General Check-Up —</option>
    <option value="Hypertension">Hypertension</option>
    <option value="Diabetes">Diabetes</option>
    <option value="Asthma">Asthma</option>
    <option value="Tuberculosis">Tuberculosis</option>
    <option value="Tooth Extraction">Tooth Extraction</option>
    <option value="Follow-up Check-up">Follow-up Check-up</option>
    <option value="Other">Other (Specify)</option>
  </select>

  {/* When "Other" is selected, show custom text input */}
  {form.diagnosis === "Other" && (
    <input
      type="text"
      className="input"
      style={{ marginTop: 8 }}
      placeholder="Enter custom diagnosis"
      value={form.customDiagnosis || ""}
      onChange={(e) =>
        setForm((f) => ({ ...f, customDiagnosis: e.target.value }))
      }
    />
  )}
</div>


            <div style={{gridColumn:"1 / -1",marginTop:10}}>
              <button className="btn primary" type="submit">➕ Add Patient</button>
            </div>
          </div>
        </form>
      </div>

      {/* ---------- Patients Table ---------- */}
      <div className="card table-view">
        <div className="toolbar">
          <h2>Patients</h2>
          <input type="search" placeholder="Search by name..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Age</th>
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign:"center", padding:14 }}>Loading…</td></tr>
              ) : patients.length ? (
                patients.map(p=>(
                  <tr key={p.id}>
                    <td>{blank(p.id)}</td>
                    <td className="name-cell">{blank(p.name || `${p.first_name||""} ${p.last_name||""}`.trim())}</td>
                    <td>{blank(p.phone)}</td>
                    <td>{blank(p.age)}</td>
                    <td className="td-actions">
                      <div className="cell-actions">
                        <button className="btn success" onClick={()=>navigate("/prescriptions",{state:{patient:p}})}>📋 Prescriptions</button>
                        <button className="btn primary" onClick={()=>{setEditingPatientId(p.id);setEditingOpen(true);}}>✏️ Info</button>
                        <button className="btn danger" onClick={()=>setDeleteConfirm(p.id)}>❌ Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} style={{ textAlign:"center", color:"var(--muted)", padding:14 }}>No patients found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingOpen&&editingPatientId&&(
        <PatientDetails
          patientId={editingPatientId}
          onClose={(u)=>{setEditingOpen(false);setEditingPatientId(null);if(u){load();showToast("✅ Patient info updated successfully.");}}}
        />
      )}
      {toast&&<div className="toast">{toast}</div>}
      {deleteConfirm&&(
        <div className="modal-backdrop">
          <div className="modal-card">
            <h4>Delete Patient</h4>
            <p>Are you sure you want to delete this patient?</p>
            <div style={{display:"flex",justifyContent:"flex-end",gap:"8px"}}>
              <button className="btn" style={{background:"#e5e7eb",color:"#111"}} onClick={()=>setDeleteConfirm(null)}>Cancel</button>
              <button className="btn danger" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
