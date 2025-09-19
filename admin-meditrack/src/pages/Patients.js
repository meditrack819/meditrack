// src/pages/Patients.js — fully responsive patient list with API integration
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

/* ---------------- API config ---------------- */
const API_BASE = process.env.REACT_APP_BACKEND_URL || "/api";
const API = `${API_BASE}/patients`;

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

/* ---------------- Page ---------------- */
export default function Patients() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const navigate = useNavigate();

  const blank = (v) => (v == null || v === "" ? "—" : v);

  async function load(nameFilter) {
    try {
      setLoading(true);
      setError("");
      const res = await axios.get(API, {
        params: nameFilter ? { name: nameFilter } : undefined,
      });
      const rows = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.patients)
        ? res.data.patients
        : [];
      const normalized = (rows ?? []).map((r) => ({
        ...r,
        name: compiledName(r) || r.name || "—",
      }));
      setPatients(normalized);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const kpis = useMemo(
    () => ({
      total: patients.length,
      avgAge: patients.length
        ? Math.round(
            patients.reduce(
              (s, p) => s + (parseInt(p.age, 10) || 0),
              0
            ) / Math.max(1, patients.length)
          )
        : 0,
      withPhone: patients.filter((p) => !!p.phone).length,
    }),
    [patients]
  );

  return (
    <div className="patients-page">
      <div className="container-1200">
        {/* KPI strip */}
        <div className="row kpi-row" style={{ marginBottom: 12 }}>
          <div className="card">
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              Total Patients
            </div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{kpis.total}</div>
          </div>
          <div className="card">
            <div style={{ color: "var(--muted)", fontSize: 13 }}>Avg Age</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{kpis.avgAge}</div>
          </div>
          <div className="card">
            <div style={{ color: "var(--muted)", fontSize: 13 }}>With Phone</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{kpis.withPhone}</div>
          </div>
          <div className="card">
            <div style={{ color: "var(--muted)", fontSize: 13 }}>Search</div>
            <input
              className="input"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Patients Table */}
        <div className="card">
          <h3>Patients</h3>
          {error && (
            <div style={{ color: "#b91c1c", marginBottom: 8 }}>
              ⚠ {error}
            </div>
          )}
          <div className="table-wrap" role="region" aria-label="Patients table">
            <table>
              <thead>
                <tr>
                  {["ID", "Name", "Email", "Phone", "Age", "Last Visit", "Actions"].map(
                    (h) => (
                      <th key={h}>{h}</th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: 16 }}>
                      Loading…
                    </td>
                  </tr>
                ) : patients.length ? (
                  patients.map((p) => (
                    <tr key={p.id}>
                      <td data-label="ID">{blank(p.id)}</td>
                      <td data-label="Name" style={{ fontWeight: 600 }}>
                        {compiledName(p) || blank(p.name)}
                      </td>
                      <td data-label="Email">{blank(p.email)}</td>
                      <td data-label="Phone">{blank(p.phone)}</td>
                      <td data-label="Age">{blank(p.age)}</td>
                      <td data-label="Last Visit">{blank(fmtDate(p.last_visit))}</td>
                      <td data-label="Actions">
                        <div className="cell-actions">
                          <button
                            className="pill green"
                            onClick={() =>
                              navigate(`/patients/${p.id}/manage`, { state: { patient: p } })
                            }
                            disabled={!p?.id}
                          >
                            📋 Manage
                          </button>
                          <button
                            className="pill blue"
                            onClick={() => alert("Edit modal not wired yet")}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            className="pill red"
                            onClick={() => alert("Delete not wired yet")}
                          >
                            ❌ Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        textAlign: "center",
                        padding: 16,
                        color: "var(--muted)",
                      }}
                    >
                      No patients found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
