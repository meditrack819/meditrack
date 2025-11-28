// backend/routes/availability.js
const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const moment = require("moment");
const { sendSMS } = require("../utils/sms");

/* =========================================================
   📅 GET — All blocked times for an entire service (optionally by doctor)
   ========================================================= */
router.get("/service/:serviceType", async (req, res) => {
  try {
    const { serviceType } = req.params;
    const { doctor_id } = req.query;

    // Flexible doctor lookup
    const doctorQuery = doctor_id
      ? "SELECT id FROM doctors WHERE id = $1"
      : "SELECT id FROM doctors WHERE LOWER(service_type) LIKE LOWER($1 || '%')";
    const doctorParams = doctor_id ? [doctor_id] : [serviceType];
    const doctorRes = await pool.query(doctorQuery, doctorParams);

    if (doctorRes.rowCount === 0) return res.json({ blockedTimes: [] });

    const doctorIds = doctorRes.rows.map((r) => r.id);

    const result = await pool.query(
      `SELECT id, doctor_id, date, start_time, end_time, reason
       FROM doctor_availability
       WHERE doctor_id = ANY($1::uuid[])
         AND reason IS NOT NULL
         AND TRIM(reason) <> ''
       ORDER BY date, start_time`,
      [doctorIds]
    );

    const blocks = result.rows.map((r) => ({
      ...r,
      date: moment(r.date).format("YYYY-MM-DD"),
      start_time: r.start_time?.toString().slice(0, 5),
      end_time: r.end_time?.toString().slice(0, 5),
    }));

    res.json({ blockedTimes: blocks });
  } catch (err) {
    console.error("❌ Error fetching service availability:", err);
    res.status(500).json({ error: "Failed to load service-level availability" });
  }
});

/* =========================================================
   🩺 GET — Doctor availability (works for both web + mobile)
   ========================================================= */
router.get("/doctor/:doctorId", async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { view } = req.query;

    const result = await pool.query(
      `SELECT id, doctor_id, date, start_time, end_time, reason
       FROM doctor_availability
       WHERE doctor_id = $1
       ORDER BY date ASC, start_time ASC`,
      [doctorId]
    );

    if (result.rowCount === 0)
      return res.json(view === "mobile" ? { doctorId, schedule: [] } : []);

    if (view === "mobile") {
      const formatted = result.rows.map((r) => ({
        date: moment(r.date).format("YYYY-MM-DD"),
        weekday: moment(r.date).format("dddd"),
        start_time: r.start_time?.toString().slice(0, 5),
        end_time: r.end_time?.toString().slice(0, 5),
        reason: r.reason || null,
      }));

      const days = [...new Set(formatted.map((r) => r.weekday))];
      return res.json({ doctorId, days, schedule: formatted });
    }

    const unavailable = result.rows
      .filter((r) => r.reason && r.reason.trim() !== "")
      .map((r) => ({
        id: r.id,
        doctor_id: r.doctor_id,
        date: moment(r.date).format("YYYY-MM-DD"),
        start_time: r.start_time?.toString().slice(0, 5),
        end_time: r.end_time?.toString().slice(0, 5),
        reason: r.reason || "Unavailable",
      }));

    res.json(unavailable);
  } catch (err) {
    console.error("❌ Error fetching doctor availability:", err.message);
    res.status(500).json({ error: "Failed to load doctor availability" });
  }
});

/* =========================================================
   🚫 POST — Block a doctor’s time
      - Normal: reject if there are appointments
      - Emergency (force=true): cancel appointments + SMS
   ========================================================= */
