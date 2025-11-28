// src/pages/DoctorCalendar.js
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Calendar as RBCalendar, momentLocalizer, Views } from "react-big-calendar";
import { useParams } from "react-router-dom";
import moment from "moment-timezone";
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
const delJSON = async (path, body) => (await api.delete(`/api${path}`, { data: body })).data;

const localizer = momentLocalizer(moment);

/* =========================================================
   📅 FIXED ALLOWED DAYS CONFIG
   ========================================================= */
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

/* =========================================================
   👩‍⚕️ DOCTOR-SPECIFIC AVAILABILITY CONFIG
   ========================================================= */
const doctorAvailabilityMap = {
  "Dr. Maria Santos": allowedDays["medical-general"],
  "Dr. Daniel Cruz": allowedDays["medical-buntis"],
  "Dr. Anna Reyes": allowedDays["dental-bunot"],
  "Dr. Joseph Lim": allowedDays["dental-pasta"],
  "Dr. Karen Dela Cruz": allowedDays["pt"],
  "Dr. Michael Tan": allowedDays["tb"],
  "Nurse Carlo Mendoza": allowedDays["vax-adult"],
  "Nurse Patricia Gomez": allowedDays["vax-children"],
};

/* =========================================================
   📅 MAIN COMPONENT
   ========================================================= */
