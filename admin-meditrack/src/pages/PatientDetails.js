// src/pages/PatientDetails.js
import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const API = `${API_BASE}/api/patients`;

/* ---------------- Labels (Tagalog, DOH Form) ---------------- */
const FIELD_LABELS = {
  diabetes: "Diabetes", hypertension: "Altapresyon", cancer: "Kanser",
  cancer_site: "Bahagi ng Kanser", lung_disease: "Sakit sa Baga", eye_disease: "Sakit sa Mata",

  chest_pain_exertion: "Pananakit ng dibdib kapag kumikilos",
  chest_pain_spread: "Sumasakit hanggang braso/panga",
  chest_pain_fast: "Mabilis ang tibok ng puso na may sakit",
  chest_pain_breathless: "Hirap sa paghinga na may sakit sa dibdib",
  chest_pain_sweating: "Pinapawisan/nasusuka kapag may sakit",
  chest_pain_relieved: "Gumagaan kapag nagpapahinga o may gamot",
  chest_pain_30min: "Sakit na tumatagal ng lampas 30 minuto",
  chest_pain_other: "Iba pang sintomas",

  family_sakit_puso: "Sakit sa Puso (Pamilya)", family_stroke: "Stroke (Pamilya)", family_diabetes: "Diabetes (Pamilya)",
  family_cancer: "Kanser (Pamilya)", family_sakit_lungs: "Sakit sa Baga (Pamilya)", family_sakit_bato: "Sakit sa Bato (Pamilya)",
  family_other: "Iba pang Kondisyon sa Pamilya",

  gulay: "Kumakain ng Gulay", prutas: "Kumakain ng Prutas", isda: "Kumakain ng Isda",
  karne: "Kumakain ng Karne", processed: "Kumakain ng Processed Food",
  maalat_per_week: "Ilang Beses Kumain ng Maalat kada Linggo",

  umiinom: "Umiinom ng Alak", klase_alak: "Uri ng Alak", gaano_karami: "Dami ng Alak",
  kadalas_inom: "Gaano Kadals Inom", binge: "Binge Drinking",

  naninigarilyo: "Naninigarilyo", sticks_per_day: "Ilang Stick bawat Araw",
  tumigil: "Tumigil sa Paninigarilyo", years_quit: "Ilang Taon Mula nang Tumigil",
  ever_100_sticks: "Naka-100 stick na sa buong buhay",

  ehersisyo: "Nag-eehersisyo", uri_ehersisyo: "Uri ng Ehersisyo", sapat_ehersisyo: "Sapat ba ang Ehersisyo",

  stress: "May Stress", stress_dahilan: "Sanhi ng Stress", stress_effect: "Epekto ng Stress",

  weight: "Timbang (kg)", height: "Taas (cm)", waist: "Baywang (cm)", hip: "Balakang (cm)",
  bmi: "BMI", wh_ratio: "Waist-Hip Ratio",
  fbs: "Fasting Blood Sugar", rbs: "Random Blood Sugar",
  left_bp: "BP Kaliwa", right_bp: "BP Kanan", baseline_bp: "Karaniwang BP",
  cholesterol: "Kolesterol",
  urine_protein: "Protein sa Ihi", urine_ketones: "Ketones sa Ihi",
  risk_profile: "Porsyento ng Panganib",

  cancer_screened: "Nagpa-Screening ng Kanser",
  cancer_screen_type: "Uri ng Screening",
  cancer_screen_result: "Resulta ng Screening",

  temp: "Temperatura (°C)", hr: "Tibok ng Puso (bpm)", rr: "Paghinga (beses/minuto)",
  spo2: "Oxygen Saturation (%)", systolic: "Systolic BP", diastolic: "Diastolic BP",
};

