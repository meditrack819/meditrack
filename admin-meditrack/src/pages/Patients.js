// src/pages/Patients.js
import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import PatientDetails from "./PatientDetails"; // ✅ new modal with Medical History

const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const API = `${API_BASE}/patients`;

/* ---------------- Styles ---------------- */
const Styles = () => (
  <style>{`
    .patients-page{
      --p-bg:#f5f6fb; --p-card:#fff; --p-text:#111827; --p-muted:#6b7280; --p-border:#e5e7eb;
      --p-blue:#1e40af; --p-red:#dc2626; --p-green:#16a34a; --radius:14px;
    }
    .patients-page, .patients-page *{ box-sizing:border-box; }
    .patients-page .page{ max-width:1100px; margin:0 auto; padding:16px; }
    .patients-page .card{ background:var(--p-card); border:1px solid var(--p-border); border-radius:var(--radius);
      padding:20px; margin-bottom:12px; }
    .patients-page h3{ margin:0 0 16px; }
    .patients-page .row{ display:grid; grid-template-columns:repeat(12, minmax(0,1fr)); gap:20px; }
    .patients-page .field{ display:flex; flex-direction:column; gap:6px; }
    .patients-page .label{ font-size:12px; color:var(--p-muted); }
    .patients-page .label.req::after{ content:" *"; color:var(--p-red); }
    .patients-page .input{ border:1px solid var(--p-border); border-radius:10px; padding:10px 12px; min-height:44px; }
    .patients-page .input.error{ border-color:var(--p-red); }
    .patients-page .error-text{ color:var(--p-red); font-size:12px; }
    .pill{ border:0; border-radius:999px; padding:10px 16px; font-weight:700; cursor:pointer; }
    .pill.blue{ background:var(--p-blue); color:#fff; }
    .pill.green{ background:var(--p-green); color:#fff; }
    .pill.red{ background:var(--p-red); color:#fff; }
    table{ width:100%; border-collapse:collapse; }
    th{ background:var(--p-blue); color:#fff; padding:10px; text-align:left; }
    td{ padding:10px; border-bottom:1px solid var(--p-border); }
    .modal-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .modal-card{ width:min(720px,100%); background:#fff; border-radius:16px; padding:18px; }
  `}</style>
);

/* ---------------- Helpers ---------------- */
function fmtDate(v){ if(!v) return "—"; const d=new Date(v); return isNaN(d)?v:new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(d); }
const blank=v=>(!v||v==="")?"—":v;

/* ---------------- Credentials Modal ---------------- */
function CredsModal({ data, onClose }){
  if(!data) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h3 style={{marginTop:0}}>🔐 New Patient Account</h3>
        {data.id && <p><strong>ID No.:</strong> {data.id}</p>}
        {data.phone && <p><strong>Phone:</strong> {data.phone}</p>}
        <p><strong>Password:</strong>{" "}
          <code style={{background:"#f3f4f6",border:"1px solid #e5e7eb",padding:"4px 8px",borderRadius:8}}>
            {data.password}
          </code>
        </p>
        <div className="cell-actions" style={{justifyContent:"center", marginTop:8}}>
          <button className="pill blue" onClick={()=>
            navigator.clipboard.writeText(`${data.email || data.phone} / ${data.password}`)
          }>📋 Copy</button>
          <button className="pill gray" onClick={onClose}>Close</button>
        </div>
        <p style={{color:"#6b7280", marginTop:8, fontSize:14}}>Share these credentials with the patient for app login.</p>
      </div>
    </div>
  );
}

