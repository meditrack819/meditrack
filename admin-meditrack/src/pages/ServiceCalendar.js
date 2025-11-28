// src/pages/ServiceCalendar.js
import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { Calendar as RBCalendar, momentLocalizer, Views } from "react-big-calendar";
import { useParams } from "react-router-dom";
import moment from "moment";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "react-big-calendar/lib/css/react-big-calendar.css";

/* =========================================================
   ⚙️ API CONFIG
   ========================================================= */
const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const api = axios.create({ baseURL: API_BASE, timeout: 15000 });
const getJSON = async (path, params) => (await api.get(`/api${path}`, { params })).data;
const postJSON = async (path, body) => (await api.post(`/api${path}`, body)).data;
const putJSON = async (path, body) => (await api.put(`/api${path}`, body)).data;
const delJSON = async (path, body) => (await api.delete(`/api${path}`, { data: body })).data;

/* =========================================================
   🧩 HELPERS
   ========================================================= */
const eventPropGetter = (event) => {
  // base style for all events
  let style = {
    borderRadius: "6px",
    border: "none",
  };

  if (event.type === "blocked") {
    // 🔴 Blocked schedule (background layer)
    style = {
      ...style,
      backgroundColor: "#ef4444",
      color: "#fff",
      opacity: 0.85,
      zIndex: 1,
    };
  } else if (event.status === "cancelled") {
    // ⚪ Cancelled appointment
    style = {
      ...style,
      backgroundColor: "#f3f4f6",
      color: "#374151",
      textDecoration: "line-through",
      zIndex: 2,
    };
  } else {
    // 🔵 Normal appointment (on top)
    style = {
      ...style,
      backgroundColor: "#3b82f6",
      color: "#fff",
      zIndex: 3,
    };
  }

  return { style };
};


const localizer = momentLocalizer(moment);

const toProperCase = (str = "") =>
  str
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const toHHMMSS = (t) => {
  if (!t) return "00:00:00";
  const s = String(t).trim().split(".")[0];
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  const m = moment(s, ["HH:mm:ss", "HH:mm"], true);
  return m.isValid() ? m.format("HH:mm:ss") : "00:00:00";
};

const buildLocalDate = (dateISO, timeHHMMSS) => {
  const md = moment(dateISO, "YYYY-MM-DD", true);
  const [hh, mm, ss] = toHHMMSS(timeHHMMSS).split(":").map(Number);
  return new Date(md.year(), md.month(), md.date(), hh, mm, ss);
};

const sameServiceFamily = (a = "", b = "") => {
  const famA = a.toLowerCase().split("-")[0];
  const famB = b.toLowerCase().split("-")[0];
  return famA === famB;
};

/* =========================================================
   🏥 SERVICE CONFIG
   ========================================================= */
const serviceConfig = {
  "medical-general": { days: [1, 2, 3, 4, 5], duration: 30 },
  "medical-buntis": { days: [4], duration: 30 },
  "dental-bunot": { days: [1, 5], duration: 60 },
  "dental-pasta": { days: [2, 3], duration: 60 },
  "dental-buntis": { days: [4], duration: 60 },
  pt: { days: [1, 3, 5], duration: 60 },
  tb: { days: [1, 2, 3, 4, 5], duration: 30 },
  "vax-children": { days: [3], duration: 30 },
  "vax-adult": { days: [1, 2, 3, 4, 5, 6, 7], duration: 30 },
};

const MAIN_SERVICES = [
  { key: "medical", label: "Medical" },
  { key: "dental", label: "Dental" },
  { key: "pt", label: "Physical Therapy" },
  { key: "tb", label: "TB DOTS" },
  { key: "vax", label: "Vaccinations" },
];

const SUB_SERVICES = {
  medical: [
    { key: "Medical (General)", label: "General Consultation (Mon–Fri)" },
    { key: "Medical (Buntis)", label: "Pregnant (Thursday)" },
  ],
  dental: [
    { key: "Dental (Bunot)", label: "Dental – Bunot (Mon/Fri)" },
    { key: "Dental (Pasta)", label: "Dental – Pasta / Cleaning (Tue/Wed)" },
    { key: "Dental (buntis)", label: "Dental – Pregnant (Thursday)" },
  ],
  vax: [
    { key: "BCG Vaccine", label: "BCG Vaccine" },
    { key: "Hepatitis B Vaccine", label: "Hepatitis B Vaccine" },
    { key: "Polio Vaccine", label: "Polio Vaccine" },
    { key: "DPT Vaccine", label: "DPT Vaccine" },
    { key: "Pneumococcal Vaccine", label: "Pneumococcal Vaccine" },
    { key: "Measles Vaccine", label: "Measles Vaccine" },
    { key: "MMR Vaccine", label: "MMR Vaccine" },
  ],
};

const getServiceLabel = (serviceType) => {
  // Check in SUB_SERVICES first
  for (const mainKey in SUB_SERVICES) {
    const subServiceArray = SUB_SERVICES[mainKey];
    if (Array.isArray(subServiceArray)) {
      const found = subServiceArray.find((s) => s.key === serviceType);
      if (found) return found.label;
    }
  }
  // If not found in SUB_SERVICES, check in MAIN_SERVICES
  const main = MAIN_SERVICES.find((s) => s.key === serviceType);
  return main ? main.label : serviceType;
};

const normalizeRow = (a) => {
  const dateISO = moment(a.date).format("YYYY-MM-DD");

  // 🧠 Handle missing or invalid time (especially for vaccines)
  const timeSQL = a.time ? toHHMMSS(a.time) : "09:00:00";

  const start = buildLocalDate(dateISO, timeSQL);

  let duration = 30;
  if (a.service_type && a.service_type.startsWith("medical")) duration = 15;
  if (a.service_type && a.service_type.startsWith("dental")) duration = 60;
  if (a.service_type === "pt") duration = 60;
  if (a.service_type === "tb") duration = 30;
  if (a.service_type?.startsWith("vax")) duration = 30;

  const end = new Date(start.getTime() + duration * 60000);

  const patient =
    a.patient_name ||
    `${toProperCase(a.first_name || "")} ${toProperCase(a.last_name || "")}`.trim() ||
    (a.patient_id ? `Patient #${a.patient_id}` : "Unknown");

  const serviceLabel = getServiceLabel(a.service_type);

  return {
    id: a.id,
    title: `${moment(start).format("h:mm A")} — ${patient} (${serviceLabel})`,
    start,
    end,
    raw: { ...a, date: dateISO, time: timeSQL },
  };
};

