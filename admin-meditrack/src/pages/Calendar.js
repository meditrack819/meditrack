// src/pages/Calendar.js — admin bookings with first/last name, service rules, date pickers, future-only times for today
import React, { useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";
import { Calendar as RBCalendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";

/* ---------- API ---------- */
const API_BASE = process.env.REACT_APP_BACKEND_URL || "/api";
const api = axios.create({ baseURL: API_BASE, timeout: 15000 });
const getJSON = async (path, params) => (await api.get(path, { params })).data;
const postJSON = async (path, body) => (await api.post(path, body)).data;
const putJSON = async (path, body) => (await api.put(path, body)).data;
const delJSON = async (path) => (await api.delete(path)).data;

// Optional: fetch day-level metadata (closed days, custom hours)
const getDays = async () => {
  try {
    return await getJSON("/appointments/days");
  } catch {
    return [];
  }
};

/* ---------- Styles ---------- */
const InjectStyles = () => (
  <style>{`
    :root{
      --bg:#f6f7fb;--card:#fff;--muted:#6b7280;--text:#111827;--primary:#1e40af;--danger:#dc2626;--border:#e5e7eb;--green:#dcfce7;--red:#fee2e2;--gray:#f3f4f6;--radius:16px
    }
    *{box-sizing:border-box}
    html,body,#root{height:100%}
    body{margin:0;background:var(--bg);color:var(--text)}
    .page{max-width:1200px;margin:0 auto;padding:16px}
    .title{display:flex;gap:10px;align-items:baseline;margin:0 0 8px}
    .title h2{margin:0;color:var(--primary)}
    .subtitle{color:var(--muted);font-size:14px}
    .toolbar{display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
    .tool-right{margin-left:auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .chip{padding:4px 10px;border-radius:999px;border:1px solid var(--border);background:#fff}
    .chip.green{background:var(--green)} .chip.red{background:var(--red)} .chip.gray{background:var(--gray)}
    .btn{border:1px solid var(--border);background:#fff;padding:10px 14px;border-radius:12px;cursor:pointer;font-weight:600;min-height:40px}
    .btn[disabled]{opacity:.6;cursor:not-allowed}
    .btn.primary{background:var(--primary);color:#fff;border-color:transparent}
    .btn.danger{background:var(--danger);color:#fff;border-color:transparent}
    .card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px}
    .grid{display:grid;gap:12px}
    .grid-5{grid-template-columns:repeat(5,1fr)}
    @media (max-width:1100px){.grid-5{grid-template-columns:repeat(2,1fr)}}
    @media (max-width:640px){.grid-5{grid-template-columns:1fr}}
    .input,select{width:100%;padding:12px;border:1px solid var(--border);border-radius:12px}
    .label{font-size:12px;color:var(--muted);display:block;margin-bottom:6px}
    .pill{padding:6px 12px;border-radius:999px;border:1px solid var(--border);font-weight:700}
    .pill.ok{background:var(--green)} .pill.bad{background:var(--red)}
    .table-wrap{overflow:auto;border-radius:12px}
    table{width:100%;border-collapse:separate;border-spacing:0}
    thead th{position:sticky;top:0;background:var(--primary);color:#fff;text-align:left;padding:10px}
    tbody td{padding:10px;border-bottom:1px solid var(--border);vertical-align:top}
    .calendar-shell{height:70vh;min-height:420px}
    .rbc-event{padding:2px 6px;border-radius:8px;line-height:1.2;background:#1e40af;border:none;color:#fff}
    .evt{display:flex;gap:6px;align-items:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .evt-time{font-weight:800} .evt-dot{width:6px;height:6px;border-radius:999px;background:#fff;opacity:.9}
    .warn{background:var(--red);border:1px solid #fecaca;padding:10px;border-radius:12px;color:#7f1d1d}

    /* Phones: rows become cards */
    @media (max-width: 720px){
      .table-wrap thead{ display:none; }
      .table-wrap table, .table-wrap tbody, .table-wrap tr, .table-wrap td{ display:block; width:100%; }
      .table-wrap tbody tr{
        border:1px solid var(--border);
        border-radius:var(--radius);
        margin:12px 0;
        overflow:hidden;
        background:var(--card);
        box-shadow:0 1px 3px rgba(0,0,0,.08);
      }
      .table-wrap tbody td{
        display:grid;
        grid-template-columns:minmax(120px, 44%) 1fr;
        gap:10px;
        background:transparent;
        padding:12px 14px;
      }
      .table-wrap tbody td + td{ border-top:1px solid var(--border); }
      .table-wrap tbody td::before{ content:attr(data-label); font-weight:600; color:var(--muted); }
      .actions{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    }
  `}</style>
);

/* ---------- Helpers ---------- */
const localizer = momentLocalizer(moment);
const SLOT_MINUTES = 30;
const OPEN_HOUR = 8;
const CLOSE_HOUR = 17;

const isWeekendISO = (ds) => moment(ds, "YYYY-MM-DD", true).isoWeekday() >= 6;
const isPastDateISO = (ds) =>
  moment(ds, "YYYY-MM-DD").isBefore(moment().startOf("day"));

const genTimes = (oh = OPEN_HOUR, ch = CLOSE_HOUR) => {
  const out = [];
  for (let h = oh; h < ch; h++) {
    out.push(`${String(h).padStart(2, "0")}:00:00`);
    out.push(`${String(h).padStart(2, "0")}:30:00`);
  }
  return out;
};
const toDisplay = (t) => moment(t, ["HH:mm:ss", "H:mm", "HH:mm"]).format("h:mm A");

function makeLocalDate(ds, ts) {
  if (!ds && !ts) return new Date(NaN);
  const md = moment(ds, ["YYYY-MM-DD", moment.ISO_8601], true);
  if (!md.isValid()) return new Date(NaN);
  const y = md.year(),
    m = md.month(),
    d = md.date();
  const mt = moment(ts, ["HH:mm:ss", "H:mm", "HH:mm"], true);
  const hh = mt.isValid() ? mt.hours() : 0;
  const mm = mt.isValid() ? mt.minutes() : 0;
  const ss = mt.isValid() ? mt.seconds() : 0;
  return new Date(y, m, d, hh, mm, ss, 0);
}

/* ---------- Services ---------- */
const SERVICES = ["Vaccination", "Check-ups", "TB DOTS", "Therapy (youth)"];
const isWednesdayISO = (ds) => moment(ds, "YYYY-MM-DD", true).isoWeekday() === 3;

/* Payload normalizers */
const normalizePayload = (payload) =>
  Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.appointments)
    ? payload.appointments
    : Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.rows)
    ? payload.rows
    : [];

