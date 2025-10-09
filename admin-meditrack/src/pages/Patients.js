// src/pages/Patients.js
import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import PatientDetails from "./PatientDetails";

/* ---------- API ---------- */
const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const API = `${API_BASE}/api/patients`;

/* ---------- Styles (ServiceCalendar Aesthetic + Button Fix) ---------- */
const InjectStyles = () => (
  <style>{`
    :root {
      --primary:#1e40af; --danger:#dc2626; --success:#16a34a;
      --border:#e5e7eb; --bg:#f9fafb; --card:#fff;
      --muted:#6b7280; --radius:14px;
    }

    body { background:var(--bg); font-family:"Inter",sans-serif; color:#111827; }

    .patients-wrap { max-width:1200px; margin:0 auto; padding:16px; }

    .card {
      background:var(--card);
      border:1px solid var(--border);
      border-radius:var(--radius);
      padding:20px;
      margin-bottom:20px;
      box-shadow:0 2px 8px rgba(0,0,0,0.05);
    }

    h2, h3 { color:var(--primary); font-weight:600; margin-bottom:10px; }

    .form-row {
      display:grid;
      grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
      gap:14px;
    }

    .field { display:flex; flex-direction:column; }
    .label { font-size:13px; color:var(--muted); margin-bottom:4px; font-weight:500; }
    .label.req::after { content:" *"; color:var(--danger); }

    .input, select, textarea {
      border:1px solid var(--border);
      border-radius:8px;
      padding:10px;
      font-size:14px;
      background:#fff;
      transition:border-color .2s, box-shadow .2s;
    }
    .input:focus, select:focus, textarea:focus {
      border-color:var(--primary);
      outline:none;
      box-shadow:0 0 0 2px rgba(30,64,175,0.1);
    }
    .input.error { border-color:var(--danger); }
    .error-text { color:var(--danger); font-size:12px; }

    /* ---------- Buttons (fixed) ---------- */
    .btn {
      display:flex; align-items:center; justify-content:center; gap:8px;
      border:none; border-radius:10px;
      padding:0 14px;
      height:40px;            /* slimmer default height */
      font-weight:700; font-size:14px; line-height:1;
      cursor:pointer; transition:opacity .2s, transform .1s, box-shadow .2s;
      box-shadow:0 1px 2px rgba(0,0,0,0.05);
      color:#fff;
    }
    .btn.primary { background:var(--primary); }
    .btn.success { background:var(--success); }
    .btn.danger { background:var(--danger); }
    .btn:hover { opacity:.95; transform:translateY(-1px); box-shadow:0 2px 6px rgba(0,0,0,0.08); }

    .toolbar {
      display:flex; justify-content:space-between; align-items:center;
      margin-bottom:12px; flex-wrap:wrap; gap:10px;
    }

    .toolbar input[type="search"] {
      width:260px; max-width:100%;
      border:1px solid var(--border);
      border-radius:999px;
      padding:10px 14px;
      font-size:14px;
      transition:border-color .2s;
    }
    .toolbar input[type="search"]:focus { border-color:var(--primary); outline:none; }

    table { width:100%; border-collapse:collapse; background:#fff; font-size:14px; }
    th, td { padding:12px; border-bottom:1px solid var(--border); text-align:left; }
    th { background:var(--primary); color:#fff; font-weight:600; }
    tr:hover td { background:#f3f4f6; }

    td[data-label="Name"] {
      font-weight:800;
      color:var(--primary);
      font-size:15px;
    }

    .table-wrap { width:100%; overflow-x:auto; }
    .cell-actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }

    /* ---------- Modal ---------- */
    .modal-backdrop {
      position:fixed; inset:0; background:rgba(0,0,0,0.45);
      display:flex; align-items:center; justify-content:center;
      z-index:2000; padding:10px;
    }
    .modal-card {
      background:#fff; border-radius:14px;
      padding:20px; width:min(500px, 95%);
      max-height:85vh; overflow:auto;
      box-shadow:0 4px 20px rgba(0,0,0,0.1);
    }

    /* ---------- Mobile Cards ---------- */
    @media (max-width:768px) {
      table, thead, tbody, th, td, tr { display:block; width:100%; }
      thead { display:none; }

      tbody tr {
        margin-bottom:18px;
        background:var(--card);
        border:1px solid var(--border);
        border-radius:14px;
        padding:16px 18px;
        box-shadow:0 3px 10px rgba(0,0,0,0.06);
      }

      td { border:none; padding:6px 0; }
      td::before {
        content: attr(data-label);
        display:block;
        font-weight:600;
        color:var(--muted);
        font-size:13px;
        margin-bottom:3px;
      }

      td[data-label="Name"] {
        font-weight:800;
        font-size:15px;
        color:var(--primary);
        margin-bottom:4px;
      }

      .cell-actions { flex-direction:column; gap:10px; margin-top:10px; }

      .btn { width:100%; height:44px; } /* comfy but not oversized */
    }
  `}</style>
);