export default function DoctorCalendar() {
  const { service } = useParams();
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState("");
  const [selectedDoctorName, setSelectedDoctorName] = useState("");
  const [events, setEvents] = useState([]);
  const [toast, setToast] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [manualBlock, setManualBlock] = useState({
    date: moment().format("YYYY-MM-DD"),
    start: "07:00",
    end: "08:00",
    reason: "",
  });

  /* =========================================================
     🔔 TOAST
     ========================================================= */
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  /* =========================================================
     🧑‍⚕️ LOAD DOCTORS
     ========================================================= */
  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const res = await getJSON("/doctors", { service_type: service });
        setDoctors(res);
      } catch (err) {
        console.error(err);
        showToast("⚠️ Failed to load doctors.");
      }
    };
    fetchDoctors();
  }, [service]);

  /* =========================================================
     📦 LOAD AVAILABILITY / BLOCKED TIMES
     ========================================================= */
  const loadData = useCallback(async () => {
    if (!selectedDoctor) return;
    try {
      const res = await getJSON(`/availability/doctor/${selectedDoctor}`);
      const list = Array.isArray(res) ? res : res.blockedTimes || [];

      const blocked = list.map((b) => {
        const start = moment.tz(
          `${b.date} ${b.start_time}`,
          "YYYY-MM-DD HH:mm",
          moment.tz.guess()
        ).toDate();
        const end = moment.tz(
          `${b.date} ${b.end_time}`,
          "YYYY-MM-DD HH:mm",
          moment.tz.guess()
        ).toDate();

        return {
          id: b.id || Math.random().toString(36).substr(2, 9),
          title: `🟥 ${b.reason || "Unavailable"}`,
          start,
          end,
          type: "blocked",
        };
      });

      setEvents(blocked);
    } catch (err) {
      console.error("❌ Error loading data:", err);
      showToast("⚠️ Failed to load data.");
    }
  }, [selectedDoctor]);

  useEffect(() => {
    if (selectedDoctor) loadData();
    else setEvents([]);
  }, [selectedDoctor, loadData]);

  /* =========================================================
     🟦 VALIDATE SERVICE DAYS (now includes doctor-based check)
     ========================================================= */
  const isAllowedDay = (date) => {
    const weekday = moment(date).isoWeekday();
    const baseAllowed = allowedDays[service?.toLowerCase()];
    const doctorAllowed =
      doctorAvailabilityMap[selectedDoctorName] || baseAllowed || [1, 2, 3, 4, 5];
    return doctorAllowed.includes(weekday);
  };

  /* =========================================================
     🟥 BLOCK / UNBLOCK SLOT
     ========================================================= */
  const handleSelectSlot = async ({ start, end }) => {
    if (!selectedDoctor) return showToast("⚠️ Please select a doctor first.");

    const weekday = moment(start).isoWeekday();
    if (moment(start).isBefore(moment(), "day") || weekday === 6 || weekday === 7)
      return showToast("⛔ Cannot edit past dates or weekends.");

    if (!isAllowedDay(start))
      return showToast(`⚠️ ${selectedDoctorName || "This doctor"} is not available on this day.`);

    const sameDay = moment(start).isSame(end, "day");
    if (!sameDay) return showToast("⚠️ Please block within one day only.");

    const overlap = events.find(
      (e) => e.type === "blocked" && moment(start).isSame(e.start, "minute")
    );

    try {
      if (overlap) {
        if (window.confirm("Unblock this time?")) {
          await delJSON(`/availability/block/${selectedDoctor}/${overlap.id}`);
          showToast("✅ Time unblocked.");
          loadData();
        }
      } else {
        if (moment(end).isBefore(start))
          return showToast("⚠️ End time must be after start time.");

        if (window.confirm(`Block ${moment(start).format("LT")}–${moment(end).format("LT")}?`)) {
          await postJSON(`/availability`, {
            doctor_id: selectedDoctor,
            date: moment(start).format("YYYY-MM-DD"),
            start_time: moment(start).format("HH:mm"),
            end_time: moment(end).format("HH:mm"),
            reason: "Unavailable",
          });
          showToast("🟥 Time blocked.");
          loadData();
        }
      }
    } catch (err) {
      console.error("❌ Error updating availability:", err);
      showToast("❌ Error updating availability.");
    }
  };

  /* =========================================================
     🕒 MANUAL BLOCK MODAL
     ========================================================= */
  const handleManualBlock = async () => {
    if (!selectedDoctor) return showToast("⚠️ Please select a doctor first.");
    const { date, start, end, reason } = manualBlock;

    const weekday = moment(date).isoWeekday();
    if (moment(date).isBefore(moment(), "day") || weekday === 6 || weekday === 7)
      return showToast("⛔ Cannot block past dates or weekends.");
    if (!date || !start || !end) return showToast("⚠️ Fill all fields.");

    if (!isAllowedDay(date))
      return showToast(`⚠️ ${selectedDoctorName || "This doctor"} is not available on this day.`);

    const startDate = moment(`${date} ${start}`, "YYYY-MM-DD HH:mm").toDate();
    const endDate = moment(`${date} ${end}`, "YYYY-MM-DD HH:mm").toDate();
    if (moment(endDate).isBefore(startDate))
      return showToast("⚠️ End time must be after start time.");

    try {
      await postJSON(`/availability`, {
        doctor_id: selectedDoctor,
        date,
        start_time: start,
        end_time: end,
        reason: reason || "Unavailable",
      });
      showToast("✅ Block added successfully.");
      setShowModal(false);
      setManualBlock({ ...manualBlock, reason: "" });
      loadData();
    } catch (err) {
      console.error("❌ Failed to save block:", err);
      showToast("❌ Failed to save block.");
    }
  };

  /* =========================================================
     🎨 EVENT STYLE + GREY OUT PAST DATES & RESTRICTED DAYS
     ========================================================= */
  const eventPropGetter = (event) => {
    const style = {
      borderRadius: "6px",
      color: "#fff",
      padding: "4px 6px",
      backgroundColor: event.type === "blocked" ? "#ef4444" : "#2563eb",
    };
    return { style };
  };

  const dayPropGetter = (date) => {
    const weekday = moment(date).isoWeekday();
    const isPast = moment(date).isBefore(moment(), "day");
    const isWeekend = weekday === 6 || weekday === 7;
    const doctorAllowed =
      doctorAvailabilityMap[selectedDoctorName] ||
      allowedDays[service?.toLowerCase()] ||
      [1, 2, 3, 4, 5];
    const isAllowed = doctorAllowed.includes(weekday);

    if (isPast || isWeekend || !isAllowed) {
      return {
        style: {
          backgroundColor: "#f3f4f6",
          color: "#9ca3af",
          cursor: "not-allowed",
          opacity: 0.7,
        },
      };
    }
    return {};
  };

  /* =========================================================
     🖥️ RENDER
     ========================================================= */
  return (
    <>
      <div className="page">
        <InjectStyles />
        <h2>🩺 Doctor Availability ({service || "All"})</h2>

        <div className="controls" style={{ marginBottom: 10 }}>
          <select
            className="input"
            value={selectedDoctor}
            onChange={(e) => {
              const value = e.target.value;
              const doc = doctors.find((d) => String(d.id) === String(value));
              setSelectedDoctor(value);
              setSelectedDoctorName(doc?.name || "");
              localStorage.setItem("selectedDoctor", value);
            }}
          >
            <option value="">Select Doctor</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} {d.specialization ? `(${d.specialization})` : ""}
              </option>
            ))}
          </select>

          {selectedDoctor && (
            <>
              <button className="btn primary" onClick={loadData}>
                🔄 Refresh
              </button>
              <button className="btn success" onClick={() => setShowModal(true)}>
                ➕ Block Manually
              </button>
            </>
          )}
        </div>

        <div className="card calendar-wrap">
          <RBCalendar
            localizer={localizer}
            events={events}
            selectable
            startAccessor="start"
            endAccessor="end"
            step={15}
            timeslots={1}
            defaultView={Views.WEEK}
            onSelectSlot={handleSelectSlot}
            eventPropGetter={eventPropGetter}
            dayPropGetter={dayPropGetter}
            min={new Date(2020, 1, 1, 7, 0, 0)}
            max={new Date(2020, 1, 1, 17, 0, 0)}
            style={{ height: "70vh" }}
          />
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>

