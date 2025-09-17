// src/pages/Prescriptions.jsx — Patients UI style (light cards, blue header, pill buttons)
import React, { useEffect, useMemo, useState, useRef } from "react";
import axios from "axios";
import { useLocation, useNavigate, useParams } from "react-router-dom";

/** API base (no /api prefix; server mounts at root) */
const API_BASE =
  process.env.REACT_APP_BACKEND_URL ||
  process.env.REACT_APP_API_URL ||
  "/api";
const RX_API = `${API_BASE}/prescriptions`;
const PT_API = `${API_BASE}/patients`;

/* ---------------- Styles scoped to Prescriptions (mirror Patients.jsx) ---------------- */
const Styles = () => (
  <style>{`
    .rx-page{
      --p-bg:#f5f6fb; --p-card:#fff; --p-text:#111827; --p-muted:#6b7280; --p-border:#e5e7eb;
      --p-blue:#1e40af; --p-blue-600:#1d4ed8; --p-red:#dc2626; --p-green:#16a34a; --radius:14px;
    }
    .rx-page{ color:var(--p-text); }
    .rx-page .page{ max-width:1100px; margin:0 auto; padding:16px; }
    .rx-page .card{ background:var(--p-card); border:1px solid var(--p-border); border-radius:var(--radius); padding:14px 16px; }
    .rx-page h3{ margin:0 0 10px; }
    .rx-page .row{ display:grid; grid-template-columns:repeat(12,1fr); gap:10px; }

    .rx-page .input{
      width:100%; background:#fff; border:1px solid var(--p-border); border-radius:10px;
      padding:10px 12px; min-height:40px; outline:none; color:var(--p-text);
    }
    .rx-page .input::placeholder{ color:#9ca3af }

    .rx-page .pill{
      appearance:none; border:0; border-radius:999px; padding:9px 14px; font-weight:700; cursor:pointer; white-space:nowrap;
      display:inline-flex; align-items:center; gap:8px; box-shadow:0 1px 2px rgba(0,0,0,.04);
    }
    .rx-page .pill.blue  { background:var(--p-blue);  color:#fff; }
    .rx-page .pill.green { background:var(--p-green); color:#fff; }
    .rx-page .pill.gray  { background:#4b5563; color:#fff; }
    .rx-page .pill.red   { background:var(--p-red);   color:#fff; }
    .rx-page .pill:disabled{ opacity:.6; cursor:not-allowed }

    /* Table */
    .rx-page .table-wrap{ overflow:auto; border-radius:12px; }
    .rx-page table{ width:100%; border-collapse:separate; border-spacing:0; background:#fff; }
    .rx-page thead th{
      position:sticky; top:0; background:var(--p-blue); color:#fff; text-align:left; padding:10px 12px; font-size:14px;
    }
    .rx-page tbody td{
      padding:10px 12px; border-bottom:1px solid var(--p-border); color:var(--p-text); background:#fff; vertical-align:top;
    }
    .rx-page tbody tr:nth-child(2n) td{ background:#f9fafb; }
    .rx-page .cell-actions{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .rx-page .thumb{ width:84px; height:84px; border-radius:8px; object-fit:cover; background:#f3f4f6; border:1px solid var(--p-border); }

    /* Responsive: inputs wrap nicely like Patients page */
    @media (max-width:1060px){
      .rx-page .row.kpis { grid-template-columns:repeat(6,1fr); }
      .rx-page .row.add  { grid-template-columns:repeat(6,1fr); }
    }
    @media (max-width:700px){
      .rx-page .row.kpis { grid-template-columns:1fr 1fr; }
      .rx-page .row.add  { grid-template-columns:1fr 1fr; }
    }
  `}</style>
);

/* ---------------- helpers ---------------- */
const asInt = (v, def = 0) => { const n = Number(v); return Number.isFinite(n) ? n : def; };
const pickErr = (err) =>
  err?.response?.data?.error ||
  err?.response?.data?.message ||
  err?.message ||
  "Unknown error";

