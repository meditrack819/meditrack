// src/pages/Prescriptions.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useLocation, useNavigate, useParams } from "react-router-dom";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://meditrack.space/api";
const RX_API = `${API_BASE}/prescriptions`;
const PT_API = `${API_BASE}/patients`;

const Styles = () => (
  <style>{`
    .rx-page{ --card:#fff; --muted:#6b7280; --border:#e5e7eb; --blue:#1e40af; --red:#dc2626; --green:#16a34a; }
    .rx-page .page{ max-width:1000px; margin:0 auto; padding:16px; }
    .rx-page .card{ background:var(--card); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:14px; }
    .rx-page h3{ margin:0 0 12px; }

    .rx-page .row{ display:grid; grid-template-columns:repeat(12,1fr); gap:16px; }
    .rx-page .field{ display:flex; flex-direction:column; gap:6px; }
    .rx-page .label{ font-size:12px; color:var(--muted); }
    .rx-page .label.req::after{ content:" *"; color:var(--red); }
    .rx-page .input{ border:1px solid var(--border); border-radius:6px; padding:6px 10px; min-height:34px; font-size:14px; }

    .rx-page .pill{ border:0; border-radius:6px; padding:5px 10px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px; font-size:12px; white-space:nowrap; }
    .rx-page .pill.blue{ background:var(--blue); color:#fff; }
    .rx-page .pill.red{ background:var(--red); color:#fff; }
    .rx-page .pill.green{ background:var(--green); color:#fff; }
    .rx-page .pill.gray{ background:#4b5563; color:#fff; }

    .rx-page table{ width:100%; border-collapse:collapse; font-size:13px; table-layout:fixed; }
    .rx-page thead th{ background:var(--blue); color:#fff; padding:8px; text-align:left; white-space:nowrap; }
    .rx-page tbody td{ padding:8px; border-bottom:1px solid var(--border); vertical-align:middle; }

    .rx-page th.id, .rx-page td.id{ width:80px; }
    .rx-page th.med, .rx-page td.med{ width:130px; }
    .rx-page th.num, .rx-page td.num{ width:60px; text-align:center; }
    .rx-page th.date, .rx-page td.date{ width:110px; }
    .rx-page th.inst, .rx-page td.inst{ width:160px; }
    .rx-page th.img, .rx-page td.img{ width:100px; text-align:center; }
    .rx-page th.act, .rx-page td.act{ width:150px; text-align:center; }

    .rx-page td.img, .rx-page td.act{ text-align:center; }
    .rx-page td.img label, .rx-page td.img button,
    .rx-page td.act button{ margin:2px; }

    .rx-page .modal-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .rx-page .modal-card{ background:#fff; border-radius:10px; padding:20px; max-width:420px; width:100%; }
  `}</style>
);

