import React, { useEffect, useMemo, useState, useRef } from "react";
import axios from "axios";
import { useLocation, useNavigate, useParams } from "react-router-dom";

/* =========================================================
   ⚙️ API CONFIG
   ========================================================= */
const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const RX_API = `${API_BASE}/api/prescriptions`;
const PT_API = `${API_BASE}/api/patients`;
const STOCK_API = `${API_BASE}/api/stock`;

/* =========================================================
   💊 MEDICINE SUGGESTIONS BY DIAGNOSIS
   ========================================================= */

const MEDICINE_SUGGESTIONS_BY_DIAGNOSIS = {
  Hypertension: [
    "Amlodipine", "Losartan", "Metoprolol", "Captopril", "Hydrochlorothiazide"
  ],
  Diabetes: [
    "Metformin", "Glimepiride", "Insulin", "Pioglitazone", "Sitagliptin"
  ],
  Asthma: [
    "Salbutamol", "Budesonide", "Montelukast", "Fluticasone"
  ],
  Tuberculosis: [
    "Rifampicin", "Isoniazid", "Pyrazinamide", "Ethambutol"
  ],
  "Tooth Extraction": [
    "Amoxicillin", "Mefenamic Acid", "Ibuprofen", "Paracetamol"
  ],
  "Follow-up Check-up": []
};

/* =========================================================
   🎨 STYLES
   ========================================================= */
const Styles = () => (
  <style>{`
:root {
  --primary:#1e40af; --danger:#dc2626; --success:#16a34a;
  --border:#e5e7eb; --bg:#f9fafb; --card:#fff; --muted:#6b7280; --radius:14px;
}
body { background:var(--bg); color:#111827; font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif; }
.rx-wrap { width:100%; max-width:1200px; margin:0 auto; padding:clamp(10px,3vw,24px); display:flex; flex-direction:column; gap:20px; }

h2 { font-size:clamp(20px,2vw,24px); font-weight:700; color:var(--primary); margin:0; }
h3 { color:var(--primary); margin-bottom:8px; font-size:1.1rem; font-weight:600; }

.card {
  background:var(--card);
  border:1px solid var(--border);
  border-radius:var(--radius);
  padding:clamp(16px,2vw,28px);
  box-shadow:0 2px 8px rgba(0,0,0,.05);
}

.input {
  border:1px solid var(--border);
  border-radius:8px;
  padding:10px 12px;
  font-size:14px;
  width:100%;
  box-sizing:border-box;
}
.input:focus {
  border-color:var(--primary);
  outline:none;
  box-shadow:0 0 0 2px rgba(30,64,175,.12);
}

.pill, .btn {
  border:none;
  border-radius:8px;
  padding:8px 14px;
  font-weight:600;
  cursor:pointer;
  font-size:14px;
  display:inline-flex;
  align-items:center;
  gap:4px;
  justify-content:center;
  transition:opacity .2s, transform .1s;
}
.pill:hover, .btn:hover { opacity:.95; transform:translateY(-1px); }
.pill.blue, .btn.primary { background:var(--primary); color:#fff; }
.pill.green, .btn.success { background:var(--success); color:#fff; }
.pill.red, .btn.danger { background:var(--danger); color:#fff; }
.pill.gray, .btn.gray { background:#4b5563; color:#fff; }

table {
  width:100%;
  border-collapse:collapse;
  background:#fff;
  border-radius:10px;
  overflow:hidden;
  font-size:14px;
}
th, td {
  padding:10px 14px;
  border-bottom:1px solid var(--border);
  text-align:left;
}
th {
  background:var(--primary);
  color:#fff;
  font-weight:600;
}
tr:last-child td { border-bottom:none; }

.suggestions-box {
  position:absolute; background:#fff; border:1px solid var(--border);
  border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.1);
  z-index:50; width:100%; max-height:180px; overflow-y:auto;
}
.suggestions-item { padding:8px 10px; cursor:pointer; font-size:14px; }
.suggestions-item:hover, .suggestions-item.active { background:var(--primary); color:#fff; }

.toast {
  position:fixed; top:20px; right:20px; z-index:9999;
  background:linear-gradient(90deg,#1e40af,#3b82f6);
  color:#fff; padding:12px 20px; border-radius:10px; font-weight:600;
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
  max-width:420px;
  box-shadow:0 4px 20px rgba(0,0,0,.15);
}
.modal-card h4 { margin-top:0; color:var(--primary); }
.modal-card p { font-size:14px; margin:8px 0 16px; }
`}</style>
);