/* ---------------- Types ---------------- */
const FIELD_TYPES = {
  diabetes: "boolean", hypertension: "boolean", cancer: "boolean",
  lung_disease: "boolean", eye_disease: "boolean",

  chest_pain_exertion: "boolean", chest_pain_spread: "boolean", chest_pain_fast: "boolean",
  chest_pain_breathless: "boolean", chest_pain_sweating: "boolean", chest_pain_relieved: "boolean",
  chest_pain_30min: "boolean", chest_pain_other: "text",

  family_sakit_puso: "boolean", family_stroke: "boolean", family_diabetes: "boolean",
  family_cancer: "boolean", family_sakit_lungs: "boolean", family_sakit_bato: "boolean", family_other: "text",

  gulay: "boolean", prutas: "boolean", isda: "boolean", karne: "boolean", processed: "boolean",
  maalat_per_week: "number",

  umiinom: "boolean", klase_alak: "text", gaano_karami: "text", kadalas_inom: "text", binge: "boolean",

  naninigarilyo: "boolean", sticks_per_day: "number", tumigil: "boolean", years_quit: "number", ever_100_sticks: "boolean",

  ehersisyo: "boolean", uri_ehersisyo: "text", sapat_ehersisyo: "boolean",

  stress: "boolean", stress_dahilan: "text", stress_effect: "text",

  weight: "number", height: "number", waist: "number", hip: "number",
  bmi: "calculated", wh_ratio: "calculated",
  fbs: "number", rbs: "number", cholesterol: "number",
  left_bp: "number", right_bp: "number", baseline_bp: "number",
  urine_protein: "boolean", urine_ketones: "boolean",
  risk_profile: "number",

  cancer: "boolean", cancer_site: "text",
  cancer_screened: "boolean", cancer_screen_type: "text", cancer_screen_result: "text",

  temp: "number", hr: "number", rr: "number", spo2: "number", systolic: "number", diastolic: "number",
};

/* ---------------- Groups ---------------- */
const FIELD_GROUPS = {
  "Kasaysayan ng Sakit (Nakaraan)": ["diabetes","hypertension","cancer","cancer_site","lung_disease","eye_disease"],
  "Pananakit ng Dibdib": ["chest_pain_exertion","chest_pain_spread","chest_pain_fast","chest_pain_breathless","chest_pain_sweating","chest_pain_relieved","chest_pain_30min","chest_pain_other"],
  "Kasaysayan ng Pamilya": ["family_sakit_puso","family_stroke","family_diabetes","family_cancer","family_sakit_lungs","family_sakit_bato","family_other"],
  "Pamumuhay - Nutrisyon": ["gulay","prutas","isda","karne","processed","maalat_per_week"],
  "Pamumuhay - Alak": ["umiinom","klase_alak","gaano_karami","kadalas_inom","binge"],
  "Pamumuhay - Paninigarilyo": ["naninigarilyo","sticks_per_day","tumigil","years_quit","ever_100_sticks"],
  "Pamumuhay - Ehersisyo": ["ehersisyo","uri_ehersisyo","sapat_ehersisyo"],
  "Stress": ["stress","stress_dahilan","stress_effect"],
  "Pagsusuri ng Panganib": ["weight","height","waist","hip","bmi","wh_ratio","fbs","rbs","left_bp","right_bp","baseline_bp","cholesterol","urine_protein","urine_ketones","risk_profile"],
  "Screening ng Kanser": ["cancer_screened","cancer_screen_type","cancer_screen_result"],
};

