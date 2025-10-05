// src/pages/ServiceCalendar.js
import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { Calendar as RBCalendar, momentLocalizer } from "react-big-calendar";
import { useParams } from "react-router-dom";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";

/* ---------- API ---------- */
const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const api = axios.create({ baseURL: API_BASE, timeout: 15000 });

const getJSON = async (path, params) =>
  (await api.get(`/api${path}`, { params })).data;
const postJSON = async (path, body) =>
  (await api.post(`/api${path}`, body)).data;
const putJSON = async (path, body) =>
  (await api.put(`/api${path}`, body)).data;
const delJSON = async (path) =>
  (await api.delete(`/api${path}`)).data;

/* ---------- Helpers ---------- */
const localizer = momentLocalizer(moment);

const toProperCase = (str) =>
  str
    ? str
        .toLowerCase()
        .split(" ")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : "";

/** Normalize "time" to HH:mm:ss (trims fractional seconds, supports HH:mm) */
const toHHMMSS = (t) => {
  if (!t) return "00:00:00";
  const s = String(t).trim();
  const main = s.split(".")[0]; // drop .SSS or .ffffff
  if (/^\d{2}:\d{2}:\d{2}$/.test(main)) return main;
  if (/^\d{2}:\d{2}$/.test(main)) return `${main}:00`;
  // last resort: let moment coerce it
  const m = moment(main, ["HH:mm:ss", "HH:mm"], true);
  return m.isValid() ? m.format("HH:mm:ss") : "00:00:00";
};

/** Build JS Date in local time without timezone shifts */
const buildLocalDate = (dateISO, timeHHMMSS) => {
  const md = moment(dateISO, "YYYY-MM-DD", true);
  const [hh, mm, ss] = toHHMMSS(timeHHMMSS).split(":").map((n) => parseInt(n || "0", 10));
  return new Date(md.year(), md.month(), md.date(), hh || 0, mm || 0, ss || 0);
};

/** Treat 'medical' as a family that includes 'medical', 'medical-general', 'medical-buntis', etc. */
const sameServiceFamily = (rowType = "", staffType = "") => {
  const a = String(rowType).toLowerCase();
  const b = String(staffType).toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  // family = prefix before first '-'
  const famA = a.split("-")[0];
  const famB = b.split("-")[0];
  return famA === famB;
};

/** Convert API row to react-big-calendar event */
const normalizeRow = (a) => {
  try {
    const dateISO = moment(a.date).format("YYYY-MM-DD");
    const timeSQL = toHHMMSS(a.time || "00:00:00");

    const start = buildLocalDate(dateISO, timeSQL);
    const end = new Date(start.getTime() + 30 * 60000); // default 30 mins

    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

    const patientLabel =
      a.patient_name && a.patient_name.trim()
        ? toProperCase(a.patient_name)
        : a.first_name && a.last_name
        ? `${toProperCase(a.first_name)} ${toProperCase(a.last_name)}`
        : a.patient_id
        ? `Patient #${a.patient_id}`
        : "Unknown";

    return {
      id: a.id,
      title: `${moment(start).format("h:mm A")} — ${patientLabel}`,
      start,
      end,
      raw: { ...a, date: dateISO, time: timeSQL },
    };
  } catch (err) {
    console.error("normalizeRow error:", err, a);
    return null;
  }
};

/* ---------- Allowed Days & Durations ---------- */
const serviceConfig = {
  medical: { days: [1, 2, 3, 4, 5], duration: 30 },
  "medical-buntis": { days: [4], duration: 30 },
  "dental-bunot": { days: [1, 5], duration: 60 },
  "dental-pasta": { days: [2, 3], duration: 60 },
  "dental-buntis": { days: [4], duration: 60 },
  tb: { days: [1, 2, 3, 4, 5], duration: 30 },
  pt: { days: [1, 3, 5], duration: 60 },
  "vax-children": { days: [3], duration: 30 },
  "vax-adult": { days: [1, 2, 3, 4, 5], duration: 30 },
};

