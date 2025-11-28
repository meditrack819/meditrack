import React, { useState, useEffect } from "react";
import axios from "axios";

/* =========================================================
   ⚙️ API CONFIG
   ========================================================= */
const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const api = axios.create({ baseURL: API_BASE, timeout: 15000 });

const allowedDays = {
  "medical-general": [1, 2, 3, 4, 5],
  "medical-buntis": [4],
  "dental-bunot": [1, 5],
  "dental-pasta": [2, 3],
  "dental-buntis": [4],
  pt: [1, 3, 5],
  tb: [1, 2, 3, 4, 5],
  "vax-children": [3],
  "vax-adult": [1, 2, 3, 4, 5],
};

export default function DoctorManagement() {
  const [doctors, setDoctors] = useState([]);
  const [form, setForm] = useState({
    name: "",
    specialization: "",
    service_type: "",
    contact: "",
    allowed_days: [],
    is_active: true,
  });
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const days = [
    { num: 1, label: "Mon" },
    { num: 2, label: "Tue" },
    { num: 3, label: "Wed" },
    { num: 4, label: "Thu" },
    { num: 5, label: "Fri" },

  ];

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const loadDoctors = async () => {
    try {
      const res = await api.get("/api/doctors");
      setDoctors(res.data);
    } catch {
      showToast("⚠️ Failed to load doctors.");
    }
  };

  useEffect(() => {
    loadDoctors();
  }, []);

  const handleSave = async () => {
    if (!form.name || !form.service_type)
      return showToast("⚠️ Please fill all required fields.");

    try {
      if (editing) {
        await api.put(`/api/doctors/${editing}`, form);
        showToast("✅ Doctor updated.");
      } else {
        await api.post("/api/doctors", form);
        showToast("✅ Doctor added.");
      }
      setForm({
        name: "",
        specialization: "",
        service_type: "",
        contact: "",
        allowed_days: [],
        is_active: true,
      });
      setEditing(null);
      loadDoctors();
    } catch {
      showToast("❌ Save failed.");
    }
  };

  const handleEdit = (d) => {
    setEditing(d.id);
    setForm({ ...d });
  };

  const confirmDelete = (id) => {
    setDeleteId(id);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/doctors/${deleteId}`);
      showToast("🗑️ Doctor deleted.");
      setShowDeleteModal(false);
      setDeleteId(null);
      loadDoctors();
    } catch {
      showToast("❌ Delete failed.");
    }
  };

  return (
    <div className="doctor-page">
      <InjectStyles />

      {/* ➕ Add Doctor */}
      <div className="card">
        <div className="card-header">
          <h2>➕ Add New Doctor</h2>
        </div>

        <div className="form-grid">
          <input
            className="input"
            placeholder="Doctor Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input"
            placeholder="Specialization"
            value={form.specialization}
            onChange={(e) => setForm({ ...form, specialization: e.target.value })}
          />
          <select
            className="input"
            value={form.service_type}
            onChange={(e) => setForm({ ...form, service_type: e.target.value })}
          >
            <option value="">Select Service</option>
            {Object.keys(allowedDays).map((key) => (
              <option key={key} value={key}>
                {key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Contact Info"
            value={form.contact}
            onChange={(e) => setForm({ ...form, contact: e.target.value })}
          />
        </div>

        <div className="days-section">
          <label>Available Days:</label>
          <div className="days-grid">
            {days.map((d) => (
              <label key={d.num} className="day-item">
                <input
                  type="checkbox"
                  checked={form.allowed_days.includes(d.num)}
                  onChange={(e) => {
                    const updated = e.target.checked
                      ? [...form.allowed_days, d.num]
                      : form.allowed_days.filter((n) => n !== d.num);
                    setForm({ ...form, allowed_days: updated });
                  }}
                />
                <span className="custom-checkbox" />
                {d.label}
              </label>
            ))}
          </div>
        </div>

        <div className="form-actions">
          <label className="status-check">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span className="custom-checkbox" />
            Active
          </label>

          <button className="btn primary" onClick={handleSave}>
            {editing ? "💾 Save Changes" : "➕ Add Doctor"}
          </button>
        </div>
      </div>

      {/* Doctor Table */}
      <div className="card">
        <table className="doctor-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Service</th>
              <th>Allowed Days</th>
              <th>Specialization</th>
              <th>Contact</th>
              <th>Status</th>
              <th style={{ textAlign: "center" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {doctors.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{d.service_type}</td>
                <td>
                  {d.allowed_days
                    ?.map((n) => days.find((x) => x.num === n)?.label)
                    .join(", ")}
                </td>
                <td>{d.specialization}</td>
                <td>{d.contact}</td>
                <td>
                  <span className={`status ${d.is_active ? "active" : "inactive"}`}>
                    {d.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="actions">
                  <button
                    className="icon-btn edit"
                    title="Edit"
                    onClick={() => handleEdit(d)}
                  >
                    <i className="fa fa-pen"></i>
                  </button>
                  <button
                    className="icon-btn delete"
                    title="Delete"
                    onClick={() => confirmDelete(d.id)}
                  >
                    <i className="fa fa-trash"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Doctor Modal */}
      {editing && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>✏️ Edit Doctor</h3>
              <button className="btn close" onClick={() => setEditing(null)}>
                Close
              </button>
            </div>

            <div className="form-grid">
              <input
                className="input"
                placeholder="Doctor Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="input"
                placeholder="Specialization"
                value={form.specialization}
                onChange={(e) =>
                  setForm({ ...form, specialization: e.target.value })
                }
              />
              <select
                className="input"
                value={form.service_type}
                onChange={(e) =>
                  setForm({ ...form, service_type: e.target.value })
                }
              >
                <option value="">Select Service</option>
                {Object.keys(allowedDays).map((key) => (
                  <option key={key} value={key}>
                    {key
                      .replace(/-/g, " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder="Contact Info"
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
              />
            </div>

            <div className="days-section">
              <label>Available Days:</label>
              <div className="days-grid">
                {days.map((d) => (
                  <label key={d.num} className="day-item">
                    <input
                      type="checkbox"
                      checked={form.allowed_days.includes(d.num)}
                      onChange={(e) => {
                        const updated = e.target.checked
                          ? [...form.allowed_days, d.num]
                          : form.allowed_days.filter((n) => n !== d.num);
                        setForm({ ...form, allowed_days: updated });
                      }}
                    />
                    <span className="custom-checkbox" />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-actions">
              <label className="status-check">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm({ ...form, is_active: e.target.checked })
                  }
                />
                <span className="custom-checkbox" />
                Active
              </label>
              <button className="btn primary" onClick={handleSave}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Confirm Delete</h3>
            <p>Are you sure you want to delete this doctor?</p>
            <div className="modal-actions">
              <button className="btn danger" onClick={handleDelete}>
                Delete
              </button>
              <button
                className="btn neutral"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* =========================================================
   💅 MODERN PROFESSIONAL STYLES (MediTrack Standard)
   ========================================================= */
const InjectStyles = () => (
  <style>{`
    /* ====== Layout ====== */
    .doctor-page {
      padding: 24px;
      max-width: 1200px;
      margin: auto;
      background: #f8fafc;
      font-family: 'Inter', system-ui, sans-serif;
      color: #1e293b;
    }

    .card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.05);
      padding: 20px 24px;
      margin-bottom: 20px;
      transition: box-shadow 0.2s ease;
    }

    .card:hover {
      box-shadow: 0 6px 18px rgba(0,0,0,0.08);
    }

    .card-header h2 {
      color: #2563eb;
      font-weight: 600;
      font-size: 1.1rem;
      margin-bottom: 10px;
    }

    /* ====== Form Inputs ====== */
    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      margin-bottom: 12px;
    }

    .input, select {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 14px;
      background: #fff;
      transition: all 0.2s ease;
    }

    .input:focus, select:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
      outline: none;
    }

    /* ====== Available Days ====== */
    .days-section {
      margin-top: 14px;
      font-weight: 500;
    }

    .days-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 18px;
      margin-top: 8px;
      align-items: center;
    }

    .day-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      color: #1e293b;
      white-space: nowrap;
    }

    .day-item input[type="checkbox"] {
      appearance: none;
      width: 18px;
      height: 18px;
      border: 2px solid #cbd5e1;
      border-radius: 6px;
      background-color: #fff;
      cursor: pointer;
      position: relative;
      transition: all 0.2s ease-in-out;
    }

    .day-item input[type="checkbox"]:hover {
      border-color: #2563eb;
    }

    .day-item input[type="checkbox"]:checked {
      background-color: #2563eb;
      border-color: #2563eb;
    }

    .day-item input[type="checkbox"]:checked::after {
      content: "";
      position: absolute;
      left: 4px;
      top: 1px;
      width: 5px;
      height: 10px;
      border: solid #fff;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }

    /* ====== Active Toggle ====== */
    .status-check {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      color: #1e293b;
      margin-top: 8px;
    }

    .status-check input[type="checkbox"] {
      appearance: none;
      width: 40px;
      height: 22px;
      border-radius: 20px;
      background: #cbd5e1;
      position: relative;
      cursor: pointer;
      transition: background 0.3s ease;
    }

    .status-check input[type="checkbox"]::before {
      content: "";
      position: absolute;
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
      background: #fff;
      border-radius: 50%;
      transition: transform 0.3s ease;
      box-shadow: 0 2px 4px rgba(0,0,0,0.15);
    }

    .status-check input[type="checkbox"]:checked {
      background: #2563eb;
    }

    .status-check input[type="checkbox"]:checked::before {
      transform: translateX(18px);
    }

    /* ====== Buttons ====== */
    .btn {
      border: none;
      border-radius: 8px;
      padding: 9px 16px;
      font-weight: 600;
      cursor: pointer;
      transition: 0.25s;
    }

    .btn.primary {
      background: #2563eb;
      color: #fff;
    }

    .btn.primary:hover {
      background: #1d4ed8;
    }

    .btn.neutral {
      background: #e5e7eb;
      color: #1e293b;
    }

    .btn.neutral:hover {
      background: #d1d5db;
    }

    .btn.danger {
      background: #dc2626;
      color: #fff;
    }

    .btn.danger:hover {
      background: #b91c1c;
    }

    /* ====== Table ====== */
    .doctor-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }

    th, td {
      padding: 10px 8px;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
    }

    th {
      color: #2563eb;
      font-weight: 600;
    }

    tbody tr:hover {
      background: #f1f5f9;
    }

    .status {
      padding: 4px 10px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 13px;
    }

    .status.active { background: #dcfce7; color: #15803d; }
    .status.inactive { background: #fee2e2; color: #b91c1c; }

    /* ====== Icon Buttons ====== */
    .icon-btn {
      border: none;
      border-radius: 8px;
      padding: 6px 10px;
      cursor: pointer;
      transition: 0.25s;
    }

    .icon-btn.edit {
      background: #f1f5f9;
      color: #1e40af;
    }

    .icon-btn.delete {
      background: #fef2f2;
      color: #b91c1c;
    }

    .icon-btn.edit:hover {
      background: #e0f2fe;
      color: #2563eb;
    }

    .icon-btn.delete:hover {
      background: #fee2e2;
      color: #dc2626;
    }

    .icon-btn i {
      font-size: 14px;
    }

    /* ====== Floating Modal ====== */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.25s ease;
    }

    .modal {
      background: #fff;
      border-radius: 14px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.15);
      padding: 24px;
      width: 600px;
      max-width: 90%;
      animation: slideUp 0.25s ease;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .modal-header h3 {
      font-size: 1.1rem;
      color: #2563eb;
      font-weight: 600;
    }

    .btn.close {
      background: #e5e7eb;
      color: #1e293b;
      border: none;
      border-radius: 8px;
      padding: 6px 12px;
      font-weight: 500;
      cursor: pointer;
      transition: 0.25s;
    }

    .btn.close:hover {
      background: #d1d5db;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { transform: translateY(15px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    /* ====== Toast ====== */
    .toast {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #2563eb;
      color: #fff;
      padding: 10px 16px;
      border-radius: 8px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: fadeIn 0.3s ease;
    }
  `}</style>
);