/* ---------------- Page ---------------- */
export default function Prescriptions() {
  const navigate = useNavigate();
  const { patientId: patientIdParam } = useParams();
  const location = useLocation();

  // patient resolution: param → query → state
  const patientId = useMemo(() => {
    const qs = new URLSearchParams(location.search);
    return (
      patientIdParam ||
      qs.get("patient_id") ||
      location.state?.patient?.id ||
      location.state?.patient_id ||
      ""
    );
  }, [location.search, location.state, patientIdParam]);

  const [patient, setPatient] = useState(location.state?.patient || null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [form, setForm] = useState({
    medication_name: "",
    times_per_day: "",
    duration_days: "",
    total_quantity: "",
    start_date: "",
    instructions: "",
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [search, setSearch] = useState("");

  // image upload state per-row
  const [uploadingMap, setUploadingMap] = useState({});
  const filePickersRef = useRef({});

  const onChange = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const suggestedQty = asInt(form.times_per_day) * asInt(form.duration_days);

  // close alerts with Esc
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setErrorMsg("");
        setSuccessMsg("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Load patient (for header)
  const loadPatient = async () => {
    if (!patientId || patient) return;
    try {
      const res = await axios.get(`${PT_API}/${patientId}`);
      setPatient(res.data || null);
    } catch {}
  };

  // Load prescriptions
  const load = async () => {
    if (!patientId) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await axios.get(`${RX_API}/patient/${patientId}`);
      setPrescriptions(res.data || []);
    } catch (e1) {
      try {
        const res2 = await axios.get(`${RX_API}/${patientId}`);
        setPrescriptions(res2.data || []);
      } catch (e2) {
        setPrescriptions([]);
        setErrorMsg(pickErr(e2));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatient();
    load();
  }, [patientId]);

  // Filtered list for search box
  const filtered = useMemo(() => {
    if (!search.trim()) return prescriptions;
    const q = search.toLowerCase();
    return prescriptions.filter(
      (p) =>
        (p.medication_name || "").toLowerCase().includes(q) ||
        (p.instructions || "").toLowerCase().includes(q)
    );
  }, [prescriptions, search]);

  // KPIs (based on filtered)
  const kpis = useMemo(() => {
    const total = filtered.length;
    const active = filtered.filter(
      (p) => (p.duration_days ?? p.duration) > 0
    ).length;
    const withImg = filtered.filter((p) => !!p.image_path).length;
    const qtySum = filtered.reduce((s, p) => s + (Number(p.total_quantity) || 0), 0);
    return { total, active, withImg, qtySum };
  }, [filtered]);

  // Add prescription
  const add = async () => {
    setErrorMsg("");
    setSuccessMsg("");
    if (!patientId)
      return setErrorMsg(
        "Missing patient id. Open this page via the “Manage” button on Patients."
      );
    if (!form.medication_name?.trim())
      return setErrorMsg("Medication name is required.");

    const tpd = asInt(form.times_per_day, NaN);
    const dur = asInt(form.duration_days, NaN);
    const qtyRaw =
      form.total_quantity === "" ? suggestedQty : asInt(form.total_quantity, NaN);

    if (!(tpd >= 1 && tpd <= 24))
      return setErrorMsg("Times per day must be between 1 and 24.");
    if (!(dur >= 1 && dur <= 365))
      return setErrorMsg("Duration must be between 1 and 365 days.");
    if (!Number.isFinite(qtyRaw) || qtyRaw <= 0)
      return setErrorMsg("Total quantity must be a positive number.");

    const body = {
      patient_id: patientId,
      medication_name: form.medication_name.trim(),
      times_per_day: tpd,
      duration_days: dur,
      total_quantity: qtyRaw,
      start_date: form.start_date || undefined,
      instructions: (form.instructions || "").trim(),
    };

    try {
      const res = await axios.post(RX_API, body, {
        headers: { "Content-Type": "application/json" },
      });
      if (res?.data?.stock_after) {
        const s = res.data.stock_after;
        setSuccessMsg(
          `Prescription added. Stock updated: ${
            s.medicine_name ?? body.medication_name
          } → ${typeof s.quantity === "number" ? s.quantity : "?"}`
        );
      } else setSuccessMsg("Prescription added.");
      setForm({
        medication_name: "",
        times_per_day: "",
        duration_days: "",
        total_quantity: "",
        start_date: "",
        instructions: "",
      });
      load();
    } catch (err) {
      setErrorMsg(pickErr(err));
    }
  };

  // Delete prescription
  const remove = async (id) => {
    if (!window.confirm("Delete prescription? This will restore stock.")) return;
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await axios.delete(`${RX_API}/${id}`);
      setSuccessMsg("Prescription deleted and stock restored (if the item still exists).");
      load();
    } catch (err) {
      setErrorMsg(pickErr(err));
    }
  };

  // Image helpers
  async function uploadImage(prescriptionId, file) {
    if (!file) return;
    setErrorMsg("");
    setSuccessMsg("");
    setUploadingMap((m) => ({ ...m, [prescriptionId]: true }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      await axios.post(`${RX_API}/${prescriptionId}/image`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        withCredentials: true,
      });
      setSuccessMsg("Image uploaded.");
      await load();
    } catch (err) {
      setErrorMsg(pickErr(err));
    } finally {
      setUploadingMap((m) => ({ ...m, [prescriptionId]: false }));
      const inp = filePickersRef.current[prescriptionId];
      if (inp) inp.value = "";
    }
  }
  async function getSignedUrl(prescriptionId) {
    const { data } = await axios.get(
      `${RX_API}/${prescriptionId}/signed-url`,
      { withCredentials: true }
    );
    return data?.url;
  }

  const goBack = () => navigate("/patients");
  const blank = (v) => (v === null || v === undefined || v === "" ? "—" : v);
  const onKeyDownAdd = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  return (
    <div className="rx-page">
      <Styles />
      <div className="page">

        {/* KPI strip (matches Patients) */}
        <div className="row kpis" style={{marginBottom:12, gap:12}}>
          <div className="card" style={{gridColumn:"span 3"}}>
            <div style={{color:"var(--p-muted)", fontSize:13}}>Total Prescriptions</div>
            <div style={{fontSize:22, fontWeight:800}}>{kpis.total}</div>
          </div>
          <div className="card" style={{gridColumn:"span 3"}}>
            <div style={{color:"var(--p-muted)", fontSize:13}}>Active</div>
            <div style={{fontSize:22, fontWeight:800}}>{kpis.active}</div>
          </div>
          <div className="card" style={{gridColumn:"span 3"}}>
            <div style={{color:"var(--p-muted)", fontSize:13}}>With Images</div>
            <div style={{fontSize:22, fontWeight:800}}>{kpis.withImg}</div>
          </div>
          <div className="card" style={{gridColumn:"span 3"}}>
            <div style={{color:"var(--p-muted)", fontSize:13}}>Search</div>
            <input className="input" placeholder="Search by medication…"
              value={search} onChange={(e)=>setSearch(e.target.value)} />
          </div>
        </div>

        {/* Patient header strip */}
        <div className="card" style={{marginBottom:12, display:"flex", gap:12, alignItems:"center", flexWrap:"wrap"}}>
          <div>
            <div><strong>Patient:</strong> {patient?.name || "(unknown)"} {patient?.email ? `• ${patient.email}` : ""}</div>
            <div style={{color:"var(--p-muted)", fontSize:13}}><strong>ID:</strong> {patientId || "(none)"}</div>
          </div>
          <div style={{marginLeft:"auto", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
            <span className="pill green">Qty Sum: {kpis.qtySum}</span>
            <button className="pill gray" onClick={goBack}>← Back to Patients</button>
          </div>
        </div>

        {/* Add Prescription */}
        <div className="card" style={{marginBottom:12}}>
          <h3>Add Prescription</h3>
          <div className="row add" style={{marginTop:8}} onKeyDown={onKeyDownAdd}>
            <div style={{gridColumn:"span 4"}}>
              <input className="input" placeholder="Medication (e.g., Paracetamol 500 mg)"
                value={form.medication_name} onChange={(e)=>onChange("medication_name", e.target.value)} disabled={!patientId}/>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <input className="input" placeholder="Times/day" type="number" min={1} max={24}
                value={form.times_per_day} onChange={(e)=>onChange("times_per_day", e.target.value)} disabled={!patientId}/>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <input className="input" placeholder="Duration (days)" type="number" min={1} max={365}
                value={form.duration_days} onChange={(e)=>onChange("duration_days", e.target.value)} disabled={!patientId}/>
            </div>
            <div style={{gridColumn:"span 2"}}>
              <input className="input" placeholder="Total qty"
                type="number" min={0}
                value={form.total_quantity} onChange={(e)=>onChange("total_quantity", e.target.value)} disabled={!patientId}/>
            </div>
            <div style={{gridColumn:"span 2", display:"flex", alignItems:"center"}}>
              <button className="pill gray" type="button" onClick={()=>onChange("total_quantity", suggestedQty)} disabled={!patientId}>
                Suggest: {Number.isFinite(suggestedQty) ? suggestedQty : 0}
              </button>
            </div>
            <div style={{gridColumn:"span 3"}}>
              <input className="input" placeholder="Start date" type="date"
                value={form.start_date} onChange={(e)=>onChange("start_date", e.target.value)} disabled={!patientId}/>
            </div>
            <div style={{gridColumn:"span 5"}}>
              <input className="input" placeholder="Instructions (optional)"
                value={form.instructions} onChange={(e)=>onChange("instructions", e.target.value)} disabled={!patientId}/>
            </div>
            <div style={{gridColumn:"span 4", display:"flex", justifyContent:"flex-end", alignItems:"center"}}>
              <button className="pill blue" onClick={add} disabled={!patientId}>➕ Add Prescription</button>
            </div>
          </div>
          {errorMsg && <div style={{color:"#b91c1c", marginTop:8}}>⚠ {errorMsg}</div>}
          {successMsg && <div style={{color:"#166534", marginTop:8}}>✅ {successMsg}</div>}
        </div>

        {/* Prescriptions Table */}
        <div className="card">
          <h3>Prescriptions</h3>
          <div className="table-wrap" role="region" aria-label="Prescriptions table">
            <table>
              <thead>
                <tr>
                  {["ID","Medication","Times/Day","Duration (days)","Total Qty","Start Date","First Time (by patient)","Instructions","Image","Actions"]
                    .map(h=> <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} style={{textAlign:"center", padding:16}}>Loading…</td></tr>
                ) : filtered.length ? (
                  filtered.map((p) => (
                    <tr key={p.id}>
                      <td>{blank(p.id)}</td>
                      <td style={{fontWeight:600}}>{blank(p.medication_name || p.medicine)}</td>
                      <td>{blank(p.times_per_day ?? p.frequency)}</td>
                      <td>{blank(p.duration_days ?? p.duration)}</td>
                      <td>{blank(p.total_quantity)}</td>
                      <td>{blank(p.start_date)}</td>
                      <td>{blank(p.first_intake_time)}</td>
                      <td>{blank(p.instructions)}</td>
                      <td>
                        <ImageCell
                          id={p.id}
                          getSignedUrl={getSignedUrl}
                          uploading={!!uploadingMap[p.id]}
                          onPick={(file) => uploadImage(p.id, file)}
                          inputRef={(el) => { filePickersRef.current[p.id] = el; }}
                        />
                      </td>
                      <td>
                        <div className="cell-actions">
                          <button className="pill red" onClick={()=>remove(p.id)}>❌ Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} style={{textAlign:"center", padding:16, color:"var(--p-muted)"}}>
                      {patientId ? "No prescriptions found" : "Open this page via the “Manage” button from Patients."}
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

/** preview + upload + download */
function ImageCell({ id, getSignedUrl, uploading, onPick, inputRef }) {
  const [thumb, setThumb] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const url = await getSignedUrl(id);
        if (!cancelled) setThumb(url || null);
      } catch {} finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, getSignedUrl, uploading]);

  const triggerPick = () => {
    const el = inputRef?.();
    if (el?.click) el.click();
  };

  const downloadNow = async () => {
    try {
      const url = await getSignedUrl(id);
      if (url) window.open(url, "_blank", "noreferrer");
    } catch {}
  };

  return (
    <div style={{display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
      <img src={thumb || ""} alt={thumb ? "Prescription image" : "No image"}
           className="thumb" onError={(e)=>{ e.currentTarget.src=""; }}
           style={{ opacity: (busy || uploading) ? 0.6 : 1 }} />
      <div style={{display:"flex", flexDirection:"column", gap:6}}>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          ref={(el) => { if (typeof inputRef === "function") inputRef(() => el); }}
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 10 * 1024 * 1024) { alert("Max 10MB"); e.target.value=""; return; }
            onPick(f);
          }}
        />
        <button className="pill gray" type="button" onClick={triggerPick} disabled={uploading}>
          {uploading ? "Uploading…" : (thumb ? "Replace image" : "Upload image")}
        </button>
        <button className="pill blue" type="button" onClick={downloadNow} disabled={!thumb}>
          Download image
        </button>
      </div>
    </div>
  );
}