/* ---------- Styles ---------- */
const InjectStyles = () => (
  <style>{`
    :root {
      --bg:#f6f7fb;--card:#fff;--muted:#6b7280;--text:#111827;
      --primary:#1e40af;--danger:#dc2626;--border:#e5e7eb;
      --green:#dcfce7;--red:#fee2e2;--gray:#f3f4f6;--radius:12px;
    }
    body{background:var(--bg);}
    .page{max-width:1200px;margin:0 auto;padding:16px;}
    .card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-top:16px;}
    .chip{padding:4px 10px;border-radius:999px;border:1px solid var(--border);background:#fff;font-size:14px;}
    .chip.green{background:var(--green);} .chip.red{background:var(--red);} .chip.gray{background:var(--gray);}
    .input{padding:10px;border:1px solid var(--border);border-radius:var(--radius);min-width:160px;}
    .btn{padding:8px 14px;border-radius:var(--radius);border:none;cursor:pointer;font-weight:600;}
    .btn.primary{background:var(--primary);color:#fff;} .btn.danger{background:var(--danger);color:#fff;}
    table{width:100%;border-collapse:collapse;margin-top:12px;}
    thead{background:var(--primary);color:#fff;}
    th,td{padding:10px;border-bottom:1px solid var(--border);}
    .calendar-shell{height:70vh;min-height:420px;}
    .rbc-event{padding:2px 6px;border-radius:8px;background:var(--primary);color:#fff;font-size:13px;}
  `}</style>
);

/* ---------- Event Colors ---------- */
const eventStyleGetter = (event) => {
  let style = { borderRadius: "8px", color: "white", padding: "2px 6px" };
  if (event.raw.status === "attended") style.backgroundColor = "#16a34a";
  else if (event.raw.status === "missed") style.backgroundColor = "#dc2626";
  else style.backgroundColor = "#1e40af";
  return { style };
};
const EventComponent = ({ event }) => (
  <span style={{ fontSize: "13px" }}>{String(event.title)}</span>
);