/* ---------- Helpers ---------- */
const fmtDate = (v) => (!v ? "—" : new Date(v).toLocaleDateString());
const blank = (v) => (!v || v === "") ? "—" : v;

/* ---------- Credentials Modal ---------- */
function CredsModal({ data, onClose }) {
  if (!data) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h3 style={{ color: "var(--primary)" }}>🔐 New Patient Account</h3>
        {data.id && <p><strong>ID:</strong> {data.id}</p>}
        {data.phone && <p><strong>Phone:</strong> {data.phone}</p>}
        <p><strong>Password:</strong> <code>{data.password}</code></p>
        <div className="cell-actions" style={{ marginTop: 10 }}>
          <button
            className="btn primary"
            onClick={() =>
              navigator.clipboard.writeText(`${data.email || data.phone} / ${data.password}`)
            }
          >
            📋 Copy
          </button>
          <button className="btn" style={{ background: "#f3f4f6", color:"#111" }} onClick={onClose}>
            Close
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
          Share these credentials with the patient for app login.
        </p>
      </div>
    </div>
  );
}

/* ---------- Main Component ---------- */
export default function Patients() {
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState({
    first_name: "", middle_name: "", last_name: "",
    email: "", phone: "", birthdate: "", sex: "",
    religion: "", civil_status: "", work: "",
    building_no: "", street: "", barangay: "", city: ""
  });
  const [formErrors, setFormErrors] = useState({});
  const [modalData, setModalData] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [editingOpen, setEditingOpen] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState(null);

  const navigate = useNavigate();

  async function load(filter) {
    try {
      setLoading(true);
      const res = await axios.get(API, { params: filter ? { name: filter } : undefined });
      setPatients(Array.isArray(res.data) ? res.data : []);
      setError("");
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const bind = (key) => ({
    value: form[key],
    onChange: (e) => {
      const val = e.target.value;
      setForm((f) => ({ ...f, [key]: val }));
      if (formErrors[key]) {
        setFormErrors((errs) => {
          const n = { ...errs }; delete n[key]; return n;
        });
      }
    },
  });

  const validate = (v) => {
    const errs = {};
    const req = (k, msg) => { if (!v[k] || String(v[k]).trim() === "") errs[k] = msg; };
    req("first_name", "Required");
    req("last_name", "Required");
    req("phone", "Required");
    req("birthdate", "Required");
    req("sex", "Required");
    req("religion", "Required");
    req("civil_status", "Required");
    req("work", "Required");
    req("building_no", "Required");
    req("street", "Required");
    req("barangay", "Required");
    req("city", "Required");
    if (v.phone && !/^09\d{9}$/.test(v.phone)) errs.phone = "Must start with 09 and be 11 digits";
    return errs;
  };

  async function add(e) {
    e.preventDefault();
    const errs = validate(form);
    setFormErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      const { data } = await axios.post(API, form);
      await load();
      setModalData(data);
      setForm({
        first_name: "", middle_name: "", last_name: "",
        email: "", phone: "", birthdate: "", sex: "",
        religion: "", civil_status: "", work: "",
        building_no: "", street: "", barangay: "", city: ""
      });
    } catch (err) {
      alert(`Failed: ${err.response?.data?.error || err.message}`);
    }
  }

  async function del(id) {
    if (!window.confirm("Delete this patient?")) return;
    try {
      await axios.delete(`${API}/${id}`);
      setPatients((p) => p.filter((x) => x.id !== id));
    } catch (err) {
      alert(`Failed: ${err.response?.data?.error || err.message}`);
    }
  }

  return (
    <div className="patients-wrap">
      <InjectStyles />

      {/* Add Patient */}
      <div className="card">
        <h2>Add Patient</h2>
        <form onSubmit={add}>
          <div className="form-row">
            <div className="field">
              <label className="label req">First Name</label>
              <input className={`input ${formErrors.first_name ? "error" : ""}`} {...bind("first_name")} />
              {formErrors.first_name && <div className="error-text">{formErrors.first_name}</div>}
            </div>
            <div className="field">
              <label className="label">Middle Name</label>
              <input className="input" {...bind("middle_name")} />
            </div>
            <div className="field">
              <label className="label req">Last Name</label>
              <input className={`input ${formErrors.last_name ? "error" : ""}`} {...bind("last_name")} />
              {formErrors.last_name && <div className="error-text">{formErrors.last_name}</div>}
            </div>

            <div className="field">
              <label className="label req">Phone</label>
              <input className={`input ${formErrors.phone ? "error" : ""}`} {...bind("phone")} />
              {formErrors.phone && <div className="error-text">{formErrors.phone}</div>}
            </div>
            <div className="field">
              <label className="label">Email</label>
              <input className="input" type="email" {...bind("email")} />
            </div>
            <div className="field">
              <label className="label req">Birthdate</label>
              <input className={`input ${formErrors.birthdate ? "error" : ""}`} type="date" {...bind("birthdate")} />
            </div>
            <div className="field">
              <label className="label req">Sex</label>
              <select className={`input ${formErrors.sex ? "error" : ""}`} {...bind("sex")}>
                <option value="">Select</option>
                <option>Male</option><option>Female</option><option>Other</option>
              </select>
            </div>
            <div className="field">
              <label className="label req">Religion</label>
              <input className={`input ${formErrors.religion ? "error" : ""}`} {...bind("religion")} />
            </div>
            <div className="field">
              <label className="label req">Civil Status</label>
              <select className={`input ${formErrors.civil_status ? "error" : ""}`} {...bind("civil_status")}>
                <option value="">Select</option>
                <option>Single</option><option>Married</option><option>Widowed</option><option>Separated</option>
              </select>
            </div>
            <div className="field">
              <label className="label req">Work</label>
              <input className={`input ${formErrors.work ? "error" : ""}`} {...bind("work")} />
            </div>

            <div className="field">
              <label className="label req">Bldg/House No</label>
              <input className={`input ${formErrors.building_no ? "error" : ""}`} {...bind("building_no")} />
            </div>
            <div className="field">
              <label className="label req">Street</label>
              <input className={`input ${formErrors.street ? "error" : ""}`} {...bind("street")} />
            </div>
            <div className="field">
              <label className="label req">Barangay</label>
              <input className={`input ${formErrors.barangay ? "error" : ""}`} {...bind("barangay")} />
            </div>
            <div className="field">
              <label className="label req">City</label>
              <input className={`input ${formErrors.city ? "error" : ""}`} {...bind("city")} />
            </div>

            <div style={{ gridColumn: "1 / -1", textAlign: "right" }}>
              <button className="btn primary" type="submit">➕ Add Patient</button>
            </div>
          </div>
        </form>
      </div>

      {/* Patients Table */}
      <div className="card">
        <div className="toolbar">
          <h2>Patients</h2>
          <input
            type="search"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {error && <div style={{ color: "var(--danger)", marginBottom: 8 }}>{error}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {["ID","Name","Email","Phone","Age","Last Visit","Actions"].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign:"center", padding:16 }}>Loading…</td></tr>
              ) : patients.length ? (
                patients.map(p => (
                  <tr key={p.id}>
                    <td data-label="ID">{blank(p.id)}</td>
                    <td data-label="Name">{blank(p.name)}</td>
                    <td data-label="Email">{blank(p.email)}</td>
                    <td data-label="Phone">{blank(p.phone)}</td>
                    <td data-label="Age">{blank(p.age)}</td>
                    <td data-label="Last Visit">{blank(fmtDate(p.last_visit))}</td>
                    <td data-label="Actions">
                      <div className="cell-actions">
                        <button
                          className="btn success"
                          onClick={() => navigate("/prescriptions", { state: { patient: p } })}
                        >
                          📋 Prescriptions
                        </button>
                        <button
                          className="btn primary"
                          onClick={() => { setEditingPatientId(p.id); setEditingOpen(true); }}
                        >
                          ✏️ Info
                        </button>
                        <button className="btn danger" onClick={() => del(p.id)}>
                          ❌ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ textAlign:"center", color:"var(--muted)", padding:16 }}>
                    No patients found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <CredsModal data={modalData} onClose={() => setModalData(null)} />
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
  );
}
