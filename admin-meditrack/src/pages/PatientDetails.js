// src/pages/PatientDetails.js
import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

/* ============================================================
   ⚙️ API CONFIG
   ============================================================ */
const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const API = `${API_BASE}/api/patients`;

/* ============================================================
   📋 CITY / BARANGAY
   ============================================================ */
const CITY_OPTIONS = ["Mandaluyong City"];
const BARANGAY_MAP = {
  "Mandaluyong City": [
    "Addition Hills", "Bagong Silang", "Barangka Drive", "Barangka Ibaba",
    "Barangka Ilaya", "Barangka Itaas", "Buayang Bato", "Daang Bakal",
    "Hagdang Bato Itaas", "Hagdang Bato Libis", "Harapin ang Bukas", "Highway Hills",
    "Hulo", "Mabini–J. Rizal", "Malamig", "Mauway", "Namayan", "New Zañiga",
    "Old Zañiga", "Pag-Asa", "Plainview", "Pleasant Hills", "Poblacion",
    "San Jose", "Vergara", "Wack-Wack Greenhills",
  ],
};

/* ============================================================
   📋 FIELD LABELS & GROUPS
   ============================================================ */
const FIELD_LABELS = {
  diabetes: "Diabetes",
  hypertension: "Altapresyon",
  cancer: "Kanser",
  lung_disease: "Sakit sa Baga",
  eye_disease: "Sakit sa Mata",
  chest_pain_exertion: "Pananakit ng dibdib kapag kumikilos",
  chest_pain_spread: "Sumasakit hanggang braso/panga",
  chest_pain_fast: "Mabilis ang tibok ng puso na may sakit",
  chest_pain_breathless: "Hirap sa paghinga na may sakit sa dibdib",
  chest_pain_sweating: "Pinapawisan/nasusuka kapag may sakit",
  chest_pain_relieved: "Gumagaan kapag nagpapahinga o may gamot",
  chest_pain_30min: "Sakit na tumatagal ng lampas 30 minuto",
  family_sakit_puso: "Sakit sa Puso (Pamilya)",
  family_stroke: "Stroke (Pamilya)",
  family_diabetes: "Diabetes (Pamilya)",
  family_cancer: "Kanser (Pamilya)",
  family_sakit_lungs: "Sakit sa Baga (Pamilya)",
  family_sakit_bato: "Sakit sa Bato (Pamilya)",
  gulay: "Kumakain ng Gulay",
  prutas: "Kumakain ng Prutas",
  isda: "Kumakain ng Isda",
  karne: "Kumakain ng Karne",
  processed: "Kumakain ng Processed Food",
  umiinom: "Umiinom ng Alak",
  naninigarilyo: "Naninigarilyo",
  ehersisyo: "Nag-eehersisyo",
  stress: "May Stress",
  weight: "Timbang (kg)",
  height: "Taas (cm)",
  waist: "Baywang (cm)",
  hip: "Balakang (cm)",
  fbs: "Fasting Blood Sugar",
  rbs: "Random Blood Sugar",
  cholesterol: "Kolesterol",
  risk_profile: "Porsyento ng Panganib",
};

const FIELD_GROUPS = {
  "Kasaysayan ng Sakit (Nakaraan)": [
    "diabetes",
    "hypertension",
    "cancer",
    "lung_disease",
    "eye_disease",
  ],
  "Pananakit ng Dibdib": [
    "chest_pain_exertion",
    "chest_pain_spread",
    "chest_pain_fast",
    "chest_pain_breathless",
    "chest_pain_sweating",
    "chest_pain_relieved",
    "chest_pain_30min",
  ],
  "Kasaysayan ng Pamilya": [
    "family_sakit_puso",
    "family_stroke",
    "family_diabetes",
    "family_cancer",
    "family_sakit_lungs",
    "family_sakit_bato",
  ],
  Pamumuhay: [
    "gulay",
    "prutas",
    "isda",
    "karne",
    "processed",
    "umiinom",
    "naninigarilyo",
    "ehersisyo",
    "stress",
  ],
  "Pagsusuri ng Panganib": [
    "weight",
    "height",
    "waist",
    "hip",
    "fbs",
    "rbs",
    "cholesterol",
    "risk_profile",
  ],
};



/* ============================================================
   📈 VITALS CHART
   ============================================================ */