export default function Prescriptions() {
  const navigate = useNavigate();
  const { patientId: patientIdParam } = useParams();
  const location = useLocation();

  const [patient, setPatient] = useState(location.state?.patient || null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [medicines, setMedicines] = useState([
    { medication_name: "", times_per_day: "", duration_days: "", total_quantity: "", start_date: "", instructions: "" },
  ]);
  const [stockList, setStockList] = useState([]);
const [diagnosisSuggestions, setDiagnosisSuggestions] = useState([]);

const [autoLoadedDiagnosis, setAutoLoadedDiagnosis] = useState(null);
useEffect(() => {
  setAutoLoadedDiagnosis(null);
}, [patient?.diagnosis]);



  const [suggestions, setSuggestions] = useState({});
  const [activeIndex, setActiveIndex] = useState({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editData, setEditData] = useState(null);
  const suggestionRefs = useRef([]);

  const dbId = useMemo(
    () => patient?.id || patientIdParam || new URLSearchParams(location.search).get("patient_id") || "",
    [patient, patientIdParam, location.search]
  );

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  /* =========================================================
     🧩 LOAD DATA
  ========================================================= */
  useEffect(() => {
    const loadData = async () => {
      if (!dbId) return;
      setLoading(true);
      try {
        const [p, r, s] = await Promise.all([
          axios.get(`${PT_API}/${dbId}`),
          axios.get(`${RX_API}/patient/${dbId}`),
          axios.get(STOCK_API),
        ]);
        setPatient(p.data);
        setPrescriptions(r.data || []);
        setStockList(s.data || []);
      } catch {
        showToast("⚠️ Failed to load data.");
      }
      setLoading(false);
    };
    loadData();
  }, [dbId]);

  // =========================================================
// Fetch diagnosis suggestions AFTER patient is loaded
// =========================================================

useEffect(() => {
  if (!patient?.diagnosis) return;

  const diag = patient.diagnosis.trim();
  const normalized = diag.charAt(0).toUpperCase() + diag.slice(1).toLowerCase();
  console.log("🩺 Fetching suggestions for:", normalized);

  axios
    .get(`${API_BASE}/api/diagnosis/${encodeURIComponent(diag)}`)
    .then((res) => {
      const result =
        res.data?.length > 0
          ? res.data
          : MEDICINE_SUGGESTIONS_BY_DIAGNOSIS[normalized] || [];
      console.log("💊 Suggestions for", normalized, "=>", result);
      setDiagnosisSuggestions(result);
    })
    .catch(() => {
      console.warn("⚠️ Using fallback for:", normalized);
      setDiagnosisSuggestions(MEDICINE_SUGGESTIONS_BY_DIAGNOSIS[normalized] || []);
    });
}, [patient?.diagnosis]);


useEffect(() => {
  if (patient?.diagnosis) {
    setMedicines([
      {
        medication_name: "",
        times_per_day: "",
        duration_days: "",
        total_quantity: "",
        start_date: "",
        instructions: "",
      },
    ]);
  }
}, [patient?.diagnosis]);




  /* =========================================================
     🧭 SUGGESTION HANDLING
  ========================================================= */
  useEffect(() => {
    const clickOutside = (e) => {
      if (suggestionRefs.current.every((ref) => ref && !ref.contains(e.target))) setSuggestions({});
    };
    document.addEventListener("mousedown", clickOutside);
    return () => document.removeEventListener("mousedown", clickOutside);
  }, []);

 const updateMedicine = (i, k, v) => {
  const copy = [...medicines];

  if (k === "medication_name") {
    v = v.charAt(0).toUpperCase() + v.slice(1);

    // 1️⃣ Filter stock-based matches
    const stockMatches = stockList
      .filter((s) =>
        s.medicine_name?.toLowerCase().includes(v.toLowerCase())
      )
      .map((s) => ({ name: s.medicine_name, quantity: s.quantity }));

    // 2️⃣ Filter diagnosis-based matches
    const diagMatches = (diagnosisSuggestions || [])
      .filter(
        (name) =>
          name.toLowerCase().includes(v.toLowerCase()) &&
          !stockMatches.some(
            (s) => s.name.toLowerCase() === name.toLowerCase()
          )
      )
      .map((name) => ({ name, quantity: null }));

    // 3️⃣ Combine both sets (diagnosis first, then stock)
const merged = [...diagMatches, ...stockMatches]
  .filter(
    (v, idx, arr) => arr.findIndex((a) => a.name.toLowerCase() === v.name.toLowerCase()) === idx
  )
  .slice(0, 8);

setSuggestions((prev) => ({ ...prev, [i]: merged }));


    console.log("💡 Suggestions for", patient?.diagnosis, "=>", merged);
    setActiveIndex((prev) => ({ ...prev, [i]: -1 }));
    copy[i].total_quantity = "";
  }

  // update field
  copy[i][k] = v;

  // auto compute total
  if (k === "times_per_day" || k === "duration_days") {
    const t = Number(copy[i].times_per_day) || 0;
    const d = Number(copy[i].duration_days) || 0;
    copy[i].total_quantity = String(t * d);
  }

  setMedicines(copy);
};





  const handleKey = (e, i) => {
    const list = suggestions[i] || [];
    if (!list.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((p) => ({ ...p, [i]: (p[i] + 1) % list.length }));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((p) => ({ ...p, [i]: (p[i] - 1 + list.length) % list.length }));
    } else if (e.key === "Enter" && activeIndex[i] >= 0) {
      e.preventDefault();
      selectSuggestion(i, list[activeIndex[i]]);
    }
  };

  const selectSuggestion = (i, selected) => {
    const copy = [...medicines];
    copy[i].medication_name = selected.name;
    copy[i].total_quantity = String(selected.quantity || "");
    setMedicines(copy);
    setSuggestions((prev) => ({ ...prev, [i]: [] }));
  };

const addMedicine = () => {
  // 🩺 If diagnosis has recommended medicines and list is empty, preload them
  if (
    diagnosisSuggestions.length &&
    medicines.length === 1 &&
    !medicines[0].medication_name
  ) {
    const defaults = diagnosisSuggestions.map((name) => ({
      medication_name: name,
      times_per_day: "",
      duration_days: "",
      total_quantity: "",
      start_date: "",
      instructions: "",
    }));
    setMedicines(defaults);
    showToast(`💡 Loaded recommended medicines for ${patient?.diagnosis}`);
  } else {
    // ➕ Add blank row
    setMedicines([
      ...medicines,
      {
        medication_name: "",
        times_per_day: "",
        duration_days: "",
        total_quantity: "",
        start_date: "",
        instructions: "",
      },
    ]);
  }
};

/* =========================================================
   💾 SAVE PRESCRIPTION (with safety validation)
========================================================= */
const savePrescription = async () => {
  if (!dbId) return showToast("⚠️ No patient selected.");

  const meds = medicines.filter((m) => m.medication_name.trim());
  if (!meds.length) return showToast("⚠️ No medicines to save.");

  // 🧠 Safety Check — only allow medicines from diagnosisSuggestions
  const allowedList = diagnosisSuggestions.map((n) => n.toLowerCase());
  const safeMeds = [];

  for (const m of meds) {
    const medName = m.medication_name.toLowerCase();

    if (!allowedList.includes(medName)) {
      showToast(
        `⚠️ "${m.medication_name}" is not recommended for "${patient?.diagnosis}". Please review.`
      );
      return; // ❌ Stop the save process
    } else {
      safeMeds.push(m);
    }
  }

  try {
    // 💊 Save prescriptions safely
    for (const m of safeMeds) {
      await axios.post(RX_API, {
        ...m,
        patient_id: dbId,
        diagnosis: patient?.diagnosis || "",
        service_type: "medical",
      });
    }

    showToast("✅ Prescriptions saved!");
    // Reset form
    setMedicines([
      {
        medication_name: "",
        times_per_day: "",
        duration_days: "",
        total_quantity: "",
        start_date: "",
        instructions: "",
      },
    ]);

    // Reload prescriptions
    const { data } = await axios.get(`${RX_API}/patient/${dbId}`);
    setPrescriptions(data);
  } catch (err) {
    console.error("Save error:", err);
    showToast("⚠️ Failed to save prescriptions.");
  }
};

/* =========================================================
   🗑️ DELETE PRESCRIPTION
========================================================= */
const confirmDelete = async () => {
  try {
    await axios.delete(`${RX_API}/${deleteConfirm}`);
    setPrescriptions((p) => p.filter((x) => x.id !== deleteConfirm));
    showToast("🗑️ Prescription deleted successfully.");
  } catch {
    showToast("⚠️ Delete failed.");
  }
  setDeleteConfirm(null);
};

/* =========================================================
   📤 UPLOAD IMAGE
========================================================= */
const uploadImage = async (id, f) => {
  if (!f) return;
  const form = new FormData();
  form.append("image", f);

  try {
    await axios.post(`${RX_API}/${id}/image`, form);
    showToast("✅ Image uploaded.");
    const { data } = await axios.get(`${RX_API}/patient/${dbId}`);
    setPrescriptions(data);
  } catch {
    showToast("⚠️ Upload failed.");
  }
};

/* =========================================================
   👁️ VIEW IMAGE
========================================================= */
const viewImage = async (id) => {
  try {
    const { data } = await axios.get(`${RX_API}/${id}/signed-url`);
    if (data?.url) window.open(data.url, "_blank");
  } catch {
    showToast("⚠️ No image available.");
  }
};

/* =========================================================
   ✏️ EDIT PRESCRIPTION
========================================================= */
const openEdit = (p) => setEditData({ ...p });
const closeEdit = () => setEditData(null);

const saveEdit = async () => {
  try {
    await axios.put(`${RX_API}/${editData.id}`, editData);
    showToast("✅ Prescription updated!");

    const { data } = await axios.get(`${RX_API}/patient/${dbId}`);
    setPrescriptions(data);
    closeEdit();
  } catch {
    showToast("⚠️ Update failed.");
  }
};

  /* =========================================================
     🧾 UI
  ========================================================= */
  const formatDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");
  const fullName = patient ? [patient.first_name, patient.middle_name, patient.last_name].filter(Boolean).join(" ") : "";

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape" && editData) closeEdit();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [editData]);

  return (
    <div className="rx-wrap">
      <Styles />
      <h2>Prescriptions</h2>

      {/* Patient Info */}
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div><strong>Patient:</strong> {fullName || "(loading…)"}</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}><strong>ID:</strong> {patient?.id || "(none)"}</div>
        </div>
        <button className="btn primary" onClick={() => navigate("/patients")}>← Back</button>
      </div>
      {/* Diagnosis Info */}
{patient && (
  <div className="card">
    <h3>Diagnosis / Illness</h3>
    <input
      className="input"
      type="text"
      placeholder="e.g., Hypertension, Diabetes, Asthma"
      value={patient.diagnosis || ""}
      onChange={(e) =>
        setPatient((p) => ({ ...p, diagnosis: e.target.value }))
      }
    />
  </div>
)}


      {/* Add Prescription */}
      <div className="card">
        <h3>Add Prescription</h3>
        {medicines.map((m, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "12px", marginBottom: "12px" }}>
            {["medication_name", "times_per_day", "duration_days", "total_quantity", "start_date", "instructions"].map((f, idx) => (
              <div key={idx} ref={(el) => (suggestionRefs.current[i] = el)} style={{ position: "relative" }}>
                <input
  className="input"
  type={f.includes("date") ? "date" : f.includes("times") || f.includes("duration") ? "number" : "text"}
  placeholder={f.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
  value={m[f]}
  onChange={(e) => updateMedicine(i, f, e.target.value)}
  onFocus={() => {
    if (f === "medication_name") {
      // 🧠 Show diagnosis-based and stock suggestions immediately
      const diagMatches = (diagnosisSuggestions || []).map((name) => ({ name, quantity: null }));
      const stockMatches = stockList.map((s) => ({ name: s.medicine_name, quantity: s.quantity }));

      const merged = [...diagMatches, ...stockMatches]
        .filter(
          (v, idx, arr) =>
            arr.findIndex((a) => a.name.toLowerCase() === v.name.toLowerCase()) === idx
        )
        .slice(0, 8);

      setSuggestions((prev) => ({ ...prev, [i]: merged }));
      setActiveIndex((prev) => ({ ...prev, [i]: -1 }));
    }
  }}
  onKeyDown={(e) => handleKey(e, i)}
  readOnly={f === "total_quantity"}
  style={f === "total_quantity" ? { background: "#f3f4f6", cursor: "not-allowed" } : {}}
/>

                {f === "medication_name" && suggestions[i]?.length > 0 && (
                  <div className="suggestions-box">
                    {suggestions[i].map((s, idx2) => (
                      <div
                        key={idx2}
                        className={`suggestions-item ${activeIndex[i] === idx2 ? "active" : ""}`}
                        onClick={() => selectSuggestion(i, s)}
                      >
                        {s.name} {s.quantity ? <span style={{ color: "#e5e7eb" }}>– {s.quantity} pcs</span> : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn primary" onClick={addMedicine}>➕ Add Medicine</button>
          <button className="btn success" onClick={savePrescription}>💾 Save</button>
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
    <th>Diagnosis</th>
    <th>Qty</th>
    <th>Start Date</th>
    <th>Instructions</th>
    <th>Image</th>
    <th>Actions</th>
  </tr>
</thead>

          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: "center" }}>Loading…</td></tr>
            ) : prescriptions.length ? (
              prescriptions.map((p) => (
                <tr key={p.id}>
                  <td>{p.id.slice(0, 6)}</td>
                  <td>{p.medication_name}</td>
                  <td>{p.diagnosis || "—"}</td> {/* 🩺 added */}
                  <td>{p.total_quantity}</td>
                  <td>{formatDate(p.start_date)}</td>
                  <td>{p.instructions || "—"}</td>
                  <td>
                    {p.image_path ? (
                      <button className="btn gray" onClick={() => viewImage(p.id)}>📷 View</button>
                    ) : (
                      <label className="btn primary" style={{ cursor: "pointer" }}>
                        📤 Upload
                        <input type="file" style={{ display: "none" }} onChange={(e) => uploadImage(p.id, e.target.files[0])} />
                      </label>
                    )}
                  </td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="btn" style={{ background: "#3b82f6", color: "#fff" }} onClick={() => openEdit(p)}>✏️ Edit</button>
                    <button className="btn danger" onClick={() => setDeleteConfirm(p.id)}>❌ Delete</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)" }}>No prescriptions</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Toast + Delete Modal */}
      {toast && <div className="toast">{toast}</div>}
      {deleteConfirm && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h4>Delete Prescription</h4>
            <p>Are you sure you want to delete this prescription?</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button className="btn" style={{ background: "#e5e7eb", color: "#111" }} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn danger" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ✏️ Edit Modal */}
      {editData && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h4>Edit Prescription</h4>

            <div style={{ display: "grid", gap: 10 }}>
              {["medication_name", "times_per_day", "duration_days", "total_quantity", "start_date", "instructions"].map((f) => (
                <div key={f} style={{ position: "relative" }}>
                  <input
                    className="input"
                    type={
                      f.includes("date")
                        ? "date"
                        : f.includes("times") || f.includes("duration")
                        ? "number"
                        : "text"
                    }
                    placeholder={f.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    value={editData[f] || ""}
                    readOnly={f === "total_quantity"}
                    style={
                      f === "total_quantity"
                        ? { background: "#f3f4f6", cursor: "not-allowed" }
                        : {}
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      let updated = { ...editData, [f]: val };

                      // Autocomplete
                      if (f === "medication_name") {
                        const filtered = stockList
                          .filter((s) =>
                            s.medicine_name
                              ?.toLowerCase()
                              .includes(val.toLowerCase())
                          )
                          .map((s) => ({
                            name: s.medicine_name,
                            quantity: s.quantity,
                          }))
                          .slice(0, 8);
                        setSuggestions({ edit: filtered });
                        setActiveIndex({ edit: -1 });
                      }

                      // Auto total
                      if (f === "times_per_day" || f === "duration_days") {
                        const t = Number(f === "times_per_day" ? val : updated.times_per_day);
                        const d = Number(f === "duration_days" ? val : updated.duration_days);
                        updated.total_quantity = String(t * d);
                      }

                      setEditData(updated);
                    }}
                    onKeyDown={(e) => {
                      const list = suggestions.edit || [];
                      if (!list.length) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setActiveIndex((p) => ({ ...p, edit: (p.edit + 1) % list.length }));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActiveIndex((p) => ({ ...p, edit: (p.edit - 1 + list.length) % list.length }));
                      } else if (e.key === "Enter" && activeIndex.edit >= 0) {
                        e.preventDefault();
                        const s = list[activeIndex.edit];
                        setEditData({
                          ...editData,
                          medication_name: s.name,
                          total_quantity: String(s.quantity || ""),
                        });
                        setSuggestions({ edit: [] });
                      }
                    }}
                  />

                  {f === "medication_name" && suggestions.edit?.length > 0 && (
                    <div className="suggestions-box">
                      {suggestions.edit.map((s, idx) => (
                        <div
                          key={idx}
                          className={`suggestions-item ${
                            activeIndex.edit === idx ? "active" : ""
                          }`}
                          onClick={() => {
                            setEditData({
                              ...editData,
                              medication_name: s.name,
                              total_quantity: String(s.quantity || ""),
                            });
                            setSuggestions({ edit: [] });
                          }}
                        >
                          {s.name}{" "}
                          {s.quantity ? (
                            <span style={{ color: "#e5e7eb" }}>– {s.quantity} pcs</span>
                          ) : (
                            ""
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button className="btn" style={{ background: "#e5e7eb", color: "#111" }} onClick={closeEdit}>Cancel</button>
              <button className="btn success" onClick={saveEdit}>💾 Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