/* ---------- Main ---------- */
export default function ServiceCalendar() {
  const { service } = useParams();
  const staffService = service?.toLowerCase() || "medical";
  const config =
    serviceConfig[staffService] || { days: [1, 2, 3, 4, 5], duration: 30 };

  const today = moment().format("YYYY-MM-DD");
  const [events, setEvents] = useState([]);
  const [dayMap, setDayMap] = useState({});
  const [selectedDate, setSelectedDate] = useState(today);
  const [appointments, setAppointments] = useState([]);
  const [view, setView] = useState("month");
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    time: "",
    date: today,
  });

  /* ---------- Load data ---------- */
  const loadAll = useCallback(
    async (month) => {
      // Load all appointments, then filter by service family on the client
      const rows = await getJSON("/appointments");
      const filtered = rows.filter((r) => sameServiceFamily(r.service_type, staffService));
      setEvents(filtered.map(normalizeRow).filter(Boolean));

      // Optional day map (kept if your backend uses it)
      const targetMonth = month || moment(selectedDate || today);
      const start = targetMonth.clone().startOf("month").subtract(1, "month").format("YYYY-MM-DD");
      const end = targetMonth.clone().endOf("month").add(1, "month").format("YYYY-MM-DD");

      const days = await getJSON("/appointments/day-map", {
        start,
        end,
        service_type: staffService, // backend may compute availability per primary service
      });

      const map = {};
      (days || []).forEach((d) => (map[d.date] = d));
      setDayMap(map);
    },
    [selectedDate, staffService, today]
  );

  const loadDayAppointments = async (date) => {
    const ds = moment(date).format("YYYY-MM-DD");
    const rows = await getJSON("/appointments", { date: ds }); // no service_type filter
    const sameFam = rows.filter((r) => sameServiceFamily(r.service_type, staffService));
    setAppointments(
      sameFam.map((r) => ({
        ...r,
        first_name: toProperCase(r.first_name),
        last_name: toProperCase(r.last_name),
        patient_name: toProperCase(r.patient_name),
        date: moment(r.date).format("YYYY-MM-DD"),
        time: toHHMMSS(r.time || "00:00:00"),
      }))
    );
  };

  useEffect(() => {
    loadAll();
    loadDayAppointments(selectedDate);
  }, [loadAll]); // eslint-disable-line

  /* ---------- CRUD ---------- */
  const handleAddAppointment = async () => {
    const dateISO = moment(form.date).format("YYYY-MM-DD");
    const timeSQL = toHHMMSS(form.time || "00:00:00");
    const day = moment(dateISO).isoWeekday();

    if (!config.days.includes(day)) {
      return alert("This service is not available on the selected date.");
    }
    if (moment(dateISO).isBefore(moment(), "day"))
      return alert("You cannot book past dates.");
    if (!form.first_name || !form.last_name || !dateISO || !timeSQL)
      return alert("First name, Last name, Date, and Time are required.");

    // 🔒 Prevent double-booking across the same service family (e.g., medical/general/buntis)
    const existingAll = await getJSON("/appointments", { date: dateISO });
    const taken = existingAll.some(
      (a) => sameServiceFamily(a.service_type, staffService) && toHHMMSS(a.time) === timeSQL
    );
    if (taken) {
      return alert("That time slot is already booked. Please choose another.");
    }

    await postJSON("/appointments", {
      first_name: toProperCase(form.first_name),
      last_name: toProperCase(form.last_name),
      date: dateISO,
      time: timeSQL,
      service_type: staffService,
    });

    setForm({ first_name: "", last_name: "", time: "", date: selectedDate });
    await loadAll();
    await loadDayAppointments(selectedDate);
  };

  const updateStatus = async (id, status) => {
    await putJSON(`/appointments/${id}`, { status });
    await loadAll();
    await loadDayAppointments(selectedDate);
  };

  const deleteAppt = async (id) => {
    if (window.confirm("Delete this appointment?")) {
      await delJSON(`/appointments/${id}`);
      await loadAll();
      await loadDayAppointments(selectedDate);
    }
  };

  /* ---------- Calendar ---------- */
  const dayPropGetter = (date) => {
    const ds = moment(date).format("YYYY-MM-DD");
    const info = dayMap[ds];
    const day = moment(date).isoWeekday();

    if (!config.days.includes(day)) {
      return { style: { background: "var(--red)", opacity: 0.6 } };
    }
    if (moment(date).isBefore(moment(), "day")) {
      return { style: { background: "var(--red)", opacity: 0.6 } };
    }
    if (!info) return { style: { background: "var(--green)" } };
    if (info.isClosed || info.is_closed) return { style: { background: "var(--red)" } };
    if (info.isFull || info.is_full) return { style: { background: "#fca5a5" } };
    return { style: { background: "var(--green)" } };
  };

  const handleSelectDate = async (date) => {
    const ds = moment(date).format("YYYY-MM-DD");
    const day = moment(date).isoWeekday();
    if (!config.days.includes(day)) return;

    setSelectedDate(ds);
    setView("day");

    // set table from already-fetched events (same family), then refresh from API
    const sameDay = events.filter((ev) => moment(ev.start).isSame(ds, "day")).map((ev) => ev.raw);
    setAppointments(
      sameDay.map((r) => ({ ...r, time: toHHMMSS(r.time), date: moment(r.date).format("YYYY-MM-DD") }))
    );

    await loadDayAppointments(ds);
    setForm((f) => ({ ...f, date: ds }));
  };

  /* ---------- Generate Time Slots ---------- */
  const generateSlots = () => {
    const slots = [];
    const startHour = 7;
    const endHour = 16;
    for (let h = startHour; h < endHour; h++) {
      slots.push(`${String(h).padStart(2, "0")}:00:00`);
      if (config.duration === 30) {
        slots.push(`${String(h).padStart(2, "0")}:30:00`);
      }
    }
    return slots;
  };

  return (
    <div className="page">
      <InjectStyles />
      <h2 style={{ color: "var(--primary)" }}>
        {staffService.charAt(0).toUpperCase() + staffService.slice(1)} Appointments
      </h2>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <span className="chip green">Available</span>
        <span className="chip red">Closed / Not Allowed / Past / Full</span>
      </div>

      <div className="card calendar-shell">
        <RBCalendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          date={moment(selectedDate).toDate()}
          view={view}
          views={["month", "week", "day"]}
          onView={setView}
          onNavigate={(d) => {
            const ds = moment(d).format("YYYY-MM-DD");
            setSelectedDate(ds);
            loadDayAppointments(ds);
            loadAll(moment(d));
          }}
          selectable
          onSelectSlot={(slot) => handleSelectDate(slot.start)}
          onSelectEvent={(e) => handleSelectDate(e.start)}
          dayPropGetter={dayPropGetter}
          eventPropGetter={eventStyleGetter}
          components={{ event: EventComponent }}
        />
      </div>

      {selectedDate && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>{moment(selectedDate).format("dddd, MMM D, YYYY")}</h3>
            <button className="btn primary" onClick={() => setView("month")}>
              ⬅ Back to Month View
            </button>
          </div>

          <div style={{ marginTop: "16px" }}>
            <h4>Add Appointment</h4>
            <input
              className="input"
              placeholder="First Name"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              style={{ marginRight: "6px" }}
            />
            <input
              className="input"
              placeholder="Last Name"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              style={{ marginRight: "6px" }}
            />
            <input
              type="date"
              className="input"
              min={today}
              value={moment(form.date).format("YYYY-MM-DD")}
              onChange={(e) => {
                const picked = moment(e.target.value).format("YYYY-MM-DD");
                const day = moment(picked).isoWeekday();
                if (!config.days.includes(day))
                  return alert("This service is not available on that date.");
                setForm({ ...form, date: picked });
              }}
              style={{ marginRight: "6px" }}
            />
            <select
              className="input"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              style={{ marginRight: "6px" }}
            >
              <option value="">Select Time</option>
              {generateSlots()
                // remove already-booked times for the same service family
                .filter((slot) => {
                  return !appointments.some(
                    (a) => sameServiceFamily(a.service_type, staffService) && toHHMMSS(a.time) === slot
                  );
                })
                .map((slot) => (
                  <option key={slot} value={slot}>
                    {moment(slot, "HH:mm:ss").format("h:mm A")}
                  </option>
                ))}
            </select>
            <button className="btn primary" onClick={handleAddAppointment}>
              ➕ Add
            </button>
          </div>

          <div style={{ marginTop: "20px" }}>
            <h4>Appointments for {moment(selectedDate).format("MMM D, YYYY")}</h4>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Patient</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments
                  .filter((a) => moment(a.date).isSame(moment(selectedDate), "day"))
                  .sort((a, b) => (toHHMMSS(a.time) || "").localeCompare(toHHMMSS(b.time) || ""))
                  .map((a) => (
                    <tr key={a.id}>
                      <td>{moment(toHHMMSS(a.time), "HH:mm:ss").format("h:mm A")}</td>
                      <td>
                        {a.patient_name
                          ? toProperCase(a.patient_name)
                          : a.first_name && a.last_name
                          ? `${toProperCase(a.first_name)} ${toProperCase(a.last_name)}`
                          : a.patient_id
                          ? `Patient #${a.patient_id}`
                          : "Unknown"}
                      </td>
                      <td>
                        <label>
                          <input
                            type="radio"
                            name={`status-${a.id}`}
                            checked={a.status === "attended"}
                            onChange={() => updateStatus(a.id, "attended")}
                          />{" "}
                          Attended
                        </label>
                        <label style={{ marginLeft: "8px" }}>
                          <input
                            type="radio"
                            name={`status-${a.id}`}
                            checked={a.status === "missed"}
                            onChange={() => updateStatus(a.id, "missed")}
                          />{" "}
                          Missed
                        </label>
                      </td>
                      <td>
                        <button className="btn danger" onClick={() => deleteAppt(a.id)}>
                          ❌ Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                {!appointments.filter((a) => moment(a.date).isSame(moment(selectedDate), "day")).length && (
                  <tr>
                    <td colSpan={4} style={{ color: "#666", textAlign: "center" }}>
                      No appointments
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


