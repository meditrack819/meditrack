// backend/routes/appointments.js
const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const moment = require("moment");
const { sendSMS } = require("../utils/sms");

/* =========================================================
   📲 SMS HELPER
   ========================================================= */
// Make SMS gateway–friendly: remove emojis + collapse whitespace/newlines
function cleanSMS(text) {
  return text
    // remove emojis / miscellaneous symbols
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    // collapse all whitespace (spaces, tabs, newlines) into single spaces
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================================================
   📅 CONFIGS
   ========================================================= */
const allowedDays = {
  "medical-general": [1, 2, 3, 4, 5],
  "medical-buntis": [4],
  "dental-bunot": [1, 5],
  "dental-pasta": [2, 4],
  "dental-buntis": [4],
  pt: [1, 3, 5],
  tb: [1, 2, 3, 4, 5],
  "vax-children": [3],
  "vax-adult": [1, 2, 3, 4, 5, 6, 7],
};

const serviceDurations = {
  "vax-children": 60,
  "vax-adult": 60,
  default: 30,
};

const serviceGroups = {
  medical: ["medical-general", "medical-buntis"],
  dental: ["dental-bunot", "dental-pasta", "dental-buntis"],
  vax: ["vax-children", "vax-adult"],
  pt: ["pt"],
  tb: ["tb"],
};

function getMainGroup(serviceType) {
  const lower = (serviceType || "").toLowerCase();
  return (
    Object.keys(serviceGroups).find((g) =>
      serviceGroups[g].includes(lower)
    ) || lower
  );
}

/* =========================================================
   💉 VACCINE SCHEDULE RULES
   ========================================================= */
const vaccineRules = {
  // 👶 CHILDREN
  bcg: [], // single dose
  "hep-b": [30, 180], // 2nd dose after 1 month, 3rd after 6 months
  polio: [28, 56, 84], // OPV 1 → 2 → 3 every 4 weeks
  dpt: [28, 56, 84, 365], // DPT1–3 every 4 weeks, booster after 1 year
  pneumococcal: [28, 56, 84, 365], // infant series + booster
  measles: [], // usually 1 dose (can pair with MMR)
  mmr: [1095], // 2nd dose after 3 years (36 months)

  // 🧑‍🦳 ADULTS
  influenza: [365], // yearly flu shot
  covid19: [180], // 6 months booster
  tetanus: [3650], // every 10 years (booster Td/Tdap)
  "hep-a": [180], // booster 6 months after first dose
  "hep-b-booster": [180], // if adult booster for Hepatitis B
  hpv: [60, 180], // 2nd dose after 2 months, 3rd after 6 months
  "pneumococcal-adult": [1825], // 1 booster after 5 years
};

/* =========================================================
   🔁 UNIVERSAL FOLLOW-UP RULES (days)
   ========================================================= */

const followUpRules = {
  medical: null, // (disabled for now)
  dental: null,  // (disabled for now)
  pt: null,
  tb: null,
  vax: "vaccineRule", // handled by vaccineRules
};

/* =========================================================
   🧰 DOCTOR AVAILABILITY HELPERS
   ========================================================= */

// ✅ Helper: check if doctor is blocked for the given slot (respects service duration)
async function isDoctorBlocked(doctorId, date, timeSQL, serviceType) {
  if (!doctorId || !date || !timeSQL) return false;

  const lowerService = (serviceType || "").toLowerCase();
  const durationMinutes =
    serviceDurations[lowerService] ||
    serviceDurations[serviceType] ||
    serviceDurations.default ||
    30;

  // Get all blocked rows for that doctor & date
  const { rows } = await pool.query(
    `SELECT start_time, end_time
       FROM doctor_availability
      WHERE doctor_id = $1
        AND date = $2
        AND reason IS NOT NULL
        AND TRIM(reason) <> ''`,
    [doctorId, date]
  );

  if (!rows.length) return false;

  const slotStart = moment(`${date} ${timeSQL}`, "YYYY-MM-DD HH:mm:ss");
  const slotEnd = slotStart.clone().add(durationMinutes, "minutes");

  // Overlap check: slotStart < blockEnd AND slotEnd > blockStart
  return rows.some((b) => {
    const blockStart = moment(
      `${date} ${b.start_time}`,
      "YYYY-MM-DD HH:mm:ss"
    );
    const blockEnd = moment(`${date} ${b.end_time}`, "YYYY-MM-DD HH:mm:ss");
    return slotStart.isBefore(blockEnd) && slotEnd.isAfter(blockStart);
  });
}

// ✅ Helper: find the next date (within maxDays) where doctor is free at that time
async function findNextAvailableDateForDoctor(
  doctorId,
  startDate, // "YYYY-MM-DD"
  timeSQL,   // "HH:mm:ss"
  serviceType,
  maxDays = 30
) {
  const lowerService = (serviceType || "").toLowerCase();
  const allowed = allowedDays[lowerService] || [1, 2, 3, 4, 5];

  let candidate = moment(startDate, "YYYY-MM-DD");

  for (let i = 0; i <= maxDays; i++) {
    // Ensure date is allowed for this service
    while (!allowed.includes(candidate.isoWeekday())) {
      candidate.add(1, "day");
    }

    const dateStr = candidate.format("YYYY-MM-DD");

    const blocked = await isDoctorBlocked(
      doctorId,
      dateStr,
      timeSQL,
      lowerService
    );

    if (!blocked) {
      // ✅ Found first free date
      return dateStr;
    }

    // Try next day
    candidate.add(1, "day");
  }

  // ❌ No slot found within maxDays
  return null;
}

/* =========================================================
   ⚙️ GET — Appointments
   ========================================================= */
router.get("/", async (req, res) => {
  try {
    const { patient_id, service_type, date } = req.query;
    const params = [];
    let query = "SELECT * FROM appointments WHERE 1=1";

    if (patient_id) {
      params.push(patient_id);
      query += ` AND patient_id = $${params.length}`;
    }
    if (service_type) {
      params.push(service_type.toLowerCase());
      query += ` AND LOWER(service_type) = $${params.length}`;
    }
    if (date) {
      params.push(date);
      query += ` AND DATE(date) = $${params.length}`;
    }

    query += " ORDER BY date, time";
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Appointments GET error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================================================
   📆 GET — Day Map
   ========================================================= */
router.get("/day-map", async (req, res) => {
  try {
    const { start, end, service_type, role } = req.query;
    if (!start || !end)
      return res.status(400).json({ error: "Missing start or end date" });

    let query = `
      SELECT date, COUNT(*)::int AS booked_count
      FROM appointments
      WHERE date BETWEEN $1 AND $2
    `;
    const params = [start, end];

    if (service_type && role?.toLowerCase() !== "superadmin") {
      const st = service_type.toLowerCase();
      if (serviceGroups[st]) {
        query += ` AND LOWER(service_type) = ANY($${params.length + 1})`;
        params.push(serviceGroups[st]);
      } else {
        params.push(st);
        query += ` AND LOWER(service_type) = $${params.length}`;
      }
    }

    query += " GROUP BY date ORDER BY date";
    const { rows } = await pool.query(query, params);
    const mapped = rows.map((r) => ({
      date: moment(r.date).format("YYYY-MM-DD"),
      booked_count: r.booked_count,
    }));

    res.json(mapped);
  } catch (err) {
    console.error("Appointments day-map error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================================================
   📜 GET — Appointment History for a Patient
   ========================================================= */
router.get("/history", async (req, res) => {
  try {
    const { patient_id, service_type } = req.query;

    if (!patient_id) {
      return res.status(400).json({ error: "patient_id is required" });
    }

    const params = [patient_id];
    let query = `
      SELECT *
      FROM appointments
      WHERE patient_id = $1
        AND date < CURRENT_DATE
    `;

    if (service_type) {
      params.push(service_type.toLowerCase());
      query += ` AND LOWER(service_type) = $${params.length}`;
    }

    query += " ORDER BY date DESC, time DESC";

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Appointments HISTORY error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================================================
   🔁 POST — Create Recurring Appointment Series
   ========================================================= */
/*
  Expected body:
  {
    patient_id,
    first_name,
    last_name,
    service_type,
    reason,
    start_date,   // "YYYY-MM-DD"
    time,         // "HH:mm" or "HH:mm:ss"
    doctor_id,    // optional
    occurrences,  // e.g. 3
    every,        // e.g. 7
    unit          // "days" or "weeks"
  }
*/
router.post("/series", async (req, res) => {
  try {
    let {
      patient_id,
      first_name,
      last_name,
      service_type,
      reason,
      start_date,
      time,
      doctor_id,
      occurrences,
      every,
      unit,
    } = req.body;

    if (!first_name || !last_name || !start_date || !time || !service_type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!occurrences || occurrences < 1) occurrences = 1;
    if (!every || every < 1) every = 1;
    if (!unit) unit = "weeks";

    const lowerService = service_type.toLowerCase();
    const mainGroup = getMainGroup(lowerService);
    const intervalDays = unit === "weeks" ? every * 7 : every;

    // 🧠 Link patient if needed
    let linkedPatientId = patient_id;
    if (!linkedPatientId) {
      const { rows: pRows } = await pool.query(
        `SELECT id, phone FROM patients
         WHERE LOWER(first_name)=LOWER($1) AND LOWER(last_name)=LOWER($2)
         LIMIT 1`,
        [first_name.trim(), last_name.trim()]
      );
      if (!pRows.length) {
        return res.status(400).json({ error: "Patient could not be linked" });
      }
      linkedPatientId = pRows[0].id;
    }

    const timeSQL = moment(time, ["HH:mm:ss", "HH:mm"]).format("HH:mm:ss");
    const allowed = allowedDays[lowerService] || [1, 2, 3, 4, 5]; // default weekdays

    const seriesId = `SERIES-${linkedPatientId}-${Date.now()}-${Math.floor(
      Math.random() * 1000
    )}`;

    const created = [];

    for (let i = 0; i < occurrences; i++) {
      let nextDate = moment(start_date, "YYYY-MM-DD").add(
        i * intervalDays,
        "days"
      );

      // Shift to an allowed day for this service
      while (!allowed.includes(nextDate.isoWeekday())) {
        nextDate.add(1, "day");
      }

      let dateStr = nextDate.format("YYYY-MM-DD");

      // ✅ If doctor is given, move forward until doctor is available
      if (doctor_id) {
        const adjustedDate = await findNextAvailableDateForDoctor(
          doctor_id,
          dateStr,
          timeSQL,
          lowerService
        );

        if (!adjustedDate) {
          console.log(
            `⏭️ No available date found for doctor in series starting ${dateStr} (within 30 days).`
          );
          continue; // nothing reasonable to book for this occurrence
        }

        dateStr = adjustedDate;
      }

      const { rows } = await pool.query(
        `INSERT INTO appointments 
         (patient_id, first_name, last_name, date, time, status, service_type, reason, doctor_id,
          vaccine_name, dose_number, auto_generated, series_id, series_interval_days)
         VALUES ($1,$2,$3,$4,$5,'scheduled',$6,$7,$8,NULL,NULL,false,$9,$10)
         RETURNING *`,
        [
          linkedPatientId,
          first_name,
          last_name,
          dateStr,
          timeSQL,
          lowerService,
          reason || `${occurrences}-session ${unit} consult`,
          doctor_id || null,
          seriesId,
          intervalDays,
        ]
      );

      created.push(rows[0]);
    }

    return res.json({
      success: true,
      series_id: seriesId,
      interval_days: intervalDays,
      count: created.length,
      appointments: created,
    });
  } catch (err) {
    console.error("Appointments SERIES POST error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================================================
   🔁 Helper — Auto-reschedule when a series slot is missed
   ========================================================= */
async function autoRescheduleIfMissed(appt) {
  try {
    if (!appt) return;
    if (!appt.series_id || !appt.series_interval_days) return;

    const lowerService = (appt.service_type || "").toLowerCase();
    const allowed = allowedDays[lowerService] || [1, 2, 3, 4, 5];

    let nextDate = moment(appt.date).add(appt.series_interval_days, "days");

    // Move to allowed day by service rules
    while (!allowed.includes(nextDate.isoWeekday())) {
      nextDate.add(1, "day");
    }

    const timeSQL = moment(appt.time, ["HH:mm:ss", "HH:mm"]).format("HH:mm:ss");
    let dateStr = nextDate.format("YYYY-MM-DD");

    // ✅ Move forward until doctor is available (no skipping)
    if (appt.doctor_id) {
      const adjustedDate = await findNextAvailableDateForDoctor(
        appt.doctor_id,
        dateStr,
        timeSQL,
        lowerService
      );

      if (!adjustedDate) {
        console.log(
          `⏭️ Auto-reschedule failed for series ${appt.series_id} — no available date within 30 days.`
        );
        return;
      }

      dateStr = adjustedDate;
    }

    const { rows } = await pool.query(
      `INSERT INTO appointments 
       (patient_id, first_name, last_name, date, time, status, service_type, reason, doctor_id,
        vaccine_name, dose_number, auto_generated, series_id, series_interval_days)
       VALUES ($1,$2,$3,$4,$5,'scheduled',$6,$7,$8,$9,$10,true,$11,$12)
       RETURNING *`,
      [
        appt.patient_id,
        appt.first_name,
        appt.last_name,
        dateStr,
        timeSQL,
        lowerService,
        appt.reason || "Auto-rescheduled consult (missed previous)",
        appt.doctor_id || null,
        appt.vaccine_name || null,
        appt.dose_number || null,
        appt.series_id,
        appt.series_interval_days,
      ]
    );

    console.log(
      `🔁 Auto-rescheduled series ${appt.series_id} — new slot on ${rows[0].date} ${rows[0].time}`
    );
  } catch (err) {
    console.warn("⚠️ Auto-reschedule failed:", err.message);
  }
}

/* =========================================================
   ➕ POST — Create Appointment (with SMS + Auto Follow-up)
   ========================================================= */
router.post("/", async (req, res) => {
  try {
    const {
      patient_id,
      reason,
      first_name,
      last_name,
      date,
      time,
      service_type,
      vaccine_name,
      dose_number,
      doctor_id,
    } = req.body;

    // 🧠 Auto-link patient
    let linkedPatientId = patient_id;
    let phone = null;

    if (!linkedPatientId && first_name && last_name) {
      const { rows } = await pool.query(
        `SELECT id, phone FROM patients 
         WHERE LOWER(first_name)=LOWER($1) AND LOWER(last_name)=LOWER($2) LIMIT 1`,
        [first_name.trim(), last_name.trim()]
      );
      if (rows.length > 0) {
        linkedPatientId = rows[0].id;
        phone = rows[0].phone;
      }
    }

    if (!linkedPatientId)
      return res.status(400).json({ error: "Patient could not be linked" });

    if (!first_name || !last_name || !date || !time || !service_type)
      return res.status(400).json({ error: "Missing required fields" });

    // 🚫 Prevent booking same-day appointments after clinic hours
    const clinicStart = 7; // 7 AM (not used yet, but kept for future logic)
    const clinicEnd = 17; // 5 PM
    const now = moment();
    const bookingDate = moment(date, "YYYY-MM-DD");
    const bookingTime = moment(time, "HH:mm:ss");

    // If booking for today
    if (bookingDate.isSame(now, "day")) {
      const currentHour = now.hour();
      const currentMinute = now.minute();
      const bookingHour = bookingTime.hour();
      const bookingMinute = bookingTime.minute();

      // Clinic already closed
      if (currentHour >= clinicEnd) {
        return res.status(400).json({
          error: "Clinic hours have ended for today. Please book for another day.",
        });
      }

      // Booking a past time today
      if (
        bookingHour < currentHour ||
        (bookingHour === currentHour && bookingMinute <= currentMinute)
      ) {
        return res.status(400).json({
          error: "Cannot book for a time that has already passed today.",
        });
      }
    }

    const timeSQL = moment(time, ["HH:mm:ss", "HH:mm"]).format("HH:mm:ss");
    const lowerService = service_type.toLowerCase();

    // 🧩 Determine main service group
    const mainGroup =
      Object.keys(serviceGroups).find((g) =>
        serviceGroups[g].includes(lowerService)
      ) || lowerService;

    // 🧱 Prevent duplicate bookings
    const dupCheck = await pool.query(
      `SELECT id FROM appointments 
       WHERE LOWER(first_name)=LOWER($1) 
         AND LOWER(last_name)=LOWER($2)
         AND date=$3
         AND LOWER(service_type)=LOWER($4)`,
      [first_name.trim(), last_name.trim(), date, lowerService]
    );
    if (dupCheck.rows.length > 0)
      return res
        .status(400)
        .json({ error: "Patient already has an appointment on this date." });

    /* =========================================================
       🚫 PREVENT BOOKING INSIDE DOCTOR'S BLOCKED TIME
       ========================================================= */
    if (doctor_id && date && time) {
      const doctorBlocked = await isDoctorBlocked(
        doctor_id,
        date,
        timeSQL,
        lowerService
      );

      if (doctorBlocked) {
        return res.status(400).json({
          error: "Doctor is unavailable during this time.",
        });
      }
    }

    /* =========================================================
       🧾 INSERT MAIN APPOINTMENT
       ========================================================= */
    const insertQuery = `
      INSERT INTO appointments 
      (patient_id, first_name, last_name, date, time, status, service_type, reason, doctor_id, vaccine_name, dose_number, auto_generated)
      VALUES ($1,$2,$3,$4,$5,'scheduled',$6,$7,$8,$9,$10,false)
      RETURNING *`;

    const insertValues = [
      linkedPatientId,
      first_name,
      last_name,
      date,
      timeSQL,
      lowerService,
      reason || null,
      doctor_id || null,
      vaccine_name || null,
      dose_number || null,
    ];

    const { rows } = await pool.query(insertQuery, insertValues);
    const appointment = rows[0];

    /* =========================================================
       📲 SMS — Appointment Confirmation
       ========================================================= */
    try {
      if (!phone) {
        const { rows: patientRes } = await pool.query(
          "SELECT phone FROM patients WHERE id=$1 LIMIT 1",
          [linkedPatientId]
        );
        phone = patientRes[0]?.phone || null;
      }

      if (phone) {
        const rawMessage = `Magandang araw ${first_name} ${last_name}!
Nakumpirma ang iyong appointment sa MediTrack Health Center:
📅 ${moment(date).format("MMM D, YYYY")}
🕒 ${moment(timeSQL, "HH:mm:ss").format("h:mm A")}
🩺 Serbisyo: ${service_type.replace(/-/g, " ").toUpperCase()}
Pakitandaan: Dumating ng 10-15 minuto bago ang oras.`;

        const smsMessage = cleanSMS(rawMessage);
        await sendSMS(phone, smsMessage);
        console.log(`📲 Appointment confirmation sent to ${phone}`);
      }
    } catch (smsErr) {
      console.warn("⚠️ Failed to send appointment SMS:", smsErr.message);
    }

    /* =========================================================
       🔁 AUTO-FOLLOW-UP CREATION
       ========================================================= */
    try {
      const { rows: patientData } = await pool.query(
        "SELECT diagnosis FROM patients WHERE id=$1 LIMIT 1",
        [linkedPatientId]
      );
      const diagnosis = (patientData[0]?.diagnosis || "").toLowerCase();

      // 💉 Vaccination follow-up
      if (mainGroup === "vax" && vaccine_name) {
        const vaccineKeyMap = {
          "bcg vaccine": "bcg",
          "hepatitis b vaccine": "hep-b",
          "polio vaccine": "polio",
          "dpt vaccine": "dpt",
          "pneumococcal vaccine": "pneumococcal",
          "measles vaccine": "measles",
          "mmr vaccine": "mmr",
          "influenza vaccine": "influenza",
          "covid-19 vaccine": "covid19",
          "tetanus booster (td/tdap)": "tetanus",
          "hepatitis a vaccine": "hep-a",
          "hepatitis b booster": "hep-b-booster",
          "hpv vaccine": "hpv",
          "pneumococcal vaccine (adults)": "pneumococcal-adult",
        };

        const vKey = vaccineKeyMap[vaccine_name.toLowerCase().trim()];
        const schedule = vaccineRules[vKey];

        if (schedule && schedule.length > 0) {
          const currentDose = parseInt(dose_number || 1, 10);

          if (currentDose <= schedule.length) {
            let nextDate = moment(date).add(
              schedule[currentDose - 1],
              "days"
            );

            // Ensure nextDate falls on allowed service days
            const allowed = allowedDays[lowerService] || [1, 2, 3, 4, 5];
            while (!allowed.includes(nextDate.isoWeekday()))
              nextDate.add(1, "day");

            let nextDateStr = nextDate.format("YYYY-MM-DD");
            const followupTime = "09:00:00";

            // 🔍 Prevent duplicate next appointment
            const { rows: dupCheck2 } = await pool.query(
              `SELECT id FROM appointments
               WHERE patient_id=$1 AND date=$2 AND LOWER(service_type)=LOWER($3)
               LIMIT 1`,
              [linkedPatientId, nextDateStr, lowerService]
            );
            if (dupCheck2.length > 0) {
              console.log("⏭️ Auto-follow-up skipped: duplicate already exists.");
              return;
            }

            // ✅ Move forward if doctor is blocked at followupTime
            if (doctor_id) {
              const adjustedDate = await findNextAvailableDateForDoctor(
                doctor_id,
                nextDateStr,
                followupTime,
                lowerService
              );

              if (!adjustedDate) {
                console.log(
                  `⏭️ Vaccine auto follow-up could not find free slot within 30 days from ${nextDateStr}.`
                );
                return;
              }

              nextDateStr = adjustedDate;
            }

            // ✅ Safe insert next appointment
            const { rows: nextRows } = await pool.query(
              `INSERT INTO appointments 
               (patient_id, first_name, last_name, date, time, status, service_type, reason, doctor_id, vaccine_name, dose_number, auto_generated)
               VALUES ($1,$2,$3,$4,$5,'scheduled',$6,$7,$8,$9,$10,true)
               RETURNING *`,
              [
                linkedPatientId,
                first_name,
                last_name,
                nextDateStr,
                followupTime,
                lowerService,
                `Auto follow-up for ${vaccine_name} Dose ${currentDose + 1}`,
                doctor_id || null,
                vaccine_name,
                currentDose + 1,
              ]
            );

            const nextAppt = nextRows[0];
            if (nextAppt && phone) {
              const rawFollowup = `💉 Paalala mula sa MediTrack Health Center:
Ang iyong susunod na bakuna (${vaccine_name} Dose ${currentDose + 1}) ay naka-schedule sa:
📅 ${moment(nextAppt.date).format("MMMM D, YYYY")}
🕒 ${moment(nextAppt.time, "HH:mm:ss").format("h:mm A")}
📍 MediTrack Clinic.`;

              const sms = cleanSMS(rawFollowup);
              await sendSMS(phone, sms);
            }
          }
        }
      }

      // 🩺 Other service follow-up (currently only if followUpRules[mainGroup] is truthy)
      else if (followUpRules[mainGroup]) {
        if (mainGroup === "medical" && !diagnosis) {
          console.log("⏭️ Skipped medical follow-up — no diagnosis found.");
          return;
        }

        const interval =
          mainGroup === "dental" ? 180 : followUpRules[mainGroup];
        let nextDate = moment(date).add(interval, "days");
        const allowed = allowedDays[lowerService] || [1, 2, 3, 4, 5];
        while (!allowed.includes(nextDate.isoWeekday()))
          nextDate.add(1, "day");

        const reasonText =
          mainGroup === "dental"
            ? "6-month dental cleaning follow-up"
            : `Auto follow-up for ${diagnosis || mainGroup}`;

        const { rows: followUpRows } = await pool.query(
          `INSERT INTO appointments 
           (patient_id, first_name, last_name, date, time, status, service_type, reason, doctor_id, auto_generated)
           VALUES ($1,$2,$3,$4,$5,'scheduled',$6,$7,$8,true)
           RETURNING *`,
          [
            linkedPatientId,
            first_name,
            last_name,
            nextDate.format("YYYY-MM-DD"),
            "09:00:00",
            lowerService,
            reasonText,
            doctor_id || null,
          ]
        );

        const nextAppt = followUpRows[0];
        if (nextAppt && phone) {
          const rawFollowup = `🏥 Paalala mula sa MediTrack:
May naka-schedule kang follow-up appointment:
📅 ${moment(nextAppt.date).format("MMMM D, YYYY")}
🕒 ${moment(nextAppt.time, "HH:mm:ss").format("h:mm A")}
🩺 Serbisyo: ${service_type.replace(/-/g, " ").toUpperCase()}`;

          const smsMsg = cleanSMS(rawFollowup);
          await sendSMS(phone, smsMsg);
        }
      }
    } catch (autoErr) {
      console.warn("⚠️ Auto-follow-up skipped:", autoErr.message);
    }

    res.json(appointment);
  } catch (err) {
    console.error("Appointments POST error:", err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   ✏️ PUT — Update Appointment
   ========================================================= */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, reason, date, time, status, service_type } =
      req.body;

    const fields = [];
    const values = [];

    if (first_name) {
      fields.push("first_name = $" + (fields.length + 1));
      values.push(first_name);
    }
    if (last_name) {
      fields.push("last_name = $" + (fields.length + 1));
      values.push(last_name);
    }
    if (reason) {
      fields.push("cancel_reason = $" + (fields.length + 1));
      values.push(reason);
    }
    if (date) {
      fields.push("date = $" + (fields.length + 1));
      values.push(date);
    }
    if (time) {
      fields.push("time = $" + (fields.length + 1));
      values.push(time);
    }
    if (status) {
      fields.push("status = $" + (fields.length + 1));
      values.push(status);
    }
    if (service_type) {
      fields.push("service_type = $" + (fields.length + 1));
      values.push(service_type);
    }

    if (!fields.length)
      return res.status(400).json({ error: "No fields to update" });

    values.push(id);
    const query = `UPDATE appointments SET ${fields.join(
      ", "
    )} WHERE id=$${values.length} RETURNING *`;

    const { rows } = await pool.query(query, values);
    if (rows.length === 0)
      return res.status(404).json({ error: "Appointment not found" });

    const updated = rows[0];

    // If status was explicitly set to "missed", and this belongs to a series,
    // automatically create a new appointment after the configured interval.
    if (status && status.toLowerCase() === "missed") {
      await autoRescheduleIfMissed(updated);
    }

    res.json(updated);
  } catch (err) {
    console.error("Appointments PUT error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✏️ PUT — Update Follow-Up Appointment (Manual Adjustment by Staff)
router.put("/:id/followup", async (req, res) => {
  try {
    const { id } = req.params;
    const { new_date, new_time } = req.body;

    if (!new_date || !new_time)
      return res.status(400).json({ error: "New date and time required" });

    const { rows } = await pool.query(
      "SELECT * FROM appointments WHERE id=$1",
      [id]
    );
    if (!rows.length)
      return res.status(404).json({ error: "Appointment not found" });

    const appt = rows[0];

    // 👇 New flags
    const isSeriesSlot = !!appt.series_id;
    const isAutoFollowup = !!appt.auto_generated;

    if (!isAutoFollowup && !isSeriesSlot) {
      return res.status(400).json({
        error: "Only auto-generated follow-ups or series sessions can be modified.",
      });
    }

    const lowerService = appt.service_type.toLowerCase();
    const mainGroup =
      Object.keys(serviceGroups).find((g) =>
        serviceGroups[g].includes(lowerService)
      ) || lowerService;

    const oldDate = moment(appt.date);
    const newDateMoment = moment(new_date, "YYYY-MM-DD");
    const diffDays = Math.abs(newDateMoment.diff(oldDate, "days"));

    // 🔢 Base rules for auto-followups
    const baseAdjustments = {
      medical: 7,
      dental: 14,
      pt: 1,
      tb: 2,
      vax: 0, // vaccine should follow exact schedule
    };

    let limitDays;

    // 🧩 If this is part of a series and we have an interval, use that
    if (isSeriesSlot && appt.series_interval_days) {
      // allow moving within one interval (capped to 30 days just to be safe)
      limitDays = Math.min(appt.series_interval_days, 30);
    } else {
      limitDays = baseAdjustments[mainGroup] ?? 7;
    }

    // still block vaccine auto follow-ups from being changed
    if (!isSeriesSlot && limitDays === 0) {
      return res.status(400).json({
        error: `Follow-up for ${mainGroup} cannot be moved (vaccine schedule must be exact).`,
      });
    }

    if (diffDays > limitDays) {
      return res.status(400).json({
        error: `This appointment can only be moved within ±${limitDays} day(s).`,
      });
    }

    // ✅ Update allowed
    const update = await pool.query(
      `UPDATE appointments 
       SET date=$1, time=$2, auto_generated=false
       WHERE id=$3 RETURNING *`,
      [new_date, new_time, id]
    );

    res.json({ success: true, updated: update.rows[0] });
  } catch (err) {
    console.error("Follow-up update error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================================================
   ❌ DELETE — Cancel Appointment + Auto-Follow-Up Cleanup
   ========================================================= */
router.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { reason, cancelled_by } = req.body;

    await client.query("BEGIN");

    // 🧠 Find the appointment first
    const { rows: apptRows } = await client.query(
      "SELECT * FROM appointments WHERE id=$1 LIMIT 1",
      [id]
    );

    if (apptRows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Appointment not found" });
    }

    const appt = apptRows[0];

    // 🧾 Delete the main appointment
    await client.query("DELETE FROM appointments WHERE id=$1", [id]);

    // 🚮 Delete any auto-generated follow-ups linked to this
    const delFollowUp = await client.query(
      `DELETE FROM appointments
       WHERE patient_id = $1
         AND LOWER(service_type) = LOWER($2)
         AND auto_generated = true
         AND (
           (vaccine_name IS NOT NULL AND vaccine_name = $3)
           OR (vaccine_name IS NULL)
         )`,
      [appt.patient_id, appt.service_type, appt.vaccine_name || null]
    );

    await client.query("COMMIT");

    console.log(
      `🗑️ Appointment ${id} deleted. Removed ${delFollowUp.rowCount} follow-up(s).`
    );

    res.json({
      success: true,
      message: `Appointment deleted with ${delFollowUp.rowCount} follow-ups.`,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Appointments DELETE error:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

module.exports = router;