router.post("/", async (req, res) => {
  console.log("📥 Incoming body:", req.body);

  try {
    const { doctor_id, date, start_time, end_time, reason, force } = req.body;

    if (!doctor_id || !date || !start_time || !end_time)
      return res.status(400).json({ error: "Missing required fields" });

    // 🔄 Normalize date/time
    const dateStr = moment(date, ["YYYY-MM-DD"]).format("YYYY-MM-DD");
    const startSQL = moment(start_time, ["HH:mm", "HH:mm:ss"]).format("HH:mm:ss");
    const endSQL = moment(end_time, ["HH:mm", "HH:mm:ss"]).format("HH:mm:ss");

    let conflicts = { rowCount: 0, rows: [] };

    // 🔍 Check for overlapping appointments in that window
    try {
      conflicts = await pool.query(
        `
        SELECT 
          a.id,
          a.first_name,
          a.last_name,
          a.time,
          d.name AS doctor_name,
          p.phone
        FROM appointments a
        LEFT JOIN doctors d   ON a.doctor_id = d.id
        LEFT JOIN patients p  ON a.patient_id = p.id
        WHERE a.doctor_id = $1
          AND a.date      = $2
          AND a.time     >= $3
          AND a.time     <  $4
          AND a.status    = 'scheduled'
        `,
        [doctor_id, dateStr, startSQL, endSQL]
      );
      console.log(
        `🔎 Conflict check for doctor ${doctor_id} on ${dateStr} ${startSQL}–${endSQL}:`,
        conflicts.rowCount,
        "row(s)"
      );
    } catch (conflictErr) {
      console.error("❌ Conflict lookup failed:", conflictErr.message);
      return res
        .status(500)
        .json({ error: "Failed to check existing appointments." });
    }

    // 🟢 NORMAL MODE: block only if there are NO appointments
    if (!force && conflicts.rowCount > 0) {
      return res.status(400).json({
        error: `Cannot block ${startSQL}–${endSQL}. There are ${conflicts.rowCount} appointment(s) already booked.`,
        conflicts: conflicts.rows,
      });
    }

    // 🧱 Insert the blocked time
    const { rows: blockRows } = await pool.query(
      `INSERT INTO doctor_availability
         (doctor_id, date, start_time, end_time, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [doctor_id, dateStr, startSQL, endSQL, reason || "Doctor unavailable"]
    );

    console.log(
      `📅 Blocked Doctor ${doctor_id} on ${dateStr} from ${startSQL}–${endSQL} (force=${!!force})`
    );

    // 🔴 EMERGENCY MODE: cancel overlapping appointments + SMS
    if (force && conflicts.rowCount > 0) {
      try {
        // ❌ Mark overlapping appointments as cancelled
        await pool.query(
          `UPDATE appointments
             SET status = 'cancelled',
                 cancel_reason = $5
           WHERE doctor_id = $1
             AND date      = $2
             AND time     >= $3
             AND time     <  $4
             AND status    = 'scheduled'`,
          [
            doctor_id,
            dateStr,
            startSQL,
            endSQL,
            `Doctor unavailable: ${reason || "Schedule conflict"}`,
          ]
        );

        // 📱 Try SMS for each affected appointment
        for (const appt of conflicts.rows) {
          if (!appt.phone) continue;

          const smsMessage = `
Magandang araw ${appt.first_name} ${appt.last_name}!

Ang iyong appointment kay Dr. ${appt.doctor_name || ""} sa ${moment(
            dateStr
          ).format("MMMM D, YYYY")} ${moment(appt.time, "HH:mm:ss").format(
            "h:mm A"
          )} ay nakansela dahil: "${reason || "Doctor unavailable"}".

Makipag-ugnayan sa health center para sa bagong schedule.

- MediTrack Clinic`;

          try {
            await sendSMS(appt.phone, smsMessage);
            console.log(`📲 SMS sent to ${appt.first_name} (${appt.phone})`);
          } catch (smsErr) {
            console.warn(
              `⚠️ SMS send failed for ${appt.phone}: ${smsErr.message}`
            );
          }
        }
      } catch (cancelErr) {
        console.warn("⚠️ Skipping cancel logic:", cancelErr.message);
      }
    }

    // ✅ Always respond success if we reached here
    return res.json({
      success: true,
      message: force
        ? "Doctor time blocked. Conflicting appointments were cancelled."
        : "Doctor time blocked successfully (no conflicts).",
      block: blockRows[0],
      cancelled_count: force ? conflicts.rowCount || 0 : 0,
    });
  } catch (err) {
    console.error("❌ Error blocking time:", err.message);
    res.status(500).json({ error: "Failed to block time" });
  }
});

/* =========================================================
   ❌ DELETE — Remove manual blocked slot
   ========================================================= */
router.delete("/block/:doctorId/:blockId", async (req, res) => {
  try {
    const { doctorId, blockId } = req.params;
    const result = await pool.query(
      "DELETE FROM doctor_availability WHERE id = $1 AND doctor_id = $2 RETURNING *",
      [blockId, doctorId]
    );

    if (result.rowCount === 0)
      return res.status(404).json({ error: "Block not found" });

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error deleting block:", err);
    res.status(500).json({ error: "Failed to delete block" });
  }
});

/* =========================================================
   ✅ NEW — AUTO-GENERATED DOCTOR AVAILABILITY (Next 30 Days)
   ========================================================= */
router.get("/doctor/:doctorId/generated", async (req, res) => {
  try {
    const { doctorId } = req.params;

    const blocked = await pool.query(
      `SELECT date FROM doctor_availability 
       WHERE doctor_id = $1 
         AND reason IS NOT NULL 
         AND TRIM(reason) <> ''`,
      [doctorId]
    );

    const blockedDates = new Set(
      blocked.rows.map((r) => r.date.toISOString().split("T")[0])
    );

    const today = new Date();
    const available = [];

    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const weekday = d.getDay(); // 0=Sun, 6=Sat
      const dateISO = d.toISOString().split("T")[0];

      if (weekday === 0 || weekday === 6 || blockedDates.has(dateISO)) continue;

      available.push({
        date: dateISO,
        start_time: "07:00:00",
        end_time: "16:00:00",
      });
    }

    res.json(available);
  } catch (err) {
    console.error("❌ Error computing doctor availability:", err.message);
    res.status(500).json({ error: "Failed to compute doctor availability" });
  }
});

module.exports = router;