function VitalsChart({ vitals }) {
  const data = vitals.map((v) => ({
    datetime: new Date(v.created_at).toLocaleString("en-PH", {
      dateStyle: "short",
      timeStyle: "short",
    }),
    temp: v.temp,
    hr: v.hr,
    rr: v.rr,
    spo2: v.spo2,
    systolic: v.systolic,
    diastolic: v.diastolic,
  }));

  return (
    <div className="chart-card">
      <h4>📊 Vitals Trend</h4>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 15, right: 20, left: 10, bottom: 50 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="datetime" angle={-25} textAnchor="end" height={60} />
          <YAxis />
          <Tooltip />
          <Legend verticalAlign="bottom" height={45} />
          <Line type="monotone" dataKey="temp" stroke="#ef4444" name="Temperature (°C)" />
          <Line type="monotone" dataKey="hr" stroke="#3b82f6" name="Heart Rate (bpm)" />
          <Line type="monotone" dataKey="rr" stroke="#9333ea" name="Respiratory Rate" />
          <Line type="monotone" dataKey="spo2" stroke="#22c55e" name="SpO₂ (%)" />
          <Line type="monotone" dataKey="systolic" stroke="#f59e0b" name="Systolic" />
          <Line type="monotone" dataKey="diastolic" stroke="#6366f1" name="Diastolic" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================================================
   🔔 TOAST
   ============================================================ */
const Toast = ({ message }) =>
  message ? <div className="toast">{message}</div> : null;

/* ============================================================
   🧍 MAIN COMPONENT
   ============================================================ */
export default function PatientDetails({ patientId, onClose }) {
  const [tab, setTab] = useState("info");
  const [patient, setPatient] = useState(null);
  const [form, setForm] = useState({});
  const [history, setHistory] = useState({});
  const [expanded, setExpanded] = useState(() =>
    Object.keys(FIELD_GROUPS).reduce((a, k) => ({ ...a, [k]: false }), {})
  );
  const [search, setSearch] = useState("");
  const [vitalsLog, setVitalsLog] = useState([]);
  const [newVitals, setNewVitals] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

    const getAge = (birthdate) => {
    if (!birthdate) return "";
    const b = new Date(birthdate);
    const n = new Date();
    let age = n.getFullYear() - b.getFullYear();
    const m = n.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && n.getDate() < b.getDate())) age--;
    return `${age} yrs`;
  };

useEffect(() => {
  if (!patientId) return;

  (async () => {
    try {
      setLoading(true);

      const { data } = await axios.get(`${API}/${patientId}`);
      setPatient(data);
      setForm({
        ...data,
        diagnosis: data.diagnosis || "",
        customDiagnosis:
          data.diagnosis &&
          ![
            "Hypertension",
            "Diabetes",
            "Asthma",
            "Tuberculosis",
            "Tooth Extraction",
            "Follow-up Check-up",
          ].includes(data.diagnosis)
            ? data.diagnosis
            : "",
      });

      // 👇 Store illness_history into history state
      setHistory((prev) => ({
        ...prev,
        illness_history: Array.isArray(data.illness_history)
          ? data.illness_history
          : [],
      }));

      // Load medical and vitals
      const hist = await axios.get(`${API}/${patientId}/history`);
      setHistory((prev) => ({ ...prev, ...hist.data }));
      const vitals = await axios.get(`${API}/${patientId}/vitals`);
      setVitalsLog(vitals.data || []);
    } catch (err) {
      console.error("Error loading patient data:", err);
      showToast("⚠️ Failed to load patient data.");
    } finally {
      setLoading(false);
    }
  })();
}, [patientId]);


  const handleChange = (f, v) => setForm((p) => ({ ...p, [f]: v }));
  const handleHistoryChange = (f, v) => setHistory((p) => ({ ...p, [f]: v }));
const handleSaveInfo = async (e) => {
  e.preventDefault();
  try {
    setSaving(true);

    const finalDiagnosis =
      form.diagnosis === "Other" ? form.customDiagnosis : form.diagnosis;

    const updatedForm = {
      ...form,
      birthdate: form.birthdate
        ? new Date(form.birthdate).toISOString().split("T")[0]
        : null,
      diagnosis: finalDiagnosis,
    };

    // ✅ Backend automatically updates illness_history
    const response = await axios.put(`${API}/${patientId}`, updatedForm);

    if (response.status === 200) {
      showToast("✅ Info updated successfully!");
      setPatient(response.data);
      setHistory((prev) => ({
        ...prev,
        illness_history: response.data.illness_history || [],
      }));
    }
  } catch (err) {
    console.error(err);
    showToast("⚠️ Failed to save changes.");
  } finally {
    setSaving(false);
  }
};




  const handleSaveHistory = async () => {
    try {
      await axios.put(`${API}/${patientId}/history`, history);
      showToast("✅ History saved successfully!");
    } catch {
      showToast("⚠️ Failed to save history.");
    }
  };

  const handleSaveVitals = async () => {
    try {
      await axios.post(`${API}/${patientId}/vitals`, newVitals);
      const { data } = await axios.get(`${API}/${patientId}/vitals`);
      setVitalsLog(data || []);
      setNewVitals({});
      showToast("✅ Vitals recorded!");
    } catch {
      showToast("⚠️ Failed to save vitals.");
    }
  };

  const renderField = (f) => {
    const isBoolean = !["weight", "height", "waist", "hip", "fbs", "rbs", "cholesterol", "risk_profile"].includes(f);
    const val = history[f] ?? false;
    if (isBoolean) {
      return (
        <label className="switch-field">
          <input
            type="checkbox"
            checked={!!val}
            onChange={(e) => handleHistoryChange(f, e.target.checked)}
          />
          <span className="slider" />
        </label>
      );
    }
    return (
      <input
        type="number"
        value={val || ""}
        onChange={(e) => handleHistoryChange(f, e.target.value)}
      />
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal large">
        <header className="modal-header">
          <h2>🧍 {patient?.first_name} {patient?.last_name}</h2>
          <button className="btn gray" onClick={() => onClose(false)}>✖ Close</button>
        </header>

        <nav className="tabs">
          {["info", "history", "vitals"].map((t) => (
            <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              {t === "info" && "🧾 Info"}
              {t === "history" && "🩺 History"}
              {t === "vitals" && "❤️ Vitals"}
            </button>
          ))}
        </nav>

        <div className="modal-body scrollable">
          {loading ? (
            <p>Loading patient data...</p>
          ) : tab === "info" ? (

            
 <form onSubmit={handleSaveInfo}>
              <div className="form-grid">
                {/* Basic Info */}
{/* Family Information */}
<div className="field">
  <label>Family No</label>
  <input
    value={form.family_no || ""}
    onChange={(e) => handleChange("family_no", e.target.value)}
  />
</div>

<div className="field">
  <label>Patient ID</label>
  <input
    value={form.id || ""}
    onChange={(e) => handleChange("id", e.target.value)}
    readOnly // optional: make read-only to prevent accidental primary key edits
  />
</div>

                <div className="field"><label>First Name *</label>
                  <input value={form.first_name || ""} onChange={(e) => handleChange("first_name", e.target.value)} /></div>
                <div className="field"><label>Middle Name</label>
                  <input value={form.middle_name || ""} onChange={(e) => handleChange("middle_name", e.target.value)} /></div>
                <div className="field"><label>Last Name *</label>
                  <input value={form.last_name || ""} onChange={(e) => handleChange("last_name", e.target.value)} /></div>
                <div className="field"><label>Suffix</label>
                  <input value={form.suffix || ""} onChange={(e) => handleChange("suffix", e.target.value)} /></div>

                {/* Birthdate + Age */}
                <div className="field">
                  <label>Birthdate *</label>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input type="date" value={form.birthdate?.split("T")[0] || ""} onChange={(e) => handleChange("birthdate", e.target.value)} />
                    <span style={{ fontWeight: 600 }}>{getAge(form.birthdate)}</span>
                  </div>
                </div>

                <div className="field"><label>Sex *</label>
                  <select value={form.sex || ""} onChange={(e) => handleChange("sex", e.target.value)}>
                    <option value="">Select</option><option>Male</option><option>Female</option></select></div>
                <div className="field"><label>Phone *</label>
                  <input value={form.phone || ""} onChange={(e) => handleChange("phone", e.target.value)} /></div>
                <div className="field"><label>Email</label>
                  <input readOnly value={form.email || ""} /></div>

                <div className="field"><label>Religion *</label>
                  <input value={form.religion || ""} onChange={(e) => handleChange("religion", e.target.value)} /></div>
                <div className="field"><label>Civil Status *</label>
                  <select value={form.civil_status || ""} onChange={(e) => handleChange("civil_status", e.target.value)}>
                    <option>Single</option><option>Married</option><option>Widowed</option></select></div>
                <div className="field"><label>Work *</label>
                  <input value={form.work || ""} onChange={(e) => handleChange("work", e.target.value)} /></div>

                {/* Address */}
                <div className="field"><label>Bldg/House No *</label>
                  <input value={form.building_no || ""} onChange={(e) => handleChange("building_no", e.target.value)} /></div>
                <div className="field"><label>Street *</label>
                  <input value={form.street || ""} onChange={(e) => handleChange("street", e.target.value)} /></div>

                <div className="field"><label>City *</label>
                  <select value={form.city || ""} onChange={(e) => handleChange("city", e.target.value)}>
                    <option value="">Select City</option>
                    {CITY_OPTIONS.map((c) => <option key={c}>{c}</option>)}
                  </select></div>
                <div className="field"><label>Barangay *</label>
                  <select value={form.barangay || ""} onChange={(e) => handleChange("barangay", e.target.value)}>
                    <option value="">Select Barangay</option>
                    {(BARANGAY_MAP[form.city] || []).map((b) => <option key={b}>{b}</option>)}
                  </select></div>

                  {/* ---------- Diagnosis Field in Patient Info ---------- */}
<div className="field">
  <label className="label">Diagnosis / Illness</label>
  <select
    className="input"
    value={form.diagnosis || ""}
    onChange={(e) =>
      setForm((prev) => ({ ...prev, diagnosis: e.target.value }))
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

  {/* If "Other" is selected, show a text input */}
  {form.diagnosis === "Other" && (
    <input
      type="text"
      className="input"
      style={{ marginTop: 8 }}
      placeholder="Enter custom diagnosis"
      value={form.customDiagnosis || ""}
      onChange={(e) =>
        setForm((prev) => ({ ...prev, customDiagnosis: e.target.value }))
      }
    />
  )}
</div>







{(form.patient_type === "minor" && form.guardian_id) && (
  <div className="guardian-info">
    <div className="guardian-title">🧒 Guardian Information</div>
    <div className="field">
      <label>Guardian Name</label>
      <input
        value={form.guardian_name || ""}
        onChange={(e) => handleChange("guardian_name", e.target.value)}
        readOnly
      />
    </div>
    <div className="field">
      <label>Guardian Contact</label>
      <input
        value={form.guardian_contact || ""}
        onChange={(e) => handleChange("guardian_contact", e.target.value)}
        readOnly
      />
    </div>
    <div className="field">
      <label>Guardian Relationship</label>
      <input
        value={form.guardian_relationship || ""}
        onChange={(e) => handleChange("guardian_relationship", e.target.value)}
        readOnly
      />
    </div>
  </div>
)}

              </div>
              <button className="btn blue" disabled={saving}>{saving ? "Saving..." : "💾 Save Info"}</button>
            </form>

          ) : tab === "history" ? (
            <div className="card">
            
              <div className="search-box">
                <input
                  type="text"
                  placeholder="🔍 Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  
                />
              </div>
              {Object.entries(FIELD_GROUPS).map(([title, fields]) => {
                const visible = fields.filter((f) =>
                  FIELD_LABELS[f].toLowerCase().includes(search.toLowerCase())
                );
                if (!visible.length) return null;
                return (
                  <div key={title} className="accordion">
                    <button
                      className="accordion-header"
                      onClick={() => setExpanded((p) => ({ ...p, [title]: !p[title] }))}
                    >
                      {title} <span>{expanded[title] ? "▲" : "▼"}</span>
                    </button>
                    {expanded[title] && (
                      <div className="accordion-body">
                        <div className="form-grid">
                          {visible.map((f) => (
                            <div key={f} className="field">
                              <label>{FIELD_LABELS[f]}</label>
                              {renderField(f)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                );
              })}
               {/* 🩺 Illness History (moved inside History Tab) */}
{history.illness_history && history.illness_history.length > 0 && (
  <div className="accordion" style={{ marginBottom: "12px" }}>
    <button
      className="accordion-header"
      onClick={() =>
        setExpanded((prev) => ({ ...prev, illness: !prev.illness }))
      }
    >
      🩺 Illness History <span>{expanded.illness ? "▲" : "▼"}</span>
    </button>

    {expanded.illness && (
      <div className="accordion-body">
        <ul className="illness-list">
          {history.illness_history
            .slice()
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map((entry, index) => (
              <li key={index}>
                <strong>{entry.diagnosis}</strong> —{" "}
                {new Date(entry.date).toLocaleDateString("en-PH", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </li>
            ))}
        </ul>
      </div>
    )}
  </div>
)}
              <button className="btn green" onClick={handleSaveHistory}>💾 Save All</button>
            </div>
          ) : (
            <div className="card">
              <div className="form-grid">
                {[
                  ["temp", "Temperature (°C)"],
                  ["hr", "Heart Rate (bpm)"],
                  ["rr", "Respiratory Rate"],
                  ["spo2", "SpO₂ (%)"],
                  ["systolic", "Systolic (mmHg)"],
                  ["diastolic", "Diastolic (mmHg)"],
                ].map(([f, label]) => (
                  <div key={f} className="field">
                    <label>{label}</label>
                    <input
                      type="number"
                      step="any"
                      value={newVitals[f] || ""}
                      onChange={(e) => setNewVitals((p) => ({ ...p, [f]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <button className="btn green" onClick={handleSaveVitals}>💾 Save Vitals</button>
              {vitalsLog.length > 0 && <VitalsChart vitals={vitalsLog} />}
            </div>
          )}
        </div>
      </div>

      <Toast message={toast} />

      <style>{`
        :root {
          --primary:#1e40af; --success:#16a34a; --border:#e5e7eb; --muted:#6b7280;
          --bg:#f9fafb; --card:#ffffff;
        }
        body, .modal * { font-family: 'Inter', system-ui, sans-serif; }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; justify-content:center; align-items:center; padding:12px; z-index:1000; }
        .modal { background:var(--card); border-radius:14px; width:95%; max-width:1100px; display:flex; flex-direction:column; max-height:92vh; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,.2); }
        .modal-header { padding:18px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--bg); }
        .tabs { display:flex; background:var(--bg); border-bottom:1px solid var(--border); }
        .tab { flex:1; padding:12px; border:none; background:none; cursor:pointer; font-weight:600; color:var(--muted); }
        .tab.active { background:var(--primary); color:#fff; }
        .modal-body { padding:22px; flex:1; overflow-y:auto; background:var(--bg); }
        .card { background:#fff; border-radius:12px; border:1px solid var(--border); box-shadow:0 2px 6px rgba(0,0,0,.05); padding:20px; margin-bottom:20px; }
        .form-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:18px; }
        .field label { font-size:13px; color:var(--muted); margin-bottom:4px; display:block; }
        .field input, .field select { width:100%; padding:10px 12px; border-radius:8px; border:1px solid var(--border); font-size:14px; }
        .btn { border:none; border-radius:10px; padding:10px 18px; font-weight:600; cursor:pointer; margin-top:14px; }
        .btn.blue { background:var(--primary); color:#fff; }
        .btn.green { background:var(--success); color:#fff; }
        .btn.gray { background:var(--border); color:#111; }
        .toast { position:fixed; top:20px; right:20px; background:linear-gradient(90deg,#1e40af,#3b82f6); color:#fff; padding:12px 18px; border-radius:10px; font-weight:600; animation:fadein .3s ease; }
        .search-box input { width:100%; padding:10px 14px; border-radius:8px; border:1px solid var(--border); margin-bottom:14px; }
        .accordion { margin-bottom:12px; border:1px solid var(--border); border-radius:10px; overflow:hidden; }
        .accordion-header { width:100%; background:var(--bg); border:none; padding:12px 16px; font-weight:600; text-align:left; cursor:pointer; display:flex; justify-content:space-between; align-items:center; }
        .accordion-body { padding:16px 20px; background:#fff; }
        .switch-field { position:relative; display:inline-block; width:46px; height:24px; }
        .switch-field input { opacity:0; width:0; height:0; }
        .slider { position:absolute; cursor:pointer; inset:0; background:#ccc; border-radius:24px; transition:.3s; }
        .slider:before { content:""; position:absolute; left:3px; bottom:3px; width:18px; height:18px; background:#fff; border-radius:50%; transition:.3s; }
        input:checked + .slider { background:#22c55e; }
        input:checked + .slider:before { transform:translateX(22px); }
        @keyframes fadein { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
        @media (max-width: 768px) {
          .form-grid { grid-template-columns:1fr; }
        }
          .illness-toggle {
  width: 100%;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: background 0.2s;
}

.illness-toggle:hover {
  background: #e0e7ff;
}

.illness-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  margin-top: 6px;
  padding: 12px 16px;
}

.illness-list {
  list-style: disc;
  margin-left: 20px;
  line-height: 1.6;
}

      `}</style>
    </div>
  );
}