/* =========================================================
   🩺 DOCTOR-BASED DAY CONFIG (matches DoctorCalendar)
   ========================================================= */
const doctorServiceDays = {
  "Dr. Maria Santos": [1, 2, 3, 4, 5], // General Medicine
  "Dr. Daniel Cruz": [4], // Medical (Pregnant)
  "Dr. Anna Reyes": [1, 5], // Dental Surgery
  "Dr. Joseph Lim": [2, 3], // Dental Cleaning
  "Dr. Karen Dela Cruz": [1, 3, 5], // PT
  "Dr. Michael Tan": [1, 2, 3, 4, 5], // TB DOTS
  "Nurse Patricia Gomez": [3], // Vax Children
  "Nurse Carlo Mendoza": [1, 2, 3, 4, 5], // Vax Adult
};

/* =========================================================
   🎨 STYLES (kept design, made fully responsive)
   ========================================================= */
const InjectStyles = () => (
  <style>{`
    :root {
      --primary:#1e40af; --danger:#dc2626; --success:#16a34a;
      --border:#e5e7eb; --bg:#f9fafb; --card:#fff; --shadow:0 4px 12px rgba(0,0,0,.08);
    }
    * { box-sizing: border-box; }
    body { background:var(--bg); font-family:"Inter",sans-serif; margin:0; padding:0; }
    .page { max-width:1200px; margin:0 auto; padding:1rem; position:relative; }

    .card {
      background:var(--card); border:1px solid var(--border);
      border-radius:16px; padding:18px; margin-top:16px;
      box-shadow:var(--shadow);
    }

    h2,h3,h4 { color:var(--primary); margin:0 0 .5rem 0; }

    .btn { border:none; border-radius:10px; padding:10px 16px; font-weight:600; cursor:pointer; transition:.25s; white-space:nowrap; }
    .btn.primary { background:var(--primary); color:#fff; }
    .btn.primary:hover { opacity:.95; transform:translateY(-1px); }
    .btn.success { background:var(--success); color:#fff; }
    .btn.danger { background:var(--danger); color:#fff; }

    .input { padding:10px; border:1px solid var(--border); border-radius:10px; flex:1; min-width:150px; font-size:15px; }

    table { width:100%; border-collapse:collapse; margin-top:10px; background:#fff; border-radius:12px; overflow:hidden; box-shadow:var(--shadow); }
    th,td { padding:12px; border-bottom:1px solid var(--border); font-size:15px; text-align:left; }
    th { background:var(--primary); color:#fff; }
    tr:hover td { background:#f3f4f6; }
    .patient-name { font-weight:700; color:#111827; }

    .toast {
      position:fixed; top:20px; right:20px; z-index:9999;
      background:linear-gradient(90deg,#1e40af,#3b82f6);
      color:#fff; padding:12px 20px; border-radius:12px; font-weight:600;
      box-shadow:0 4px 12px rgba(0,0,0,.15);
      animation:toastIn .3s ease, toastOut .3s ease 3.5s forwards;
    }

    .legend { display:flex; gap:10px; margin-top:10px; font-size:14px; }
    .legend span { display:flex; align-items:center; gap:5px; }

    .log-toggle {
      position:fixed; bottom:24px; right:24px; background:var(--primary); color:#fff;
      border:none; border-radius:50%; width:56px; height:56px;
      display:flex; align-items:center; justify-content:center; font-size:22px;
      box-shadow:0 4px 10px rgba(0,0,0,.25); z-index:1000; cursor:pointer; transition:.3s;
    }
    .log-toggle:hover { transform:scale(1.05); }

    .log-sheet { transition: all 0.4s ease; overflow: hidden; transform-origin: top; }
    .log-sheet.hidden { max-height: 0; opacity: 0; transform: scaleY(0); padding: 0; margin: 0; }

    .modal-overlay {
      position:fixed; inset:0; backdrop-filter:blur(6px);
      background:rgba(0,0,0,0.4);
      display:flex; justify-content:center; align-items:center;
      z-index:10000; animation:fadeIn .25s ease;
    }
    .modal-card {
      background:var(--card); border-radius:16px; width:95%; max-width:420px;
      padding:24px; box-shadow:0 6px 25px rgba(0,0,0,.25); animation:slideUp .3s ease;
    }
    .modal-card h3 { color:var(--primary); margin-bottom:8px; }
    .modal-card p { color:#374151; font-size:15px; margin-bottom:6px; }
    .modal-card textarea {
      width:100%; height:90px; border-radius:10px; border:1px solid var(--border);
      padding:10px; resize:none; font-size:15px;
    }
    .modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:14px; }

    .controls {
      display:flex; flex-wrap:wrap; gap:10px; align-items:center;
    }

    .calendar-wrap { width:100%; height:72vh; min-height:520px; }
    .calendar-wrap .rbc-calendar { height:100%; }

    @media (max-width: 1200px) {
      .page { padding:0.9rem; }
    }
    @media (max-width: 1024px) {
      .page { padding:0.8rem; }
      table th, table td { font-size:14px; padding:10px; }
      .input { font-size:14px; padding:8px; }
      .calendar-wrap { height:68vh; min-height:480px; }
    }
    @media (max-width: 768px) {
      .page { padding:0.6rem; }
      h2 { font-size:1.25rem; }
      h3 { font-size:1.1rem; }
      .card { padding:14px; }
      .btn { font-size:14px; padding:9px 12px; }

      .input { width:100%; min-width:unset; font-size:14px; }

      .controls { flex-direction:column; align-items:stretch; }
      .calendar-wrap { height:64vh; min-height:440px; }

      table { display:block; overflow-x:auto; white-space:nowrap; }
      th,td { padding:10px 8px; }
    }
    @media (max-width: 480px) {
      h2 { font-size:1rem; }
      .btn { width:100%; }
      .log-toggle { width:48px; height:48px; font-size:18px; }
      .calendar-wrap { height:60vh; min-height:400px; }
    }

    @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
    @keyframes slideUp { from { transform:translateY(10px); opacity:0 } to { transform:translateY(0); opacity:1 } }
    @keyframes toastIn { from { transform:translateY(-8px); opacity:0 } to { transform:translateY(0); opacity:1 } }
    @keyframes toastOut { to { transform:translateY(-8px); opacity:0 } }

    .react-datepicker__day--disabled.greyed-day {
      color: #9ca3af !important;
      background-color: #f3f4f6 !important;
      cursor: not-allowed !important;
      opacity: 0.6 !important;
    }
  `}</style>
);

/* =========================================================
   📅 COMPONENT
   ========================================================= */