/* ---------------- Page ---------------- */
export default function Patients() {
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState({
    mode:"new-auto", family_no:"", id:"",
    first_name:"", middle_name:"", last_name:"",
    email:"", phone:"", birthdate:"", sex:"",
    building_no:"", street:"", barangay:"", city:"",
    religion:"", civil_status:"", work:""
  });
  const [formErrors, setFormErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalData, setModalData] = useState(null);
  const [search, setSearch] = useState("");

  const [editingOpen, setEditingOpen] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState(null);

  const navigate = useNavigate();

  const toNull = (v)=> (v==null || (typeof v==="string" && v.trim()==="")) ? null : v;

  async function load(nameFilter){
    try {
      setLoading(true); setError("");
      const res = await axios.get(API, { params: nameFilter ? { name: nameFilter } : undefined });
      const rows = Array.isArray(res.data) ? res.data : [];
      setPatients(rows);
    } catch(e) {
      setError(e.response?.data?.error || e.message);
      setPatients([]);
    } finally { setLoading(false); }
  }

  useEffect(()=>{ load(); },[]);
  useEffect(()=>{ const t=setTimeout(()=>load(search), 350); return ()=>clearTimeout(t); },[search]);

  const bind = (key) => ({
    value: form[key],
    onChange: (e) => {
      const val = e.target.value;
      setForm(f => ({...f, [key]: val}));
      if(formErrors[key]) setFormErrors(errs => { const n={...errs}; delete n[key]; return n; });
    }
  });

  const validate = v=>{
    const errs={};
    const need=(k,m)=>{ if(!v[k]||String(v[k]).trim()==="") errs[k]=m; };
    need("first_name","First name required");
    need("last_name","Last name required");
    need("phone","Phone required");
    need("birthdate","Birthdate required");
    need("sex","Sex required");
    need("religion","Religion required");
    need("civil_status","Civil status required");
    need("work","Work required");
    need("building_no","Building No required");
    need("street","Street required");
    need("barangay","Barangay required");
    need("city","City required");
    if(v.mode==="existing"){ need("family_no","Family No required"); need("id","ID required"); }
    if(v.mode==="new-known"){ need("family_no","Family No required"); }

    // ✅ phone validation
    if (v.phone) {
      const num = v.phone.replace(/\D/g, "");
      if (!(num.length === 11 && num.startsWith("09"))) {
        errs.phone = "Phone must start with 09 and be 11 digits";
      }
    }

    return errs;
  };

  async function add(e){
    e.preventDefault();
    const errs=validate(form);
    setFormErrors(errs);
    if(Object.keys(errs).length) return;

    const payload={
      family_no: form.mode==="existing"||form.mode==="new-known"?toNull(form.family_no):null,
      id: form.mode==="existing"?toNull(form.id):null,
      first_name: form.first_name.trim(),
      middle_name: toNull(form.middle_name),
      last_name: form.last_name.trim(),
      email: form.email && form.email.trim()!=="" ? form.email.trim().toLowerCase() : null,
      phone: toNull(form.phone),
      birthdate: toNull(form.birthdate),
      sex: toNull(form.sex),
      building_no: toNull(form.building_no),
      street: toNull(form.street),
      barangay: toNull(form.barangay),
      city: toNull(form.city),
      religion: toNull(form.religion),
      civil_status: toNull(form.civil_status),
      work: toNull(form.work),
    };

    try{
      const {data}=await axios.post(API,payload);
      await load();
      setForm({
        ...form, family_no:"", id:"",
        first_name:"", middle_name:"", last_name:"",
        email:"", phone:"", birthdate:"", sex:"",
        building_no:"", street:"", barangay:"", city:"",
        religion:"", civil_status:"", work:""
      });
      setModalData(data);
    }catch(err){
      alert(`Failed: ${err.response?.data?.error||err.message}`);
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

  return (
    <div className="patients-page">
      <Styles/>
      <div className="page">

        {/* Add Patient */}
        <div className="card">
          <h3>Add Patient</h3>
          <form onSubmit={add}>
            <div className="row">
              <div className="field" style={{gridColumn:"span 12"}}>
                <label className="label">Registration Type</label>
                <select {...bind("mode")} className="input">
                  <option value="existing">Existing (Family No + ID)</option>
                  <option value="new-known">New (know Family No)</option>
                  <option value="new-auto">New (no Family No)</option>
                </select>
              </div>
              {form.mode==="existing" && (
                <>
                  <div className="field" style={{gridColumn:"span 6"}}>
                    <label className="label req">Family No</label>
                    <input className={`input ${formErrors.family_no?"error":""}`} {...bind("family_no")}/>
                    {formErrors.family_no && <div className="error-text">{formErrors.family_no}</div>}
                  </div>
                  <div className="field" style={{gridColumn:"span 6"}}>
                    <label className="label req">ID</label>
                    <input className={`input ${formErrors.id?"error":""}`} {...bind("id")}/>
                    {formErrors.id && <div className="error-text">{formErrors.id}</div>}
                  </div>
                </>
              )}
              {form.mode==="new-known" && (
                <div className="field" style={{gridColumn:"span 6"}}>
                  <label className="label req">Family No</label>
                  <input className={`input ${formErrors.family_no?"error":""}`} {...bind("family_no")}/>
                  {formErrors.family_no && <div className="error-text">{formErrors.family_no}</div>}
                </div>
              )}
              {/* Common fields */}
              <div className="field" style={{gridColumn:"span 4"}}>
                <label className="label req">First Name</label>
                <input className={`input ${formErrors.first_name?"error":""}`} {...bind("first_name")}/>
                {formErrors.first_name && <div className="error-text">{formErrors.first_name}</div>}
              </div>
              <div className="field" style={{gridColumn:"span 4"}}>
                <label className="label">Middle Name</label>
                <input className="input" {...bind("middle_name")}/>
              </div>
              <div className="field" style={{gridColumn:"span 4"}}>
                <label className="label req">Last Name</label>
                <input className={`input ${formErrors.last_name?"error":""}`} {...bind("last_name")}/>
                {formErrors.last_name && <div className="error-text">{formErrors.last_name}</div>}
              </div>
              <div className="field" style={{gridColumn:"span 6"}}>
                <label className="label req">Phone</label>
                <input
                  className={`input ${formErrors.phone?"error":""}`}
                  maxLength={11}
                  pattern="^09[0-9]{9}$"
                  title="Must start with 09 and be 11 digits"
                  {...bind("phone")}
                />
                {formErrors.phone && <div className="error-text">{formErrors.phone}</div>}
              </div>
              <div className="field" style={{gridColumn:"span 6"}}>
                <label className="label">Email (optional)</label>
                <input className="input" type="email" {...bind("email")}/>
              </div>
              <div className="field" style={{gridColumn:"span 4"}}>
                <label className="label req">Birthdate</label>
                <input type="date" className={`input ${formErrors.birthdate?"error":""}`} {...bind("birthdate")}/>
                {formErrors.birthdate && <div className="error-text">{formErrors.birthdate}</div>}
              </div>
              <div className="field" style={{gridColumn:"span 4"}}>
                <label className="label req">Sex</label>
                <select className={`input ${formErrors.sex?"error":""}`} {...bind("sex")}>
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
                {formErrors.sex && <div className="error-text">{formErrors.sex}</div>}
              </div>
              {/* Religion / Civil Status / Work */}
              <div className="field" style={{gridColumn:"span 4"}}>
                <label className="label req">Religion</label>
                <input className={`input ${formErrors.religion?"error":""}`} {...bind("religion")}/>
                {formErrors.religion && <div className="error-text">{formErrors.religion}</div>}
              </div>
              <div className="field" style={{gridColumn:"span 6"}}>
                <label className="label req">Civil Status</label>
                <select className={`input ${formErrors.civil_status?"error":""}`} {...bind("civil_status")}>
                  <option value="">Select</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Widowed">Widowed</option>
                  <option value="Separated">Separated</option>
                </select>
                {formErrors.civil_status && <div className="error-text">{formErrors.civil_status}</div>}
              </div>
              <div className="field" style={{gridColumn:"span 6"}}>
                <label className="label req">Work</label>
                <input className={`input ${formErrors.work?"error":""}`} {...bind("work")}/>
                {formErrors.work && <div className="error-text">{formErrors.work}</div>}
              </div>
              {/* Address */}
              <div className="field" style={{gridColumn:"span 3"}}>
                <label className="label req">Bldg/House No</label>
                <input className={`input ${formErrors.building_no?"error":""}`} {...bind("building_no")}/>
                {formErrors.building_no && <div className="error-text">{formErrors.building_no}</div>}
              </div>
              <div className="field" style={{gridColumn:"span 3"}}>
                <label className="label req">Street</label>
                <input className={`input ${formErrors.street?"error":""}`} {...bind("street")}/>
                {formErrors.street && <div className="error-text">{formErrors.street}</div>}
              </div>
              <div className="field" style={{gridColumn:"span 3"}}>
                <label className="label req">Barangay</label>
                <input className={`input ${formErrors.barangay?"error":""}`} {...bind("barangay")}/>
                {formErrors.barangay && <div className="error-text">{formErrors.barangay}</div>}
              </div>
              <div className="field" style={{gridColumn:"span 3"}}>
                <label className="label req">City</label>
                <input className={`input ${formErrors.city?"error":""}`} {...bind("city")}/>
                {formErrors.city && <div className="error-text">{formErrors.city}</div>}
              </div>
              <div style={{gridColumn:"span 12", textAlign:"right"}}>
                <button className="pill blue" type="submit">➕ Add</button>
              </div>
            </div>
          </form>
        </div>

        {/* Patients Table */}
        <div className="card">
          <h3>Patients</h3>
          <div className="table-wrap">
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
                      <td>{blank(p.id)}</td>
                      <td style={{fontWeight:600}}>{blank(p.name)}</td>
                      <td>{blank(p.email)}</td>
                      <td>{blank(p.phone)}</td>
                      <td>{blank(p.age)}</td>
                      <td>{blank(fmtDate(p.last_visit))}</td>
                      <td>
                        <div className="cell-actions">
                          <button className="pill green" onClick={() => navigate("/prescriptions", { state: { patient: p } })}>📋 Prescriptions</button>
                          <button className="pill blue" onClick={()=>{
                            setEditingPatientId(p.id);
                            setEditingOpen(true);
                          }}>✏️ Patient Info</button>
                          <button className="pill red" onClick={()=>del(p.id)}>❌ Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={7} style={{textAlign:"center", padding:16, color:"var(--p-muted)"}}>No patients found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modals */}
        <CredsModal data={modalData} onClose={()=>setModalData(null)} />
        {editingOpen && editingPatientId && (
          <PatientDetails
            patientId={editingPatientId}
            onClose={(updated) => {
              setEditingOpen(false);
              setEditingPatientId(null);
              if (updated) load();
            }}
          />
        )}
      </div>
    </div>
  );
}