export default function Prescriptions() {
  const navigate = useNavigate();
  const { patientId: patientIdParam } = useParams();
  const location = useLocation();

  const [patient, setPatient] = useState(location.state?.patient || null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [medicines, setMedicines] = useState([
    { medication_name:"", times_per_day:"", duration_days:"", total_quantity:"", start_date:"", instructions:"" }
  ]);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editRx, setEditRx] = useState(null);
  const [search, setSearch] = useState("");

  const dbId = useMemo(() => {
    return patient?.id || patientIdParam || new URLSearchParams(location.search).get("patient_id") || "";
  }, [patient, patientIdParam, location.search]);

  const displayCode = patient?.patient_code || patient?.code || dbId;

  const loadPatient = async () => {
    if(!dbId) return;
    try {
      const {data} = await axios.get(`${PT_API}/${dbId}`);
      setPatient(data);
    } catch(err) {
      console.error("Failed to load patient", err);
    }
  };

  const load = async () => {
    if(!dbId) return;
    setLoading(true);
    try {
      const {data} = await axios.get(`${RX_API}/patient/${dbId}`);
      setPrescriptions(data||[]);
    } catch {
      setPrescriptions([]);
    }
    setLoading(false);
  };
  useEffect(()=>{ loadPatient(); load(); },[dbId]);

  const addMedicine = () => {
    setMedicines([...medicines, { medication_name:"", times_per_day:"", duration_days:"", total_quantity:"", start_date:"", instructions:"" }]);
  };
  const updateMedicine = (i,k,v) => {
    const copy=[...medicines];
    copy[i][k]=v;
    setMedicines(copy);
  };

  const confirmPrescription = () => setConfirmOpen(true);

  const savePrescription = async () => {
    setConfirmOpen(false);
    if(!dbId) return alert("No patient selected.");
    try{
      const newMeds = medicines.filter(m=>m.medication_name.trim());
      if(!newMeds.length) return alert("No medicines to save.");
      const seen = new Set();
      const unique = newMeds.filter(m => {
        const key = `${m.medication_name}-${m.start_date}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
      await Promise.all(unique.map(med =>
        axios.post(RX_API,{
          patient_id: dbId,
          medication_name: med.medication_name.trim(),
          times_per_day: Number(med.times_per_day),
          duration_days: Number(med.duration_days),
          total_quantity: Number(med.total_quantity),
          start_date: med.start_date || null,
          instructions: med.instructions || ""
        })
      ));
      alert("✅ Prescriptions saved.");
      setMedicines([{ medication_name:"", times_per_day:"", duration_days:"", total_quantity:"", start_date:"", instructions:"" }]);
      load();
    } catch(e) {
      alert("Failed to save: "+(e.response?.data?.error||e.message));
    }
  };

  const remove = async (id) => {
    if(!window.confirm("Delete prescription?")) return;
    try {
      await axios.delete(`${RX_API}/${id}`);
      setPrescriptions(prev => prev.filter(p => p.id !== id));
    } catch(e) {
      alert("Failed: "+(e.response?.data?.error||e.message));
    }
  };

  const uploadImage = async (id, file) => {
  if (!file) return alert("Please select a file first.");
  try {
    const form = new FormData();
    form.append("image", file); // ✅ must match backend

    console.log("Uploading:", id, file);

    await axios.post(`${RX_API}/${id}/image`, form); // let Axios handle headers

    alert("✅ Image uploaded.");
    load();

    const input = document.querySelector(`#file-input-${id}`);
    if (input) input.value = "";
  } catch (e) {
    console.error("upload error:", e);
    let msg = e.response?.data?.error || e.message;
    alert("Upload failed: " + msg);
  }
};

  const viewImage = async (id) => {
    try {
      const {data} = await axios.get(`${RX_API}/${id}/signed-url`);
      if (data?.url) window.open(data.url, "_blank");
      else alert("No image available.");
    } catch(e) {
      alert("Failed to load image: "+(e.response?.data?.error||e.message));
    }
  };

  const updateRx = async () => {
    if(!editRx) return;
    try {
      const {id, medication_name, times_per_day, duration_days, total_quantity, start_date, instructions} = editRx;
      await axios.put(`${RX_API}/${id}`, { medication_name, times_per_day, duration_days, total_quantity, start_date, instructions });
      alert("✅ Prescription updated.");
      setEditRx(null);
      load();
    } catch(e) {
      alert("Update failed: "+(e.response?.data?.error||e.message));
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return prescriptions;
    return prescriptions.filter(
      p => (p.medication_name || "").toLowerCase().includes(q) || (p.instructions || "").toLowerCase().includes(q)
    );
  }, [prescriptions, search]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const qtySum = filtered.reduce((s,p)=> s + (Number(p.total_quantity)||0), 0);
    const withImages = filtered.filter(p => p.image_path).length;
    const active = filtered.filter(p => Number(p.total_quantity) > 0).length;
    return { total, qtySum, withImages, active };
  }, [filtered]);

  const fullName = patient
    ? [patient.first_name, patient.middle_name, patient.last_name].filter(Boolean).join(" ") || patient.email
    : "";

  const formatDate = (dateStr) => {
    if(!dateStr) return "—";
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});
  };

  return (
    <div className="rx-page">
      <Styles/>
      <div className="page">
        {/* KPI row */}
        <div className="row" style={{marginBottom:12}}>
          <div className="card" style={{gridColumn:"span 3"}}>
            <div style={{color:"var(--muted)", fontSize:13}}>Total Prescriptions</div>
            <div style={{fontSize:22, fontWeight:800}}>{kpis.total}</div>
          </div>
          <div className="card" style={{gridColumn:"span 3"}}>
            <div style={{color:"var(--muted)", fontSize:13}}>Active</div>
            <div style={{fontSize:22, fontWeight:800}}>{kpis.active}</div>
          </div>
          <div className="card" style={{gridColumn:"span 3"}}>
            <div style={{color:"var(--muted)", fontSize:13}}>With Images</div>
            <div style={{fontSize:22, fontWeight:800}}>{kpis.withImages}</div>
          </div>
          <div className="card" style={{gridColumn:"span 3"}}>
            <div style={{color:"var(--muted)", fontSize:13}}>Search</div>
            <input className="input" placeholder="Search by medication…" value={search} onChange={(e)=>setSearch(e.target.value)}/>
          </div>
        </div>

        {/* Patient header */}
        <div className="card" style={{display:"flex", alignItems:"center", gap:16}}>
          <div>
            <div><strong>Patient:</strong> {fullName || "(loading…)"}</div>
            <div style={{color:"var(--muted)", fontSize:13}}>
              <strong>ID:</strong> {displayCode || "(none)"}
            </div>
          </div>
          <div style={{marginLeft:"auto", display:"flex", gap:8}}>
            <span className="pill green">Qty Sum: {kpis.qtySum}</span>
            <button className="pill blue" onClick={()=>navigate("/patients")}>← Back to Patients</button>
          </div>
        </div>

        {/* Add Prescription */}
        <div className="card">
          <h3>Add Prescription</h3>
          {medicines.map((m,idx)=>( 
            <div key={idx} className="row" style={{marginBottom:12}}>
              <div className="field" style={{gridColumn:"span 4"}}>
                <label className="label req">Medication</label>
                <input className="input" value={m.medication_name} onChange={e=>updateMedicine(idx,"medication_name",e.target.value)}/>
              </div>
              <div className="field" style={{gridColumn:"span 2"}}>
                <label className="label req">Times/day</label>
                <input className="input" type="number" value={m.times_per_day} onChange={e=>updateMedicine(idx,"times_per_day",e.target.value)}/>
              </div>
              <div className="field" style={{gridColumn:"span 2"}}>
                <label className="label req">Duration (days)</label>
                <input className="input" type="number" value={m.duration_days} onChange={e=>updateMedicine(idx,"duration_days",e.target.value)}/>
              </div>
              <div className="field" style={{gridColumn:"span 2"}}>
                <label className="label req">Total Qty</label>
                <input className="input" type="number" value={m.total_quantity} onChange={e=>updateMedicine(idx,"total_quantity",e.target.value)}/>
              </div>
              <div className="field" style={{gridColumn:"span 3"}}>
                <label className="label">Start Date</label>
                <input className="input" type="date" value={m.start_date} onChange={e=>updateMedicine(idx,"start_date",e.target.value)}/>
              </div>
              <div className="field" style={{gridColumn:"span 5"}}>
                <label className="label">Instructions</label>
                <input className="input" value={m.instructions} onChange={e=>updateMedicine(idx,"instructions",e.target.value)}/>
              </div>
            </div>
          ))}

          <div style={{display:"flex", justifyContent:"flex-end", gap:8}}>
            <button className="pill blue" type="button" onClick={addMedicine}>➕ Add Medicine</button>
            <button className="pill green" type="button" onClick={confirmPrescription}>💾 Add Prescription</button>
          </div>
        </div>

         {/* Prescriptions Table */}
        <div className="card">
          <h3>Prescriptions</h3>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Medication</th>
                <th>Times/Day</th>
                <th>Duration</th>
                <th>Total Qty</th>
                <th>Start Date</th>
                <th>Instructions</th>
                <th>Image</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{textAlign:"center"}}>Loading…</td></tr>
              ) : prescriptions.length ? (
                prescriptions.map(p=>(
                  <tr key={p.id}>
                    <td title={p.id}>{p.id ? p.id.slice(0,6) : "—"}</td>
                    <td>{p.medication_name}</td>
                    <td>{p.times_per_day}</td>
                    <td>{p.duration_days}</td>
                    <td>{p.total_quantity}</td>
                    <td>{formatDate(p.start_date)}</td>
                    <td title={p.instructions}>{p.instructions || "—"}</td>
                    <td className="img">
                      {p.image_path ? (
                        <button className="pill gray" onClick={()=>viewImage(p.id)}>📷 View</button>
                      ) : (
                        <label className="pill blue" style={{cursor:"pointer"}}>
                          📤 Upload
                          <input
                            id={`file-input-${p.id}`}
                            type="file"
                            style={{display:"none"}}
                            onChange={e => uploadImage(p.id, e.target.files[0])}
                          />
                        </label>
                      )}
                    </td>
                    <td className="act">
                      <button className="pill blue" onClick={()=>setEditRx({...p})}>✏️ Edit</button>
                      <button className="pill red" onClick={()=>remove(p.id)}>❌ Delete</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={9} style={{textAlign:"center",color:"var(--muted)"}}>No prescriptions</td></tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Confirmation Modal */}
        {confirmOpen && (
          <div className="modal-backdrop">
            <div className="modal-card">
              <h3>Confirm Prescription</h3>
              <p>Save these medicines?</p>
              <ul>
                {medicines.filter(m=>m.medication_name).map((m,i)=>(
                  <li key={i}><strong>{m.medication_name}</strong> ({m.times_per_day || 0}x/day, {m.duration_days || 0} days)</li>
                ))}
              </ul>
              <div style={{display:"flex", justifyContent:"flex-end", gap:8, marginTop:12}}>
                <button className="pill gray" onClick={()=>setConfirmOpen(false)}>Cancel</button>
                <button className="pill green" onClick={savePrescription}>Confirm & Save</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editRx && (
          <div className="modal-backdrop">
            <div className="modal-card">
              <h3>Edit Prescription</h3>
              <div className="field">
                <label className="label req">Medication</label>
                <input
                  className="input"
                  value={editRx.medication_name}
                  onChange={e=>setEditRx({...editRx, medication_name:e.target.value})}
                />
              </div>
              <div className="field">
                <label className="label req">Times/day</label>
                <input
                  className="input"
                  type="number"
                  value={editRx.times_per_day}
                  onChange={e=>setEditRx({...editRx, times_per_day:e.target.value})}
                />
              </div>
              <div className="field">
                <label className="label req">Duration (days)</label>
                <input
                  className="input"
                  type="number"
                  value={editRx.duration_days}
                  onChange={e=>setEditRx({...editRx, duration_days:e.target.value})}
                />
              </div>
              <div className="field">
                <label className="label req">Total Qty</label>
                <input
                  className="input"
                  type="number"
                  value={editRx.total_quantity}
                  onChange={e=>setEditRx({...editRx, total_quantity:e.target.value})}
                />
              </div>
              <div className="field">
                <label className="label">Start Date</label>
                <input
                  className="input"
                  type="date"
                  value={editRx.start_date ? editRx.start_date.split("T")[0] : ""}
                  onChange={e=>setEditRx({...editRx, start_date:e.target.value})}
                />
              </div>
              <div className="field">
                <label className="label">Instructions</label>
                <input
                  className="input"
                  value={editRx.instructions || ""}
                  onChange={e=>setEditRx({...editRx, instructions:e.target.value})}
                />
              </div>
              <div style={{display:"flex", justifyContent:"flex-end", gap:8, marginTop:12}}>
                <button className="pill gray" onClick={()=>setEditRx(null)}>Cancel</button>
                <button className="pill green" onClick={updateRx}>💾 Save Changes</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}