export default function ServiceCalendar() {
  const { service } = useParams();
  const staffService = service?.toLowerCase() || "medical-general";
  const adminName = localStorage.getItem("admin_name") || "Administrator";
  const config = serviceConfig[staffService] || { days: [1, 2, 3, 4, 5], duration: 30 };
  const today = moment().format("YYYY-MM-DD");

  const [events, setEvents] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [blockedTimes, setBlockedTimes] = useState([]);
  const [calendarAppointments, setCalendarAppointments] = useState([]); // ✅ calendar-only
  const [selectedDate, setSelectedDate] = useState(today);
  const [allAvailabilities, setAllAvailabilities] = useState([]);

  const [form, setForm] = useState({ first_name: "", last_name: "", date: today, time: "" });
  const [toast, setToast] = useState(null);
  const [deleteAppt, setDeleteAppt] = useState(null);
  const [editFollowUp, setEditFollowUp] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [view, setView] = useState(Views.MONTH);
  const [dayMap, setDayMap] = useState({});
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [logFilters, setLogFilters] = useState({ start: "", end: "", status: "all" });

  // 🩺 Doctor & Vaccine states
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState("");
  const [customAllowedDays, setCustomAllowedDays] = useState(config.days);

  const [cache, setCache] = useState({});

  // 💉 Auto-dose logic
  const fetchDoseNumber = useCallback(
    async (first, last, vaccine) => {
      try {
        if (!first || !last || !vaccine) return 1;
        const res = await getJSON("/appointments", {
          first_name: first.trim(),
          last_name: last.trim(),
          service_type: staffService,
        });

        const pastDoses = res.filter(
          (r) =>
            r.vaccine_name?.toLowerCase() === vaccine.toLowerCase() &&
            r.status !== "cancelled"
        );
        return pastDoses.length + 1;
      } catch (err) {
        console.error("Dose fetch error:", err);
        return 1;
      }
    },
    [staffService]
  );

  const showToast = (msg, override = true) => {
    if (!override && toast) return;
    setToast(msg);
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => setToast(null), 3500);
  };

  /* ✅ SINGLE SOURCE OF TRUTH FOR CALENDAR EVENTS */
  useEffect(() => {
    const apptEvents = calendarAppointments.map(normalizeRow);
    setEvents([...apptEvents, ...blockedTimes]);
  }, [calendarAppointments, blockedTimes]);

const loadAll = useCallback(async () => {
  try {
    const rows = await getJSON("/appointments");

    const filtered = rows.filter((r) => {
      if (!r.service_type) return false;
      if (r.status === "cancelled") return false;          // ⛔ hide cancelled on calendar

      return (
        sameServiceFamily(r.service_type, staffService) ||
        r.service_type.toLowerCase() === staffService.toLowerCase()
      );
    });

    setCalendarAppointments(filtered);

    const map = {};
    filtered.forEach((r) => {
      const d = moment(r.date).format("YYYY-MM-DD");
      map[d] = (map[d] || 0) + 1;
    });
    setDayMap(map);
  } catch (err) {
    console.error("Appointments GET error:", err);
  }
}, [staffService]);