/* ---------------- Vitals Chart Component ---------------- */
function VitalsChart({ vitals }) {
  const data = vitals.map(v => ({
    date: new Date(v.created_at).toLocaleDateString(),
    temp: v.temp,
    hr: v.hr,
    rr: v.rr,
    spo2: v.spo2,
    systolic: v.systolic,
    diastolic: v.diastolic,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="temp" stroke="#ef4444" name="Temp (°C)" />
        <Line type="monotone" dataKey="hr" stroke="#3b82f6" name="HR (bpm)" />
        <Line type="monotone" dataKey="rr" stroke="#22c55e" name="RR" />
        <Line type="monotone" dataKey="spo2" stroke="#a855f7" name="SpO₂ (%)" />
        <Line type="monotone" dataKey="systolic" stroke="#f59e0b" name="Systolic BP" />
        <Line type="monotone" dataKey="diastolic" stroke="#6366f1" name="Diastolic BP" />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ---------------- Main Component ---------------- */
export default function PatientDetails({ patientId, onClose }) {
  const [patient, setPatient] = useState(null);
  const [form, setForm] = useState({});
  const [history, setHistory] = useState({});
  const [editingHistory, setEditingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [vitalsLog, setVitalsLog] = useState([]);
  const [newVitals, setNewVitals] = useState({});
  const [expanded, setExpanded] = useState(() =>
    Object.keys(FIELD_GROUPS).reduce((a, k) => ({ ...a, [k]: true }), { Vitals: true })
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingHistory, setSavingHistory] = useState(false);
  const [savingVitals, setSavingVitals] = useState(false);

  /* --- Fetch patient --- */
  useEffect(() => {
    if (!patientId) return;
    (async () => {
      try {
        setLoading(true);
        const { data } = await axios.get(`${API}/${patientId}`);
        setPatient(data);
        setForm({
          first_name: data.first_name || "", middle_name: data.middle_name || "",
          last_name: data.last_name || "", email: data.email || "", phone: data.phone || "",
          birthdate: data.birthdate ? String(data.birthdate).slice(0, 10) : "",
          sex: data.sex || "", building_no: data.building_no || "",
          street: data.street || "", barangay: data.barangay || "", city: data.city || "",
          last_visit: data.last_visit ? String(data.last_visit).slice(0, 10) : "",
        });
        const histRes = await axios.get(`${API}/${patientId}/history`);
        setHistory(histRes.data || {});
        const vitalsRes = await axios.get(`${API}/${patientId}/vitals`);
        setVitalsLog(vitalsRes.data || []);
      } catch (err) {
        console.error("❌ fetch error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [patientId]);

  /* --- Save Patient Info --- */
  const handleChange = (f, v) => setForm({ ...form, [f]: v });
  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await axios.put(`${API}/${patientId}`, form, { headers: { "Content-Type": "application/json" } });
      onClose(true);
    } catch {
      alert("Hindi nasave ang pagbabago.");
    } finally {
      setSaving(false);
    }
  };

  /* --- Medical History --- */
  const handleHistoryChange = (f, v) => setHistory({ ...history, [f]: v });
  const handleHistorySave = async () => {
    try {
      setSavingHistory(true);
      await axios.put(`${API}/${patientId}/history`, history, { headers: { "Content-Type": "application/json" } });
      setEditingHistory(false);
    } catch {
      alert("Hindi nasave ang kasaysayan.");
    } finally {
      setSavingHistory(false);
    }
  };

  /* --- Vitals --- */
  const handleVitalsChange = (f, v) => setNewVitals({ ...newVitals, [f]: v });
  const handleSaveVitals = async () => {
    try {
      setSavingVitals(true);
      await axios.post(`${API}/${patientId}/vitals`, newVitals, { headers: { "Content-Type": "application/json" } });
      setNewVitals({});
      const vitalsRes = await axios.get(`${API}/${patientId}/vitals`);
      setVitalsLog(vitalsRes.data || []);
    } catch {
      alert("Hindi nasave ang vitals.");
    } finally {
      setSavingVitals(false);
    }
  };

  /* --- Render History Field --- */
  const renderField = (f) => {
    const type = FIELD_TYPES[f] || "text";
    const val = history[f] ?? "";
    if (!editingHistory) {
      if (type === "boolean")
        return val ? <span className="badge yes">Oo</span> : <span className="badge no">Hindi</span>;
      if (type === "calculated")
        return <span className="badge calc">{val || "—"}</span>;
      return val ? String(val) : "—";
    }
    if (type === "boolean") {
      return (
        <label className="switch">
          <input type="checkbox" checked={!!val} onChange={e=>handleHistoryChange(f,e.target.checked)} />
          <span className="slider"></span>
        </label>
      );
    }
    return <input type={type==="number"?"number":"text"} value={val||""} onChange={e=>handleHistoryChange(f,e.target.value)} />;
  };

  return (
    <>
      {/* Patient Info Modal */}
      <div className="modal-overlay">
        <div className="modal wide">
          <div className="modal-header">
            <h2>✏️ Edit Patient — {patient?.first_name} {patient?.last_name}</h2>
            <button onClick={()=>onClose(false)} className="btn gray">✖ Close</button>
          </div>
          {!loading && patient ? (
            <form onSubmit={handleSave} className="modal-content">
              <div className="modal-body scrollable">
                <div className="card-grid">
                  <div className="card">
                    <h3>👤 Personal Info</h3>
                    <div className="form-grid">
                      <div className="field"><label>First Name *</label>
                        <input value={form.first_name} onChange={e=>handleChange("first_name",e.target.value)} required />
                      </div>
                      <div className="field"><label>Middle Name</label>
                        <input value={form.middle_name} onChange={e=>handleChange("middle_name",e.target.value)} />
                      </div>
                      <div className="field"><label>Last Name *</label>
                        <input value={form.last_name} onChange={e=>handleChange("last_name",e.target.value)} required />
                      </div>
                      <div className="field"><label>Birthdate *</label>
                        <input type="date" value={form.birthdate} onChange={e=>handleChange("birthdate",e.target.value)} required />
                      </div>
                      <div className="field"><label>Sex *</label>
                        <select value={form.sex} onChange={e=>handleChange("sex",e.target.value)} required>
                          <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="card">
                    <h3>📞 Contact & Address</h3>
                    <div className="form-grid">
                      <div className="field"><label>Email</label>
                        <input type="email" value={form.email} onChange={e=>handleChange("email",e.target.value)} />
                      </div>
                      <div className="field"><label>Phone *</label>
                        <input value={form.phone} onChange={e=>handleChange("phone",e.target.value)} required />
                      </div>
                      <div className="field"><label>Bldg/House No *</label>
                        <input value={form.building_no} onChange={e=>handleChange("building_no",e.target.value)} required />
                      </div>
                      <div className="field"><label>Street *</label>
                        <input value={form.street} onChange={e=>handleChange("street",e.target.value)} required />
                      </div>
                      <div className="field"><label>Barangay *</label>
                        <input value={form.barangay} onChange={e=>handleChange("barangay",e.target.value)} required />
                      </div>
                      <div className="field"><label>City *</label>
                        <input value={form.city} onChange={e=>handleChange("city",e.target.value)} required />
                      </div>
                      <div className="field"><label>Last Visit</label>
                        <input type="date" value={form.last_visit} onChange={e=>handleChange("last_visit",e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn blue" disabled={saving}>{saving?"Saving...":"💾 Save changes"}</button>
                <button type="button" className="btn green" onClick={()=>setShowHistory(true)}>🩺 Medical History</button>
              </div>
            </form>
          ):<div className="modal-body"><p>Loading patient...</p></div>}
        </div>
      </div>

      {/* Medical History Modal */}
      {showHistory && (
        <div className="modal-overlay">
          <div className="modal large">
            <div className="modal-header">
              <h2>🩺 Medical History — {patient?.first_name} {patient?.last_name}</h2>
              <div className="search-box">
                <input type="text" placeholder="🔍 Search fields..." value={search} onChange={e=>setSearch(e.target.value)} />
              </div>
              <button onClick={()=>setShowHistory(false)} className="btn gray">✖</button>
            </div>
            <div className="modal-body scrollable">
              {Object.entries(FIELD_GROUPS).map(([section, fields])=>{
                const visible = fields.filter(f=>(FIELD_LABELS[f]||f).toLowerCase().includes(search.toLowerCase()));
                if (!visible.length) return null;
                return (
                  <div key={section} className="accordion">
                    <button className="accordion-header" onClick={()=>setExpanded(p=>({...p,[section]:!p[section]}))}>
                      {section} <span>{expanded[section]?"▲":"▼"}</span>
                    </button>
                    {expanded[section] && (
                      <div className="accordion-body">
                        <div className="form-grid">
                          {visible.map(f=>(
                            <div key={f} className="field">
                              <label>{FIELD_LABELS[f]||f}</label>
                              {renderField(f)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Vitals Section */}
              <div className="accordion">
                <button className="accordion-header" onClick={()=>setExpanded(p=>({...p,Vitals:!p.Vitals}))}>
                  🩺 Vital Signs <span>{expanded.Vitals?"▲":"▼"}</span>
                </button>
                {expanded.Vitals && (
                  <div className="accordion-body">
                    <h4>➕ Add New Vitals</h4>
                    <div className="form-grid vitals-form">
                      {["temp","hr","rr","spo2","systolic","diastolic"].map(f=>(
                        <div key={f} className="field">
                          <label>{FIELD_LABELS[f]}</label>
                          <input type="number" value={newVitals[f]||""} onChange={e=>handleVitalsChange(f,e.target.value)} />
                        </div>
                      ))}
                    </div>
                    <button className="btn green" style={{marginTop:"10px"}} onClick={handleSaveVitals} disabled={savingVitals}>
                      {savingVitals?"Saving…":"💾 Save Vitals Log"}
                    </button>

                    <h4 style={{marginTop:"20px"}}>📜 Vitals History</h4>
                    <div className="table-wrapper">
                      <table className="vitals-table">
                        <thead>
                          <tr><th>Date</th><th>Temp</th><th>HR</th><th>RR</th><th>SpO₂</th><th>Systolic</th><th>Diastolic</th></tr>
                        </thead>
                        <tbody>
                          {vitalsLog.length>0?(
                            vitalsLog.map((v,i)=>(
                              <tr key={i}>
                                <td>{new Date(v.created_at).toLocaleString()}</td>
                                <td>{v.temp??"—"}</td><td>{v.hr??"—"}</td><td>{v.rr??"—"}</td>
                                <td>{v.spo2??"—"}</td><td>{v.systolic??"—"}</td><td>{v.diastolic??"—"}</td>
                              </tr>
                            ))
                          ):<tr><td colSpan="7">No vitals logged yet.</td></tr>}
                        </tbody>
                      </table>
                    </div>

                    {vitalsLog.length > 0 && (
                      <div style={{marginTop:"20px"}}>
                        <h4>📈 Vitals Trend</h4>
                        <VitalsChart vitals={vitalsLog} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              {!editingHistory ? (
                <button className="btn blue" onClick={()=>setEditingHistory(true)}>✏️ Edit</button>
              ) : (
                <>
                  <button className="btn green" onClick={handleHistorySave} disabled={savingHistory}>
                    {savingHistory?"Saving…":"💾 Save"}
                  </button>
                  <button className="btn gray" onClick={()=>setEditingHistory(false)}>❌ Cancel</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;justify-content:center;align-items:center;z-index:1000;padding:10px;}
        .modal{background:#fff;border-radius:12px;width:95%;max-width:720px;display:flex;flex-direction:column;max-height:90vh;box-shadow:0 4px 20px rgba(0,0,0,.1);overflow:hidden;}
        .modal.wide{max-width:960px;} .modal.large{max-width:1100px;}
        .modal-header{padding:16px 20px;border-bottom:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:center;background:#fff;gap:8px;}
        .modal-header h2{margin:0;font-size:18px;font-weight:600;color:#111827;flex:1;}
        .modal-body.scrollable{padding:20px;overflow-y:auto;flex:1;}
        .modal-footer{padding:16px 20px;border-top:1px solid #f3f4f6;display:flex;gap:12px;background:#fff;justify-content:flex-end;}
        .card-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
        .card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;}
        .card h3{margin-bottom:12px;font-size:16px;font-weight:600;color:#1f2937;}
        .form-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;}
        .field{display:flex;flex-direction:column;}
        .field label{font-weight:500;margin-bottom:6px;font-size:13px;color:#6b7280;}
        .field input,.field select{padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;}
        .accordion{border:1px solid #e5e7eb;border-radius:8px;margin-bottom:12px;overflow:hidden;}
        .accordion-header{width:100%;text-align:left;padding:12px 16px;background:#f3f4f6;border:none;font-weight:600;display:flex;justify-content:space-between;align-items:center;cursor:pointer;}
        .accordion-body{padding:12px 16px;background:#fff;}
        .badge{padding:4px 8px;border-radius:6px;font-size:13px;font-weight:500;}
        .badge.yes{background:#dcfce7;color:#166534;} .badge.no{background:#fee2e2;color:#991b1b;} .badge.calc{background:#e0f2fe;color:#075985;}
        .btn{padding:8px 14px;border-radius:8px;border:none;cursor:pointer;font-size:14px;font-weight:500;}
        .btn.blue{background:#2563eb;color:#fff;} .btn.green{background:#16a34a;color:#fff;} .btn.gray{background:#e5e7eb;color:#111;}
        .btn:hover{opacity:.9;}
        .switch{position:relative;display:inline-block;width:42px;height:22px;}
        .switch input{opacity:0;width:0;height:0;}
        .slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#ef4444;transition:.3s;border-radius:22px;}
        .slider:before{position:absolute;content:"";height:18px;width:18px;left:2px;bottom:2px;background:white;transition:.3s;border-radius:50%;}
        .switch input:checked + .slider{background:#22c55e;}
        .switch input:checked + .slider:before{transform:translateX(20px);}
        .search-box input{padding:6px 12px;border:1px solid #d1d5db;border-radius:9999px;font-size:14px;width:200px;}
        .table-wrapper{overflow-x:auto;border-radius:8px;border:1px solid #e5e7eb;margin-top:8px;}
        .vitals-table{width:100%;border-collapse:collapse;font-size:14px;}
        .vitals-table th,.vitals-table td{padding:8px 12px;text-align:center;border-bottom:1px solid #e5e7eb;}
        .vitals-table th{background:#f9fafb;font-weight:600;color:#374151;}
        .vitals-table tbody tr:nth-child(even){background:#f3f4f6;}
        .vitals-table tbody tr:hover{background:#e0f2fe;}
        canvas{max-height:320px;}
      `}</style>
    </>
  );
}