/* Prefer patient_name from row; else any joined name; else "Unknown" */
function getDisplayName(a) {
  return (
    (a?.patient_name && a.patient_name.trim()) ||
    a?.patients?.full_name ||
    a?.patient?.full_name ||
    "Unknown"
  );
}

/* Normalize row → rbc event */
function normalizeRow(a) {
  const s = a.start
    ? new Date(a.start)
    : makeLocalDate(a.date, a.time || a.start_time);
  const e = a.end ? new Date(a.end) : new Date(s.getTime() + SLOT_MINUTES * 60000);
  return {
    id:
      a.id ??
      a._id ??
      `${(a.date || "x")}_${(a.time || "x")}_${Math.random().toString(36).slice(2, 8)}`,
    title: `${getDisplayName(a)} — ${a.reason || "Appointment"}`,
    start: s,
    end: e,
    raw: a,
  };
}
const eventToISODate = (ev) => moment(ev.start).format("YYYY-MM-DD");

function buildDayMapFromRows(rows) {
  const dm = {};
  rows.forEach((r) => {
    const ev = normalizeRow(r);
    if (isNaN(ev.start)) return;
    const ds = eventToISODate(ev);
    if (!dm[ds]) {
      dm[ds] = {
        date: ds,
        bookedCount: 0,
        isClosed: false,
        isWeekend: isWeekendISO(ds),
        isFull: false,
        openHour: undefined,
        closeHour: undefined,
      };
    }
    dm[ds].bookedCount++;
  });
  return dm;
}