const loadAllForDoctor = useCallback(
  async (doctorId) => {
    try {
      const rows = await getJSON("/appointments");

      const filtered = rows.filter((r) => {
        if (!r.service_type) return false;
        if (r.status === "cancelled") return false;        // ⛔ hide cancelled on calendar

        const matchesService =
          sameServiceFamily(r.service_type, staffService) ||
          r.service_type.toLowerCase() === staffService.toLowerCase();

        const matchesDoctor = String(r.doctor_id) === String(doctorId);
        return matchesService && matchesDoctor;
      });

      setCalendarAppointments(filtered);

      const map = {};
      filtered.forEach((r) => {
        const d = moment(r.date).format("YYYY-MM-DD");
        map[d] = (map[d] || 0) + 1;
      });
      setDayMap(map);
    } catch (err) {
      console.error("Appointments GET error (doctor view):", err);
    }
  },
  [staffService]
);


  const loadDayAppointments = useCallback(
    async (date, doctorId = selectedDoctor) => {
      try {
        const apptRes = await getJSON("/appointments", { date });

        const dailyAppointments = apptRes.filter((r) => {
          const matchesService = sameServiceFamily(r.service_type, staffService);
          const notCancelled = r.status !== "cancelled";

          const matchesDoctor = !doctorId
            ? true
            : String(r.doctor_id) === String(doctorId);

          return matchesService && notCancelled && matchesDoctor;
        });

        let blocks = [];
        if (doctorId) {
          const cached = allAvailabilities.filter(
            (b) => String(b.doctor_id) === String(doctorId)
          );

          if (cached.length > 0) {
            blocks = cached.map((b) => ({
              ...b,
              date: moment(b.date).format("YYYY-MM-DD"),
              start: moment(`${b.date} ${b.start_time}`, "YYYY-MM-DD HH:mm").toDate(),
              end: moment(`${b.date} ${b.end_time}`, "YYYY-MM-DD HH:mm").toDate(),
              title: `🚫 ${b.reason || "Doctor unavailable"}`,
              type: "blocked",
            }));
          } else {
            const availRes = await getJSON(`/availability/service/${staffService}`, {
              doctor_id: doctorId,
            });
            blocks = (availRes?.blockedTimes || []).map((b) => ({
              ...b,
              date: moment(b.date).format("YYYY-MM-DD"),
              start: moment(`${b.date} ${b.start_time}`, "YYYY-MM-DD HH:mm").toDate(),
              end: moment(`${b.date} ${b.end_time}`, "YYYY-MM-DD HH:mm").toDate(),
              title: `🚫 ${b.reason || "Doctor unavailable"}`,
              type: "blocked",
            }));
          }
        }

        setAppointments(dailyAppointments);
        setBlockedTimes(blocks); // events recomputed by effect
      } catch (err) {
        console.error("Appointments GET error:", err);
      }
    },
    [staffService, allAvailabilities, selectedDoctor]
  );

  const loadDoctorAppointments = useCallback(
    async (doctorId) => {
      try {
        const apptRes = await getJSON("/appointments");

        const doctorAppointments = apptRes.filter((r) => {
          const matchesService = sameServiceFamily(r.service_type, staffService);
          const matchesDoctor = String(r.doctor_id) === String(doctorId);
          const notCancelled = r.status !== "cancelled";
          return matchesService && matchesDoctor && notCancelled;
        });

        const availRes = await getJSON(`/availability/service/${staffService}`, {
          doctor_id: doctorId,
        });

        const blocks = (availRes?.blockedTimes || []).map((b) => ({
          ...b,
          date: moment(b.date).format("YYYY-MM-DD"),
          start: moment(`${b.date} ${b.start_time}`, "YYYY-MM-DD HH:mm").toDate(),
          end: moment(`${b.date} ${b.end_time}`, "YYYY-MM-DD HH:mm").toDate(),
          title: `🚫 ${b.reason || "Doctor unavailable"}`,
          type: "blocked",
        }));

        setAppointments(doctorAppointments);
        setBlockedTimes(blocks);
        setCalendarAppointments(doctorAppointments); // calendar events
      } catch (err) {
        console.error("Doctor-wide appointments fetch error:", err);
      }
    },
    [staffService]
  );

  useEffect(() => {
    const loadDoctors = async () => {
      try {
        const res = await getJSON("/doctors", { service_type: staffService });
        setDoctors(res || []);
      } catch (err) {
        console.error("Failed to load doctors:", err);
      }
    };
    loadDoctors();
  }, [staffService]);

  useEffect(() => {
    const preloadAvailability = async () => {
      try {
        const res = await getJSON(`/availability/service/${staffService}`);
        setAllAvailabilities(res.blockedTimes || []);
      } catch (err) {
        console.warn("⚠️ Failed to preload availability:", err);
      }
    };
    preloadAvailability();
  }, [staffService]);

  const handleAddAppointment = async () => {
    try {
      const dateISO = moment(form.date).format("YYYY-MM-DD");
      const timeSQL = toHHMMSS(form.time);
      const day = moment(dateISO).isoWeekday();

      if (!config.days.includes(day)) return showToast("❌ Service unavailable on this day.");
      if (!form.first_name || !form.last_name || !timeSQL)
        return showToast("⚠️ All fields required.");

      if (staffService.startsWith("vax")) {
        if (!selectedDoctor) {
          return showToast("⚠️ Please select a vaccinator (doctor/nurse) first.");
        }
        if (!form.vaccine_key || !form.vaccine_name) {
          return showToast("⚠️ Please select a vaccine before saving.");
        }
      }

      if (moment(dateISO).isSame(moment(), "day")) {
        const now = moment();
        const selected = moment(timeSQL, "HH:mm:ss");
        if (selected.isBefore(now)) {
          return showToast("⚠️ Cannot book for a time that has already passed today.");
        }
        if (now.hour() >= 17) {
          return showToast("⚠️ Clinic hours have ended for today.");
        }
      }

      const hour = Number(moment(timeSQL, "HH:mm:ss").format("H"));
      if (hour === 12) return showToast("⚠️ Clinic closed for lunch (12–1 PM).");

      if (staffService.startsWith("medical")) {
        const sameHour = appointments.filter(
          (a) =>
            a.service_type.startsWith("medical") &&
            moment(a.time, "HH:mm:ss").hour() === hour
        );
        if (sameHour.length >= 4)
          return showToast("⚠️ This hour is already full (4 patients max).");
      }

      let patient_id = null;
      try {
        const match = await getJSON("/patients/search", {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
        });
        if (match && match.id) patient_id = match.id;
      } catch (err) {
        console.warn("⚠️ Patient lookup failed:", err.message);
      }

      await postJSON("/appointments", {
        patient_id,
        first_name: toProperCase(form.first_name),
        last_name: toProperCase(form.last_name),
        date: dateISO,
        time: timeSQL,
        service_type: staffService,
        vaccine_name: form.vaccine_name || null,
        dose_number: form.dose_number || null,
        doctor_id: selectedDoctor || null,
      });

      showToast("✅ Appointment added successfully.");
      setForm({ first_name: "", last_name: "", date: today, time: "" });
      setCache({});
      await loadAll();
      await loadDayAppointments(dateISO);
    } catch (err) {
      console.error(err);
      showToast("❌ Failed to add appointment.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteReason.trim()) return showToast("⚠️ Please provide a reason.");

    try {
      setAppointments((prevAppointments) =>
        prevAppointments.filter((appt) => appt.id !== deleteAppt.id)
      );

      await delJSON(`/appointments/${deleteAppt.id}`, {
        reason: deleteReason,
        cancelled_by: adminName,
      });

      showToast("🗑️ Appointment cancelled successfully.");
      setDeleteAppt(null);
      setDeleteReason("");
      await loadAll();
      await loadDayAppointments(selectedDate);
    } catch (err) {
      console.error(err);
      showToast("❌ Failed to cancel appointment.");
    }
  };

  const updateStatus = async (id, status, apptDate) => {
    if (moment(apptDate).format("YYYY-MM-DD") !== today)
      return showToast("⚠️ Update only same-day status.");

    const appointment = appointments.find((appt) => appt.id === id);
    if (appointment && appointment.status === "cancelled") {
      return showToast("⚠️ This appointment has been cancelled and cannot be updated.");
    }

    await putJSON(`/appointments/${id}`, { status });
    await loadAll();
    await loadDayAppointments(selectedDate);
    showToast(`✅ Status updated to ${status}.`);
  };

  const loadLogs = async () => {
    if (!logFilters.start || !logFilters.end)
      return showToast("⚠️ Select both start and end dates.");
    const rows = await getJSON("/appointments");
    let filtered = rows.filter(
      (r) =>
        sameServiceFamily(r.service_type, staffService) &&
        moment(r.date).isBetween(logFilters.start, logFilters.end, null, "[]")
    );
    if (logFilters.status !== "all")
      filtered = filtered.filter((r) => r.status === logFilters.status);
    setLogs(filtered);
    showToast("📋 Logs loaded successfully.");
  };

  const downloadCSV = () => {
    if (!logFilters.start || !logFilters.end)
      return showToast("⚠️ Select date range first.");
    if (logs.length === 0) return showToast("⚠️ No data to export.");
    const header = ["Date", "Time", "Patient", "Status", "Service"];
    const rows = logs.map((r) => [
      r.date,
      moment(r.time, "HH:mm:ss").format("h:mm A"),
      `${toProperCase(r.first_name)} ${toProperCase(r.last_name)}`,
      toProperCase(r.status || "Pending"),
      toProperCase(r.service_type),
    ]);
    const csv = [header, ...rows].map((e) => e.join(",")).join("\n");
    const filename = `${staffService}_logsheet_${logFilters.start}_to_${logFilters.end}.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  const dayPropGetter = (date) => {
    const ds = moment(date).format("YYYY-MM-DD");
    const day = moment(date).isoWeekday();

    if (moment(ds).isBefore(moment(), "day") && day !== 6 && day !== 7) {
      return {
        style: {
          background: "#f3f4f6",
          color: "#6b7280",
          cursor: "not-allowed",
          opacity: 0.7,
        },
      };
    }

    if (!customAllowedDays.includes(day))
      return { style: { background: "#fee2e2" } };

    if (ds === selectedDate)
      return { style: { background: "#bfdbfe" } };

    const booked = dayMap[ds] || 0;
    if (booked >= 10)
      return { style: { background: "#fde68a" } };

    return { style: { background: "#dcfce7" } };
  };

  useEffect(() => {
    const init = async () => {
      try {
        if (!selectedDoctor) {
          await loadAll();
        } else {
          await loadAllForDoctor(selectedDoctor);
        }

        const avail = await getJSON(`/availability/service/${staffService}`, {
          doctor_id: selectedDoctor || undefined,
        });

        const fresh = (avail.blockedTimes || [])
          .filter((b) => {
            if (selectedDoctor) return String(b.doctor_id) === String(selectedDoctor);
            return true;
          })
          .map((b) => ({
            ...b,
            date: moment(b.date).format("YYYY-MM-DD"),
            start: moment(`${b.date} ${b.start_time}`, "YYYY-MM-DD HH:mm").toDate(),
            end: moment(`${b.date} ${b.end_time}`, "YYYY-MM-DD HH:mm").toDate(),
            title: `🚫 ${b.reason || "Doctor unavailable"}`,
            type: "blocked",
          }));

        setBlockedTimes(fresh);
      } catch (err) {
        console.error("⚠️ Doctor availability fetch failed:", err);
      }
    };

    init();
  }, [selectedDoctor, staffService, loadAll, loadAllForDoctor]);

  // 🔁 Reload for Day view; include `view` so it runs when switching to Day
  // 🔁 Reload only per-day data when in Day view
useEffect(() => {
  if (view !== Views.DAY) return;

  const delay = setTimeout(() => {
    // For Day view we ONLY use loadDayAppointments
    if (selectedDate) {
      // doctor can be null → show all doctors for that service
      loadDayAppointments(selectedDate, selectedDoctor || null);
    }
  }, 120); // tiny delay just to smooth transitions

  return () => clearTimeout(delay);
}, [view, selectedDoctor, selectedDate, loadDayAppointments]);


  const reloadBlockedTimes = useCallback(async () => {
    try {
      const avail = await getJSON(`/availability/service/${staffService}`, {
        doctor_id: selectedDoctor || undefined,
      });

      const fresh = (avail.blockedTimes || [])
        .filter((b) => {
          if (selectedDoctor) return String(b.doctor_id) === String(selectedDoctor);
          return true;
        })
        .map((b) => ({
          ...b,
          date: moment(b.date).format("YYYY-MM-DD"),
          start: moment(`${b.date} ${b.start_time}`, "YYYY-MM-DD HH:mm").toDate(),
          end: moment(`${b.date} ${b.end_time}`, "YYYY-MM-DD HH:mm").toDate(),
          title: `🚫 ${b.reason || "Doctor unavailable"}`,
          type: "blocked",
        }));

      setBlockedTimes(fresh);
    } catch (err) {
      console.error("⚠️ Failed to reload blocked times:", err);
    }
  }, [staffService, selectedDoctor]);

  return (
    <>
      <div className="page">
        <InjectStyles />
        <h2>{toProperCase(staffService)} Appointments</h2>

        {/* Add Appointment FIRST */}
        <div className="card">
          <h3>{moment(form.date || today).format("dddd, MMM D, YYYY")}</h3>

          <div className="controls">
            <input
              className="input"
              placeholder="First Name"
              value={form.first_name}
              onChange={(e) => {
                const formatted = e.target.value
                  .replace(/[^a-zA-Z\s]/g, "")
                  .replace(/\b\w/g, (c) => c.toUpperCase());
                setForm({ ...form, first_name: formatted });
              }}
            />
            <input
              className="input"
              placeholder="Last Name"
              value={form.last_name}
              onChange={(e) => {
                const formatted = e.target.value
                  .replace(/[^a-zA-Z\s]/g, "")
                  .replace(/\b\w/g, (c) => c.toUpperCase());
                setForm({ ...form, last_name: formatted });
              }}
            />

            {/* Doctor Dropdown */}
            {doctors.length > 0 && (
              <select
                className="input"
                value={selectedDoctor}
                onChange={async (e) => {
                  const value = e.target.value;
                  setSelectedDoctor(value);
                  setForm((prev) => ({
                    ...prev,
                    time: "",
                    date: today,
                    vaccine_name: null,
                    vaccine_key: "",
                    dose_number: null,
                  }));
                  setSelectedDate(today);
                  loadDayAppointments(today, value);

                  if (!value) {
                    setBlockedTimes([]);
                    setAppointments([]);
                    setCustomAllowedDays(config.days);
                    return;
                  }

                  const doc = doctors.find((d) => String(d.id) === String(value));

                  let allowedDays = config.days;
                  if (doc && doctorServiceDays[doc.name]) {
                    allowedDays = doctorServiceDays[doc.name];
                    setCustomAllowedDays(allowedDays);
                    const daysStr = allowedDays
                      .map((d) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d - 1])
                      .join(", ");
                    showToast(`📅 ${doc.name} is only available on: ${daysStr}`, false);
                  } else {
                    setCustomAllowedDays(config.days);
                  }

                  const cached = allAvailabilities.filter(
                    (b) => String(b.doctor_id) === String(value)
                  );
                  const cachedBlocks = cached.map((b) => ({
                    ...b,
                    date: moment(b.date).format("YYYY-MM-DD"),
                    start: moment(`${b.date} ${b.start_time}`, "YYYY-MM-DD HH:mm").toDate(),
                    end: moment(`${b.date} ${b.end_time}`, "YYYY-MM-DD HH:mm").toDate(),
                    title: `🚫 ${b.reason || "Doctor unavailable"}`,
                    type: "blocked",
                  }));

                  setBlockedTimes(cachedBlocks);

                  getJSON(`/availability/service/${staffService}`, { doctor_id: value })
                    .then((avail) => {
                      const fresh = (avail.blockedTimes || []).map((b) => ({
                        ...b,
                        date: moment(b.date).format("YYYY-MM-DD"),
                        start: moment(`${b.date} ${b.start_time}`, "YYYY-MM-DD HH:mm").toDate(),
                        end: moment(`${b.date} ${b.end_time}`, "YYYY-MM-DD HH:mm").toDate(),
                        title: `🚫 ${b.reason || "Doctor unavailable"}`,
                        type: "blocked",
                      }));
                      setBlockedTimes(fresh);
                    })
                    .catch((err) => console.error("Availability refresh failed:", err));
                }}
              >
                <option value="">Select Doctor</option>
                {doctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name} {doc.specialization ? `(${doc.specialization})` : ""}
                  </option>
                ))}
              </select>
            )}

            {/* Date Picker */}
            <DatePicker
              selected={form.date ? moment(form.date, "YYYY-MM-DD").toDate() : null}
              onChange={async (date) => {
                if (!selectedDoctor) return showToast("⚠️ Please select a doctor first.");

                const weekday = moment(date).isoWeekday();
                const allowed = customAllowedDays || config.days;

                if (!allowed.includes(weekday)) {
                  showToast("⚠️ Doctor not available on this day.");
                  return;
                }

                const newDate = moment(date).format("YYYY-MM-DD");
                setForm({ ...form, date: newDate, time: "" });
                await loadDayAppointments(newDate);
              }}
              placeholderText="Select Date"
              className="input"
              dateFormat="MM/dd/yyyy"
              minDate={new Date()}
              disabled={!selectedDoctor}
              filterDate={(date) => {
                const weekday = moment(date).isoWeekday();
                const allowed = customAllowedDays || config.days;
                return allowed.includes(weekday);
              }}
              dayClassName={(date) => {
                const weekday = moment(date).isoWeekday();
                const allowed = customAllowedDays || config.days;
                if (!allowed.includes(weekday))
                  return "react-datepicker__day--disabled greyed-day";
                return "";
              }}
            />

            {/* Time Dropdown */}
            <select
              className="input"
              value={form.time}
              disabled={!selectedDoctor || !form.date}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
            >
              <option value="">Select Time</option>
              {(() => {
                const slots = [];
                const bookedTimes = appointments.map((a) =>
                  moment(a.time, "HH:mm:ss").format("HH:mm:ss")
                );

                for (let hour = 7; hour <= 16; hour++) {
                  if (hour === 12) continue;
                  const increment = staffService.startsWith("medical") ? 15 : 30;

                  for (let m = 0; m < 60; m += increment) {
                    const t = `${String(hour).padStart(2, "0")}:${String(m)
                      .padStart(2, "0")}:00`;

                    const isBooked = bookedTimes.includes(t);

                    const isBlocked = blockedTimes.some((b) => {
                      if (moment(b.date).format("YYYY-MM-DD") !== form.date) return false;
                      const blockStart = moment(
                        `${b.date} ${b.start_time}`,
                        "YYYY-MM-DD HH:mm"
                      );
                      const blockEnd = moment(
                        `${b.date} ${b.end_time}`,
                        "YYYY-MM-DD HH:mm"
                      );
                      const slotStart = moment(
                        `${form.date} ${t}`,
                        "YYYY-MM-DD HH:mm:ss"
                      );
                      const slotEnd = slotStart.clone().add(increment, "minutes");
                      return slotStart.isBefore(blockEnd) && slotEnd.isAfter(blockStart);
                    });

                    const todayStr = moment().format("YYYY-MM-DD");
                    if (form.date === todayStr) {
                      const now = moment();
                      const slotMoment = moment(
                        `${todayStr} ${t}`,
                        "YYYY-MM-DD HH:mm:ss"
                      );
                      if (slotMoment.isBefore(now)) continue;
                    }

                    const hourInt = parseInt(hour);
                    if (hourInt >= 17) continue;

                    if (!isBooked && !isBlocked) slots.push(t);
                  }
                }

                return slots.map((t) => (
                  <option key={t} value={t}>
                    {moment(t, "HH:mm:ss").format("h:mm A")}
                  </option>
                ));
              })()}
            </select>

        {/* Vaccine Section */}
{staffService.startsWith("vax") && (
  <>
    {/* Message if doctor is not yet selected */}
    {!selectedDoctor && (
      <div style={{ fontSize: 13, color: "#6b7280", flexBasis: "100%" }}>
      </div>
    )}

    {/* Show vaccine dropdown only AFTER doctor is chosen */}
    {selectedDoctor && (
      <>
        <select
          className="input"
          value={form.vaccine_key || ""}
          onChange={async (e) => {
            if (!selectedDoctor) {
              showToast("⚠️ Please select a doctor first.");
              return;
            }

            const vaccineKey = e.target.value;
            if (!vaccineKey) {
              setForm({
                ...form,
                vaccine_name: "",
                vaccine_key: "",
                dose_number: null,
              });
              return;
            }

            const vaccineLabel = vaccineKey
              .replace(/-/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase());

            const nextDose = await fetchDoseNumber(
              form.first_name,
              form.last_name,
              vaccineLabel
            );

            setForm({
              ...form,
              vaccine_name: vaccineLabel,
              vaccine_key: vaccineKey,
              dose_number: nextDose,
            });
          }}
        >
          <option value="">Select Vaccine</option>
          {(() => {
            const childVaccines = [
              { key: "bcg", label: "BCG Vaccine" },
              { key: "hep-b", label: "Hepatitis B Vaccine" },
              { key: "polio", label: "Polio Vaccine" },
              { key: "dpt", label: "DPT Vaccine" },
              { key: "pneumococcal", label: "Pneumococcal Vaccine" },
              { key: "measles", label: "Measles Vaccine" },
              { key: "mmr", label: "MMR Vaccine" },
            ];

            const adultVaccines = [
              { key: "influenza", label: "Influenza Vaccine" },
              { key: "covid19", label: "COVID-19 Vaccine" },
              { key: "tetanus", label: "Tetanus Booster (Td/Tdap)" },
              { key: "hep-a", label: "Hepatitis A Vaccine" },
              { key: "hep-b-booster", label: "Hepatitis B Booster" },
              { key: "hpv", label: "HPV Vaccine" },
              {
                key: "pneumococcal-adult",
                label: "Pneumococcal Vaccine (Adults)",
              },
            ];

            const selectedDoc = doctors.find(
              (d) => String(d.id) === String(selectedDoctor)
            );

            const getVaccinesForDoctor = (doc) => {
              const baseChild = childVaccines;
              const baseAdult = adultVaccines;

              // 1️⃣ If this calendar is explicitly for children / adult
              if (staffService === "vax-children") return baseChild;
              if (staffService === "vax-adult") return baseAdult;

              // 2️⃣ If doctor has explicit vaccines from DB, use that
              if (doc && Array.isArray(doc.vaccines) && doc.vaccines.length) {
                return doc.vaccines;
              }

              // 3️⃣ Heuristic: pediatric / child vaccinators → child list
              if (doc) {
                const name = (doc.name || "").toLowerCase();
                const spec = (doc.specialization || "").toLowerCase();

                if (
                  name.includes("pedi") ||
                  spec.includes("pedi") ||
                  spec.includes("child")
                ) {
                  return baseChild;
                }

                if (spec.includes("adult") || spec.includes("internal medicine")) {
                  return baseAdult;
                }
              }

              // 4️⃣ Generic "vax" service: show BOTH (children first)
              if (staffService.startsWith("vax")) {
                return [...baseChild, ...baseAdult];
              }

              // 5️⃣ Safe fallback → adult list
              return baseAdult;
            };

            const vaccinesToShow = getVaccinesForDoctor(selectedDoc);

            return vaccinesToShow.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label}
              </option>
            ));
          })()}
        </select>

        {form.vaccine_name && (
          <input
            className="input"
            type="text"
            readOnly
            value={`Dose ${form.dose_number}`}
            style={{
              background: "#f3f4f6",
              cursor: "not-allowed",
              fontWeight: "600",
            }}
          />
        )}
      </>
    )}
  </>
)}


            <button
              className="btn primary"
              onClick={async () => {
                if (!selectedDoctor)
                  return showToast("⚠️ Please select a doctor first.");
                await handleAddAppointment();
              }}
            >
              ➕ Add Appointment
            </button>
          </div>

          {/* Appointments Table */}
          <h4 style={{ marginTop: "1rem" }}>Appointments</h4>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Patient</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {appointments.length ? (
                  appointments
                    .filter((a) => a.status !== "cancelled")
                    .map((a) => (
                      <tr key={a.id}>
                        <td>{moment(a.time, "HH:mm:ss").format("h:mm A")}</td>
                        <td className="patient-name">
                          {`${a.first_name} ${a.last_name}`}
                        </td>
                        <td>
                          {moment(a.date).format("YYYY-MM-DD") === today ? (
                            <>
                              <label>
                                <input
                                  type="radio"
                                  name={`s-${a.id}`}
                                  checked={a.status === "attended"}
                                  onChange={() =>
                                    updateStatus(a.id, "attended", a.date)
                                  }
                                />{" "}
                                Attended
                              </label>
                              <label style={{ marginLeft: 10 }}>
                                <input
                                  type="radio"
                                  name={`s-${a.id}`}
                                  checked={a.status === "missed"}
                                  onChange={() =>
                                    updateStatus(a.id, "missed", a.date)
                                  }
                                />{" "}
                                Missed
                              </label>
                            </>
                          ) : (
                            <span style={{ color: "#666" }}>—</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn danger"
                            onClick={() => setDeleteAppt(a)}
                          >
                            ❌ Delete
                          </button>
                          {(a.auto_generated || a.series_id) && (
                            <button
                              className="btn success"
                              onClick={() =>
                                setEditFollowUp({
                                  ...a,
                                  is_series: !!a.series_id,
                                })
                              }
                            >
                              ✏️ {a.series_id ? "Edit Session" : "Edit Follow-Up"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td
                      colSpan="4"
                      style={{ textAlign: "center", color: "#777" }}
                    >
                      No appointments
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Calendar SECOND */}
        <div className="card">
          <div className="calendar-wrap">
            <RBCalendar
              selectable
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              step={15}
              timeslots={1}
              style={{ height: "100%" }}
              view={view}
              date={selectedDate ? new Date(selectedDate) : new Date()}
              dayPropGetter={dayPropGetter}
              eventPropGetter={eventPropGetter}
              min={new Date(2020, 1, 1, 7, 0, 0)}
              max={new Date(2020, 1, 1, 17, 0, 0)}
              onView={(newView) => {
  if (view === newView) return;
  setView(newView);

  // 📆 Month & Week: refresh full calendar + blocked times
  if (newView === Views.MONTH || newView === Views.WEEK) {
    (async () => {
      try {
        if (selectedDoctor) {
          await loadAllForDoctor(selectedDoctor);
        } else {
          await loadAll();
        }

        const avail = await getJSON(`/availability/service/${staffService}`, {
          doctor_id: selectedDoctor || undefined,
        });

        const fresh = (avail.blockedTimes || [])
          .filter((b) => {
            if (selectedDoctor)
              return String(b.doctor_id) === String(selectedDoctor);
            return true;
          })
          .map((b) => ({
            ...b,
            date: moment(b.date).format("YYYY-MM-DD"),
            start: moment(
              `${b.date} ${b.start_time}`,
              "YYYY-MM-DD HH:mm"
            ).toDate(),
            end: moment(
              `${b.date} ${b.end_time}`,
              "YYYY-MM-DD HH:mm"
            ).toDate(),
            title: `🚫 ${b.reason || "Doctor unavailable"}`,
            type: "blocked",
          }));

        setBlockedTimes(fresh);
      } catch (err) {
        console.error("⚠️ Month/Week view reload failed:", err);
      }
    })();
  }

  // 🗓 Day view is handled by the useEffect that watches `view`


                 else if (newView === Views.DAY) {
                  setTimeout(() => {
                    loadDayAppointments(selectedDate, selectedDoctor || null);
                  });
                }
              }}
              onNavigate={async (date) => {
                const ds = moment(date).format("YYYY-MM-DD");
                setSelectedDate(ds);

                if (selectedDoctor) {
                  await loadAllForDoctor(selectedDoctor);
                } else {
                  await loadAll();
                }

                const avail = await getJSON(
                  `/availability/service/${staffService}`,
                  {
                    doctor_id: selectedDoctor || undefined,
                  }
                );

                const fresh = (avail.blockedTimes || [])
                  .filter((b) => {
                    if (selectedDoctor)
                      return String(b.doctor_id) === String(selectedDoctor);
                    return true;
                  })
                  .map((b) => ({
                    ...b,
                    date: moment(b.date).format("YYYY-MM-DD"),
                    start: moment(
                      `${b.date} ${b.start_time}`,
                      "YYYY-MM-DD HH:mm"
                    ).toDate(),
                    end: moment(
                      `${b.date} ${b.end_time}`,
                      "YYYY-MM-DD HH:mm"
                    ).toDate(),
                    title: `🚫 ${b.reason || "Doctor unavailable"}`,
                    type: "blocked",
                  }));

                setBlockedTimes(fresh);
              }}
            onSelectSlot={(slot) => {
  const ds = moment(slot.start).format("YYYY-MM-DD");
  setSelectedDate(ds);
  setView(Views.DAY); // the Day-view effect will call loadDayAppointments
}}

            />
          </div>
        </div>

        {/* Log Sheet */}
        <div className={`card log-sheet ${showLogs ? "" : "hidden"}`}>
          <h3>📋 Appointment Log Sheet</h3>
          <div className="controls" style={{ marginBottom: 12 }}>
            <input
              type="date"
              className="input"
              value={logFilters.start}
              onChange={(e) =>
                setLogFilters({ ...logFilters, start: e.target.value })
              }
            />
            <input
              type="date"
              className="input"
              value={logFilters.end}
              onChange={(e) =>
                setLogFilters({ ...logFilters, end: e.target.value })
              }
            />
            <select
              className="input"
              value={logFilters.status}
              onChange={(e) =>
                setLogFilters({ ...logFilters, status: e.target.value })
              }
            >
              <option value="all">All</option>
              <option value="attended">Attended</option>
              <option value="missed">Missed</option>
            </select>
            <button className="btn primary" onClick={loadLogs}>
              🔍 View Logs
            </button>
            <button className="btn success" onClick={downloadCSV}>
              ⬇️ Download CSV
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Patient</th>
                  <th>Status</th>
                  <th>Service</th>
                </tr>
              </thead>
              <tbody>
                {logs.length ? (
                  logs.map((r) => (
                    <tr key={r.id}>
                      <td>{moment(r.date).format("MMM D, YYYY")}</td>
                      <td>
                        {moment(r.time, "HH:mm:ss").format("h:mm A")}
                      </td>
                      <td className="patient-name">
                        {`${toProperCase(r.first_name)} ${toProperCase(
                          r.last_name
                        )}`}
                      </td>
                      <td>{toProperCase(r.status || "Pending")}</td>
                      <td>{toProperCase(r.service_type)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="5"
                      style={{ textAlign: "center", color: "#777" }}
                    >
                      No logs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>

      <button
        className="log-toggle"
        onClick={() => {
          setShowLogs((prev) => {
            const newState = !prev;
            if (newState) {
              setTimeout(() => {
                document
                  .querySelector(".log-sheet")
                  ?.scrollIntoView({ behavior: "smooth" });
              }, 250);
            }
            return newState;
          });
        }}
        title="Toggle Logs"
      >
        {showLogs ? "🔽" : "📋"}
      </button>

      {deleteAppt && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Cancel Appointment</h3>
            <p>
              <strong>Patient:</strong>{" "}
              {toProperCase(deleteAppt.first_name)}{" "}
              {toProperCase(deleteAppt.last_name)}
            </p>
            <p>
              <strong>Date:</strong>{" "}
              {moment(deleteAppt.date).format("MMMM D, YYYY")}
            </p>
            <p>
              <strong>Time:</strong>{" "}
              {moment(deleteAppt.time, "HH:mm:ss").format("h:mm A")}
            </p>
            <p>
              <strong>Service:</strong>{" "}
              {toProperCase(deleteAppt.service_type)}
            </p>
            <p>
              <strong>Cancelled by:</strong> {adminName}
            </p>

            <textarea
              placeholder="Enter reason for cancellation..."
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn" onClick={() => setDeleteAppt(null)}>
                Close
              </button>
              <button className="btn danger" onClick={confirmDelete}>
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {editFollowUp && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Reschedule Follow-Up</h3>
            <p>
              <strong>Patient:</strong> {editFollowUp.first_name}{" "}
              {editFollowUp.last_name}
            </p>

            {(() => {
              const s = editFollowUp.service_type?.toLowerCase() || "";
              const base = moment(editFollowUp.date);
              let minDate, maxDate;

              if (s.startsWith("tb")) {
                minDate = base.clone().subtract(2, "days").toDate();
                maxDate = base.clone().add(2, "days").toDate();
              } else if (s.startsWith("pt")) {
                minDate = base.clone().subtract(1, "days").toDate();
                maxDate = base.clone().add(1, "days").toDate();
              } else if (s.startsWith("medical")) {
                minDate = base.clone().subtract(7, "days").toDate();
                maxDate = base.clone().add(7, "days").toDate();
              } else if (s.startsWith("dental")) {
                minDate = base.clone().subtract(14, "days").toDate();
                maxDate = base.clone().add(14, "days").toDate();
              } else {
                minDate = base.clone().subtract(7, "days").toDate();
                maxDate = base.clone().add(7, "days").toDate();
              }

              return (
                <DatePicker
                  selected={moment(editFollowUp.date).toDate()}
                  onChange={(d) => {
                    const newDate = moment(d);
                    const min = moment(minDate);
                    const max = moment(maxDate);
                    if (newDate.isBefore(min) || newDate.isAfter(max)) {
                      return showToast(
                        "⚠️ Selected date is outside the allowed range."
                      );
                    }
                    setEditFollowUp({
                      ...editFollowUp,
                      date: newDate.format("YYYY-MM-DD"),
                    });
                  }}
                  className="input"
                  dateFormat="MM/dd/yyyy"
                  minDate={minDate}
                  maxDate={maxDate}
                  filterDate={(date) => {
                    const day = moment(date).isoWeekday();
                    return day >= 1 && day <= 5;
                  }}
                />
              );
            })()}

            <select
              className="input"
              value={editFollowUp.time}
              onChange={(e) =>
                setEditFollowUp({ ...editFollowUp, time: e.target.value })
              }
            >
              <option value="">Select Time</option>
              {[
                "07:00:00",
                "07:30:00",
                "08:00:00",
                "08:30:00",
                "09:00:00",
                "09:30:00",
                "10:00:00",
                "10:30:00",
                "13:00:00",
                "13:30:00",
                "14:00:00",
                "14:30:00",
                "15:00:00",
                "15:30:00",
                "16:00:00",
              ].map((t) => (
                <option key={t} value={t}>
                  {moment(t, "HH:mm:ss").format("h:mm A")}
                </option>
              ))}
            </select>

            <div className="modal-actions">
              <button className="btn" onClick={() => setEditFollowUp(null)}>
                Close
              </button>
              <button
                className="btn primary"
                onClick={async () => {
                  try {
                    await putJSON(
                      `/appointments/${editFollowUp.id}/followup`,
                      {
                        new_date: editFollowUp.date,
                        new_time: editFollowUp.time,
                      }
                    );
                    showToast("✅ Follow-up updated!");
                    setEditFollowUp(null);
                    await loadAll();
                  } catch (err) {
                    showToast(
                      `⚠️ ${
                        err.response?.data?.error ||
                        "Failed to update follow-up."
                      }`
                    );
                  }
                }}
              >
                💾 Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