{/* Manual Block Modal */}
{showModal && (
  <div className="modal-overlay">
    <div className="modal-card">
      <h3 style={{ color: "#1e40af", marginBottom: "6px" }}>Block Specific Time</h3>
      <p>Select date and time range to block.</p>

      {/* 📅 Modern Date Picker */}
      <DatePicker
        selected={moment(manualBlock.date).toDate()}
        onChange={(date) => {
          const weekday = moment(date).isoWeekday();
          const doctorAllowed =
            doctorAvailabilityMap[selectedDoctorName] ||
            allowedDays[service?.toLowerCase()] ||
            [1, 2, 3, 4, 5];

          if (!doctorAllowed.includes(weekday)) {
            showToast(
              `⚠️ ${
                selectedDoctorName || "This doctor"
              } is not available on that day.`
            );
            return;
          }
          setManualBlock({
            ...manualBlock,
            date: moment(date).format("YYYY-MM-DD"),
          });
        }}
        minDate={new Date()}
        dateFormat="MM/dd/yyyy"
        filterDate={(date) => {
          const weekday = moment(date).isoWeekday();
          const doctorAllowed =
            doctorAvailabilityMap[selectedDoctorName] ||
            allowedDays[service?.toLowerCase()] ||
            [1, 2, 3, 4, 5];
          return doctorAllowed.includes(weekday);
        }}
        className="input"
        placeholderText="Select Date"
      />

      {/* 🕒 Time Picker */}
      <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
        <select
          className="input"
          value={manualBlock.start}
          onChange={(e) =>
            setManualBlock({ ...manualBlock, start: e.target.value })
          }
        >
          {generateTimeOptions().map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <select
          className="input"
          value={manualBlock.end}
          onChange={(e) =>
            setManualBlock({ ...manualBlock, end: e.target.value })
          }
        >
          {generateTimeOptions().map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* 📝 Reason Field */}
      <textarea
        placeholder="Reason (optional)"
        className="input"
        style={{ marginTop: "10px", height: "80px" }}
        value={manualBlock.reason}
        onChange={(e) =>
          setManualBlock({ ...manualBlock, reason: e.target.value })
        }
      />

      <div className="modal-actions">
        <button className="btn primary" onClick={() => setShowModal(false)}>
          Close
        </button>
        <button
          className="btn danger"
          onClick={() => {
            const weekday = moment(manualBlock.date).isoWeekday();
            const doctorAllowed =
              doctorAvailabilityMap[selectedDoctorName] ||
              allowedDays[service?.toLowerCase()] ||
              [1, 2, 3, 4, 5];

            if (!doctorAllowed.includes(weekday)) {
              return showToast(
                `⚠️ ${
                  selectedDoctorName || "This doctor"
                } cannot block on that day.`
              );
            }
            handleManualBlock();
          }}
        >
          Confirm Block
        </button>
      </div>
    </div>
  </div>
)}


    </>
  );
}

/* =========================================================
   ⏰ Helper function for time options
   ========================================================= */
function generateTimeOptions() {
  const times = [];
  for (let hour = 7; hour <= 16; hour++) {
    for (let min = 0; min < 60; min += 30) {
      const h = String(hour).padStart(2, "0");
      const m = String(min).padStart(2, "0");
      const value = `${h}:${m}`;
      const label = moment(`${h}:${m}`, "HH:mm").format("h:mm A");
      times.push({ value, label });
    }
  }
  return times;
}

/* =========================================================
   🎨 STYLES
   ========================================================= */
const InjectStyles = () => (
  <style>{`
    :root {
      --primary:#1e40af; --danger:#dc2626; --success:#16a34a;
      --border:#e5e7eb; --bg:#f9fafb; --card:#fff; --shadow:0 4px 12px rgba(0,0,0,.08);
    }
    body { background:var(--bg); font-family:"Inter",sans-serif; margin:0; padding:0; }
    .page { max-width:1200px; margin:0 auto; padding:1rem; }
    .card {
      background:var(--card); border:1px solid var(--border);
      border-radius:16px; padding:18px; box-shadow:var(--shadow);
    }
    .controls { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
    .input {
      padding:10px; border:1px solid var(--border); border-radius:10px;
      font-size:15px; flex:1; min-width:150px;
    }
    .btn {
      border:none; border-radius:10px; padding:10px 16px; font-weight:600;
      cursor:pointer; transition:.25s; white-space:nowrap;
    }
    .btn.primary { background:var(--primary); color:#fff; }
    .btn.success { background:var(--success); color:#fff; }
    .btn.danger { background:var(--danger); color:#fff; }
    .toast {
      position:fixed; top:20px; right:20px; z-index:9999;
      background:linear-gradient(90deg,#1e40af,#3b82f6);
      color:#fff; padding:12px 20px; border-radius:12px; font-weight:600;
      box-shadow:0 4px 12px rgba(0,0,0,.15);
      animation:toastIn .3s ease, toastOut .3s ease 3.5s forwards;
    }
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
    .modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:14px; }
    @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
    @keyframes slideUp { from { transform:translateY(10px); opacity:0 } to { transform:translateY(0); opacity:1 } }
    @keyframes toastIn { from { transform:translateY(-8px); opacity:0 } to { transform:translateY(0); opacity:1 } }
    @keyframes toastOut { to { transform:translateY(-8px); opacity:0 } }
  `}</style>
);