/* ---------------- Edit Modal ---------------- */
function EditModal({
  open,
  value,
  onChange,
  onSave,
  onClose,
  saving,
  timesForDay,
  selectedDate,
}) {
  if (!open) return null;
  const times = timesForDay(
    selectedDate ||
      value.date ||
      moment(value.start || value.datetime).format("YYYY-MM-DD")
  );
  const mutuallyExclusive = (k) => {
    if (k === "attended") onChange({ ...value, attended: true, missed: false });
    if (k === "missed") onChange({ ...value, attended: false, missed: true });
  };
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <h3 style={{ margin: 0 }}>✏️ Edit Appointment</h3>
          <button className="btn" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>

        <div className="grid" style={{ gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
          <div>
            <label className="label">Patient Name</label>
            <input
              className="input"
              value={value.patient_name || ""}
              onChange={(e) => onChange({ ...value, patient_name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Reason</label>
            <input
              className="input"
              value={value.reason || ""}
              onChange={(e) => onChange({ ...value, reason: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Time</label>
            <select
              className="input"
              value={value.time || value.start_time || ""}
              onChange={(e) =>
                onChange({ ...value, time: e.target.value, start_time: e.target.value })
              }
            >
              <option value="">Select time…</option>
              {times.map((t) => (
                <option key={t} value={t}>
                  {toDisplay(t)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label className="label">Attendance</label>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <label>
                <input
                  type="checkbox"
                  checked={!!value.attended}
                  onChange={() => mutuallyExclusive("attended")}
                />{" "}
                Attended
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!value.missed}
                  onChange={() => mutuallyExclusive("missed")}
                />{" "}
                Missed
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button className="btn primary" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Page ---------------- */
export default function Calendar() {
  // Core data
  const [allRows, setAllRows] = useState([]);
  const [events, setEvents] = useState([]);
  const [dayMap, setDayMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // UI state
  const [calDate, setCalDate] = useState(() => {
    const v = localStorage.getItem("calDate");
    return v ? new Date(v) : new Date();
  });
  const [calView, setCalView] = useState(() => localStorage.getItem("calView") || "month");
  const [selectedDate, setSelectedDate] = useState(
    () => localStorage.getItem("selectedDate") || moment().format("YYYY-MM-DD")
  );
  const [dayList, setDayList] = useState([]);

  // Add Appointment form state (first/last name; no UUID field)
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    reason: "", // service
    time: "",
  });
  const handleChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const [hideWeekends, setHideWeekends] = useState(false);

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editVal, setEditVal] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  const todayISO = moment().format("YYYY-MM-DD");

  const rangeFor = useCallback((date, view) => {
    const m = moment(date);
    if (view === "day") return { start: m.clone().startOf("day"), end: m.clone().endOf("day") };
    if (view === "week")
      return { start: m.clone().startOf("isoWeek"), end: m.clone().endOf("isoWeek") };
    return {
      start: m.clone().startOf("month").startOf("isoWeek"),
      end: m.clone().endOf("month").endOf("isoWeek"),
    };
  }, []);

  const timesForDay = useCallback(
    (ds) => {
      const info = dayMap[ds] || {};
      const oh = Number.isFinite(info.openHour) ? info.openHour : OPEN_HOUR;
      const ch = Number.isFinite(info.closeHour) ? info.closeHour : CLOSE_HOUR;
      return genTimes(oh, ch);
    },
    [dayMap]
  );

  const capacityForDay = useCallback(
    (ds) => {
      const info = dayMap[ds] || {};
      const oh = Number.isFinite(info.openHour) ? info.openHour : OPEN_HOUR;
      const ch = Number.isFinite(info.closeHour) ? info.closeHour : CLOSE_HOUR;
      return (ch - oh) * (60 / SLOT_MINUTES);
    },
    [dayMap]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rowsPayload, daysMeta] = await Promise.all([getJSON("/appointments"), getDays()]);
      const rows = normalizePayload(rowsPayload);
      setAllRows(rows);

      const globalDM = buildDayMapFromRows(rows);

      (daysMeta || []).forEach((d) => {
        const k = d.date;
        if (!globalDM[k])
          globalDM[k] = { date: k, bookedCount: 0, isWeekend: isWeekendISO(k), isFull: false };
        globalDM[k].isClosed = !!d.isClosed;
        if (Number.isFinite(d.openHour) && Number.isFinite(d.closeHour)) {
          globalDM[k].openHour = d.openHour;
          globalDM[k].closeHour = d.closeHour;
        }
      });

      Object.values(globalDM).forEach((d) => {
        const oh = Number.isFinite(d.openHour) ? d.openHour : OPEN_HOUR;
        const ch = Number.isFinite(d.closeHour) ? d.closeHour : CLOSE_HOUR;
        const cap = (ch - oh) * (60 / SLOT_MINUTES);
        d.isFull = d.bookedCount >= cap;
      });

      setDayMap(globalDM);

      const { start, end } = rangeFor(calDate, calView);
      const evtsAll = rows
        .map((r) => normalizeRow(r))
        .filter((ev) => !isNaN(ev.start) && !isNaN(ev.end));
      const evtsRange = evtsAll.filter(
        (ev) => ev.start >= start.toDate() && ev.start <= end.toDate()
      );
      setEvents(evtsRange);

      if (selectedDate) {
        const dayRows = rows.filter(
          (r) => moment(normalizeRow(r).start).format("YYYY-MM-DD") === selectedDate
        );
        setDayList(dayRows);
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || "Failed to load appointments.";
      console.error("Load error:", msg);
      setError(msg);
      setAllRows([]);
      setEvents([]);
      setDayMap({});
    } finally {
      setLoading(false);
    }
  }, [calDate, calView, rangeFor, selectedDate]);

  useEffect(() => {
    (async () => {
      await loadAll();
    })();
  }, [loadAll]);

  useEffect(() => {
    const { start, end } = rangeFor(calDate, calView);
    const evtsAll = allRows
      .map((r) => normalizeRow(r))
      .filter((ev) => !isNaN(ev.start) && !isNaN(ev.end));
    const evtsRange = evtsAll.filter(
      (ev) => ev.start >= start.toDate() && ev.start <= end.toDate()
    );
    setEvents(evtsRange);
  }, [allRows, calDate, calView, rangeFor]);

  useEffect(() => {
    localStorage.setItem("calView", calView);
  }, [calView]);
  useEffect(() => {
    localStorage.setItem("calDate", calDate.toISOString());
  }, [calDate]);
  useEffect(() => {
    if (selectedDate) localStorage.setItem("selectedDate", selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    const onFocus = () => loadAll();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadAll]);

  const openDay = useCallback(
    (ds) => {
      setSelectedDate(ds);
      const dayRows = allRows.filter(
        (r) => moment(normalizeRow(r).start).format("YYYY-MM-DD") === ds
      );
      setDayList(dayRows);
    },
    [allRows]
  );

  const goToDay = (ds) => {
    setCalView("day");
    setCalDate(moment(ds, "YYYY-MM-DD").toDate());
    openDay(ds);
  };

  /* Mutations */
  const toggleDay = async () => {
    if (!selectedDate) return;
    try {
      const cur = dayMap[selectedDate];
      const close = !(cur && cur.isClosed);
      await postJSON("/appointments/toggle-day", { date: selectedDate, close });
      await loadAll();
      openDay(selectedDate);
    } catch (err) {
      console.error("Toggle error:", err);
      window.alert(err?.response?.data?.error || err.message);
    }
  };

  const addAppointment = async (e) => {
    e?.preventDefault?.();
    if (!selectedDate) return window.alert("Select a date first.");
    if (isPastDateISO(selectedDate)) return window.alert("You cannot book in the past.");
    if (isWeekendISO(selectedDate)) return window.alert("No clinic hours on weekends.");
    if (!form.first_name?.trim()) return window.alert("First name is required.");
    if (!form.last_name?.trim()) return window.alert("Last name is required.");
    if (!form.reason) return window.alert("Please choose a service.");
    if (!form.time) return window.alert("Please choose a time.");

    const isTherapy = String(form.reason).toLowerCase().includes("therapy");
    if (isTherapy && !isWednesdayISO(selectedDate)) {
      return window.alert("Therapy (youth) is only available on Wednesdays.");
    }

    const booked = new Set(dayList.map((a) => a.time || a.start_time).filter(Boolean));
    if (booked.has(form.time))
      return window.alert("That time is already booked. Pick another.");

    try {
      // generate a placeholder UUID so the DB NOT NULL constraint is satisfied
      const generatedId =
        window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const payload = {
        patient_name: `${form.first_name.trim()} ${form.last_name.trim()}`.replace(/\s+/g, " "),
        patient_id: generatedId,
        reason: form.reason.trim(),
        date: selectedDate,
        time: form.time,
      };

      await postJSON("/appointments", payload);

      setForm({ first_name: "", last_name: "", reason: "", time: "" });
      await loadAll();
      openDay(selectedDate);
    } catch (err) {
      console.error("Add error:", err);
      window.alert(err?.response?.data?.error || err.message);
    }
  };

  const deleteAppt = async (id) => {
    if (!window.confirm("Delete appointment?")) return;
    try {
      await delJSON(`/appointments/${id}`);
      await loadAll();
      openDay(selectedDate);
    } catch (err) {
      console.error("Delete error:", err);
      window.alert(err?.response?.data?.error || err.message);
    }
  };

  const setAttendance = async (appt, which) => {
    try {
      const dateISO =
        appt.date || moment(appt.start || appt.datetime).format("YYYY-MM-DD");
      const payload = {
        patient_name: appt.patient_name || getDisplayName(appt) || null,
        patient_id: appt.patient_id || undefined,
        reason: appt.reason || null,
        date: dateISO,
        time: appt.time || appt.start_time,
        status: which === "attended" ? "attended" : "missed",
        attended: which === "attended",
        missed: which === "missed",
      };
      await putJSON(`/appointments/${appt.id || appt._id}`, payload);
      await loadAll();
      openDay(selectedDate);
    } catch (err) {
      console.error("Attendance update error:", err);
      window.alert(err?.response?.data?.error || err.message);
    }
  };

  /* Derived UI helpers */
  const viewEvents = useMemo(() => {
    if (!hideWeekends) return events;
    return events.filter((e) => !isWeekendISO(eventToISODate(e)));
  }, [events, hideWeekends]);

  const selectedInfo = dayMap[selectedDate] || {};
  const isPast = selectedDate ? isPastDateISO(selectedDate) : false;

  const availableTimes = useMemo(() => {
    if (!selectedDate) return [];
    const booked = new Set(dayList.map((a) => a.time || a.start_time).filter(Boolean));
    const cur = dayMap[selectedDate];
    const closed = cur?.isClosed || cur?.isWeekend || cur?.isFull || isPast;
    if (closed) return [];

    // Base list from clinic hours minus booked
    let times = timesForDay(selectedDate).filter((t) => !booked.has(t));

    // If today → only future times
    const todayStr = moment().format("YYYY-MM-DD");
    if (selectedDate === todayStr) {
      const nowHHMMSS = moment().format("HH:mm:ss");
      times = times.filter((t) => t > nowHHMMSS);
    }

    return times;
  }, [selectedDate, dayList, dayMap, isPast, timesForDay]);

  // Auto-pick next available time if none selected or no longer valid
  useEffect(() => {
    if (!selectedDate) return;
    const inList = availableTimes.includes(form.time);
    if (!inList) {
      const next = availableTimes[0] || "";
      setForm((f) => ({ ...f, time: next }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, availableTimes]);

  const dayPropGetter = useCallback(
    (date) => {
      const ds = moment(date).format("YYYY-MM-DD");
      if (isPastDateISO(ds)) return { style: { opacity: 0.6, background: "var(--gray)" } };
      const info = dayMap[ds] || {
        isClosed: false,
        isWeekend: isWeekendISO(ds),
        bookedCount: 0,
      };
      const cap = capacityForDay(ds);
      const isFull = (info.bookedCount || 0) >= cap;
      const isBlocked = info.isClosed || isFull || info.isWeekend;
      return { style: { background: isBlocked ? "var(--red)" : "var(--green)" } };
    },
    [dayMap, capacityForDay]
  );

  function EventLine({ event }) {
    const a = event.raw || {};
    const time = a.time || a.start_time || moment(event.start).format("HH:mm:ss");
    const who = getDisplayName(a);
    const reason = a.reason || "Appointment";
    return (
      <div className="evt" title={`${toDisplay(time)} • ${who} • ${reason}`}>
        <span className="evt-dot" />
        <span className="evt-time">{toDisplay(time)}</span>
        <span>— {who}
          {reason ? ` (${reason})` : ""}
        </span>
      </div>
    );
  }
  const rowKey = (a) =>
    a.id || a._id || `${a.date || ""}_${a.time || a.start_time || ""}`;

  const exportDayCsv = () => {
    if (!selectedDate || !dayList.length) return;
    const lines = [["Time", "Patient", "Reason", "Status"]].concat(
      dayList.map((a) => [
        toDisplay(
          a.time || a.start_time || moment(a.start || a.datetime).format("HH:mm")
        ),
        (getDisplayName(a) || "").replaceAll(",", " "),
        (a.reason || "").replaceAll(",", " "),
        a.status || (a.attended ? "attended" : a.missed ? "missed" : "scheduled"),
      ])
    );
    const csv = lines
      .map((r) => r.map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const aEl = document.createElement("a");
    aEl.href = url;
    aEl.download = `appointments_${selectedDate}.csv`;
    aEl.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <InjectStyles />

      <div className="title">
        <h2>📅 Appointments</h2>
        <span className="subtitle">
          Admin tools with first/last name, service rules, date pickers, and future-only times for today.
        </span>
      </div>

      <div className="toolbar">
        <span className="chip green">Green = slots available</span>
        <span className="chip red">Red = closed/fully booked/weekend</span>
        <span className="chip gray">Gray = past date</span>

        {/* Quick calendar date jump */}
        <div className="tool-right">
          <label className="label" style={{ margin: 0 }}>
            Jump to date
          </label>
          <input
            type="date"
            className="input"
            style={{ width: 200 }}
            value={selectedDate || ""}
            min={todayISO}
            onChange={(e) => {
              const ds = e.target.value;
              if (ds) {
                goToDay(ds);
              }
            }}
          />
          <button className="btn" onClick={() => loadAll()} disabled={loading}>
            🔄 {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Big calendar */}
      <div className="card">
        <div className="calendar-shell">
          <RBCalendar
            selectable
            localizer={localizer}
            events={viewEvents}
            startAccessor="start"
            endAccessor="end"
            view={calView}
            onView={setCalView}
            date={calDate}
            onNavigate={(d) => {
              setCalDate(d);
            }}
            defaultView="month"
            views={["month", "week", "day"]}
            style={{ borderRadius: 12, height: "100%" }}
            dayPropGetter={dayPropGetter}
            onSelectSlot={({ start }) => goToDay(moment(start).format("YYYY-MM-DD"))}
            onSelectEvent={(evt) => goToDay(moment(evt.start).format("YYYY-MM-DD"))}
            popup
            min={new Date(1970, 1, 1, OPEN_HOUR, 0, 0)}
            max={new Date(1970, 1, 1, CLOSE_HOUR, 0, 0)}
            step={SLOT_MINUTES}
            timeslots={1}
            components={{ event: EventLine }}
          />
        </div>
      </div>

      {/* Day header + actions */}
      <div className="subtitle" style={{ marginTop: 12 }}>
        {selectedDate
          ? `You selected ${moment(selectedDate).format("dddd, MMM D, YYYY")}.`
          : "Select a date to view details."}
      </div>

      {selectedDate && (
        <div className="card" style={{ marginTop: 8 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <strong>{moment(selectedDate).format("dddd, MMM D, YYYY")}</strong>
              <span className={`pill ${selectedInfo.isClosed ? "bad" : "ok"}`}>
                {selectedInfo.isWeekend
                  ? "Weekend (closed)"
                  : selectedInfo.isClosed
                  ? "Closed"
                  : isPast
                  ? "Past (view only)"
                  : "Open"}
              </span>
              <span className="subtitle">
                {(selectedInfo.bookedCount || dayList.length || 0)}/
                {capacityForDay(selectedDate)} booked
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={exportDayCsv} disabled={!dayList.length}>
                ⬇️ Export CSV
              </button>
              <button
                className="btn"
                onClick={toggleDay}
                disabled={!selectedDate || loading}
              >
                {selectedInfo.isClosed ? "Open Day" : "Close Day"}
              </button>
            </div>
          </div>

          {/* Booked times row */}
          {(() => {
            const times = dayList
              .map(
                (a) =>
                  a.time ||
                  a.start_time ||
                  moment(a.start || a.datetime).format("HH:mm:ss")
              )
              .filter(Boolean)
              .sort();
            const uniq = Array.from(new Set(times));
            return uniq.length > 0 ? (
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <span className="chip gray" style={{ fontWeight: 700 }}>
                  Booked times:
                </span>
                {uniq.map((t) => (
                  <span key={t} className="chip">
                    {toDisplay(t)}
                  </span>
                ))}
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* Add Appointment (first/last name) */}
      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Add Appointment</h3>
        <form onSubmit={addAppointment}>
          <div className="grid grid-5">
            {/* Date picker */}
            <div>
              <label className="label" htmlFor="date">
                Date *
              </label>
              <input
                id="date"
                type="date"
                className="input"
                required
                value={selectedDate || ""}
                min={todayISO}
                onChange={(e) => {
                  const ds = e.target.value;
                  if (ds) {
                    goToDay(ds);
                  }
                }}
              />
              {selectedDate && isWeekendISO(selectedDate) && (
                <div style={{ marginTop: 6, color: "#991b1b" }}>
                  No clinic hours on weekends.
                </div>
              )}
            </div>

            <div>
              <label className="label" htmlFor="fname">
                First Name *
              </label>
              <input
                id="fname"
                className="input"
                required
                value={form.first_name}
                onChange={(e) => handleChange("first_name", e.target.value)}
                placeholder="e.g. Juan"
              />
            </div>

            <div>
              <label className="label" htmlFor="lname">
                Last Name *
              </label>
              <input
                id="lname"
                className="input"
                required
                value={form.last_name}
                onChange={(e) => handleChange("last_name", e.target.value)}
                placeholder="e.g. Dela Cruz"
              />
            </div>

            <div>
              <label className="label" htmlFor="reason">
                Service *
              </label>
              <select
                id="reason"
                className="input"
                required
                value={form.reason}
                onChange={(e) => handleChange("reason", e.target.value)}
                disabled={!selectedDate || selectedInfo.isClosed || isPast}
              >
                <option value="">
                  {!selectedDate ? "Select a date first…" : "Select service…"}
                </option>
                {SERVICES.map((svc) => {
                  const isTherapy = svc.toLowerCase().includes("therapy");
                  const disabled = isTherapy && selectedDate && !isWednesdayISO(selectedDate);
                  return (
                    <option key={svc} value={svc} disabled={disabled}>
                      {svc}
                      {disabled ? " (Weds only)" : ""}
                    </option>
                  );
                })}
              </select>
              {selectedDate && !isWednesdayISO(selectedDate) && (
                <div className="subtitle" style={{ marginTop: 6 }}>
                  Note: <strong>Therapy (youth)</strong> is available on{" "}
                  <strong>Wednesdays</strong> only.
                </div>
              )}
            </div>

            <div>
              <label className="label" htmlFor="time">
                Time *
              </label>
              <select
                id="time"
                className="input"
                required
                value={form.time}
                onChange={(e) => handleChange("time", e.target.value)}
                disabled={!selectedDate || selectedInfo.isClosed || isPast}
              >
                <option value="">
                  {!selectedDate ? "Select a date first…" : "Select time…"}
                </option>
                {availableTimes.map((t) => (
                  <option key={t} value={t}>
                    {toDisplay(t)}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "end" }}>
              <button
                type="submit"
                className="btn primary"
                disabled={loading || !selectedDate || selectedInfo.isClosed || isPast}
              >
                ➕ Add
              </button>
            </div>
          </div>

          {!selectedDate && (
            <div className="subtitle" style={{ marginTop: 8 }}>
              Pick a date above.
            </div>
          )}
          {isPast && (
            <div style={{ marginTop: 8, color: "#991b1b" }}>
              Past date — booking disabled.
            </div>
          )}
          {!isPast && selectedInfo.isClosed && (
            <div style={{ marginTop: 8, color: "#991b1b" }}>
              Day is closed. Open it to add appointments.
            </div>
          )}
        </form>
      </div>

      {/* Day list table */}
      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>
          Appointments for {selectedDate ? moment(selectedDate).format("MMM D, YYYY") : "—"}
        </h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{["Time", "Patient", "Reason", "Status", "Actions"].map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {!selectedDate ? (
                <tr>
                  <td colSpan={5} style={{ padding: 16, textAlign: "center" }}>
                    Select a date
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: 16, textAlign: "center" }}>
                    Loading…
                  </td>
                </tr>
              ) : dayList.length ? (
                dayList
                  .slice()
                  .sort((a, b) =>
                    String(a.time || a.start_time).localeCompare(String(b.time || b.start_time))
                  )
                  .map((a) => {
                    const t = toDisplay(
                      a.time || a.start_time || moment(a.start || a.datetime).format("HH:mm")
                    );
                    const who = getDisplayName(a);
                    const status =
                      a.status || (a.attended ? "attended" : a.missed ? "missed" : "scheduled");
                    const attended = status === "attended";
                    const missed = status === "missed";
                    return (
                      <tr key={rowKey(a)}>
                        <td data-label="Time">
                          <code>{t}</code>
                        </td>
                        <td data-label="Patient">
                          <strong>{who}</strong>
                        </td>
                        <td data-label="Reason">
                          <span>{a.reason || "—"}</span>
                        </td>
                        <td data-label="Status">
                          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                            <label>
                              <input
                                type="checkbox"
                                checked={attended}
                                onChange={() => setAttendance(a, "attended")}
                              />{" "}
                              Attended
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                checked={missed}
                                onChange={() => setAttendance(a, "missed")}
                              />{" "}
                              Missed
                            </label>
                            <span style={{ color: "var(--muted)" }}>({status})</span>
                          </div>
                        </td>
                        <td data-label="Actions" style={{ textAlign: "right" }}>
                          <div className="actions">
                            <button
                              className="btn"
                              onClick={() => {
                                setEditVal({
                                  id: a.id || a._id,
                                  date:
                                    a.date ||
                                    moment(a.start || a.datetime).format("YYYY-MM-DD"),
                                  time:
                                    a.time ||
                                    a.start_time ||
                                    moment(a.start).format("HH:mm:ss"),
                                  patient_name: a.patient_name || getDisplayName(a) || "",
                                  patient_id: a.patient_id || "",
                                  reason: a.reason || "",
                                  attended: !!a.attended || a.status === "attended",
                                  missed: !!a.missed || a.status === "missed",
                                });
                                setEditOpen(true);
                              }}
                            >
                              ✏️ Edit
                            </button>
                            <button
                              className="btn danger"
                              onClick={() => deleteAppt(a.id || a._id)}
                            >
                              ❌ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    style={{ padding: 16, textAlign: "center", color: "var(--muted)" }}
                  >
                    No appointments
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <EditModal
        open={editOpen}
        value={editVal}
        onChange={setEditVal}
        onSave={async () => {
          const v = editVal;
          if (!v?.id) return;
          if (!v.patient_name || !v.time) {
            window.alert("Patient Name and Time are required.");
            return;
          }
          const payload = {
            patient_name: String(v.patient_name).trim(),
            patient_id: v.patient_id || undefined, // keep existing id if present
            reason: v.reason ? String(v.reason).trim() : null,
            date: v.date,
            time: v.time,
            status: v.attended ? "attended" : v.missed ? "missed" : "scheduled",
            attended: !!v.attended,
            missed: !!v.missed,
          };
          try {
            setEditSaving(true);
            await putJSON(`/appointments/${v.id}`, payload);
            setEditOpen(false);
            await loadAll();
            openDay(v.date);
          } catch (err) {
            const apiErr = err?.response?.data;
            const msg =
              (apiErr && (apiErr.error || apiErr.detail || apiErr.message)) ||
              err.message ||
              "Failed to update appointment.";
            window.alert(`Failed to update appointment: ${msg}`);
          } finally {
            setEditSaving(false);
          }
        }}
        onClose={() => setEditOpen(false)}
        saving={editSaving}
        timesForDay={timesForDay}
        selectedDate={selectedDate}
      />
    </div>
  );
}
