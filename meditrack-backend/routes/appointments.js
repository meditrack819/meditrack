// backend/routes/appointments.js
const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const moment = require("moment");

/* ---------- Config ---------- */
const allowedDays = {
  "medical-general": [1, 2, 3, 4, 5],
  "medical-buntis": [4],
  "dental-bunot": [1, 5],
  "dental-pasta": [2, 3],
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

// Map main service → sub-services
const serviceGroups = {
  medical: ["medical-general", "medical-buntis"],
  dental: ["dental-bunot", "dental-pasta", "dental-buntis"],
  vax: ["vax-children", "vax-adult"],
  pt: ["pt"],
  tb: ["tb"],
};

/* ---------- Get appointments (optionally by date & service_type) ---------- */
router.get("/", async (req, res) => {
  try {
    const { date, service_type, role } = req.query;
    let query = "SELECT * FROM appointments WHERE 1=1";
    const params = [];

    if (date) {
      params.push(date);
      query += ` AND date = $${params.length}`;
    }

    if (service_type && role?.toLowerCase() !== "superadmin") {
      const st = service_type.toLowerCase();
      if (serviceGroups[st]) {
        // main service → expand to all sub-services
        query += ` AND LOWER(service_type) = ANY($${params.length + 1})`;
        params.push(serviceGroups[st]);
      } else {
        params.push(st);
        query += ` AND LOWER(service_type) = $${params.length}`;
      }
    }

    query += " ORDER BY date, time";
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Appointments GET error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------- Day Map (for calendar coloring) ---------- */
router.get("/day-map", async (req, res) => {
  try {
    const { start, end, service_type, role } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: "Missing start or end date" });
    }

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

    const map = rows.map((r) => ({
      date: moment(r.date).format("YYYY-MM-DD"),
      bookedCount: r.booked_count,
    }));

    res.json(map);
  } catch (err) {
    console.error("Appointments DayMap error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------- Create appointment ---------- */
router.post("/", async (req, res) => {
  try {
    let {
      patient_id,
      reason,
      first_name,
      last_name,
      date,
      time,
      status,
      service_type,
    } = req.body;

    if (!date || !time || !service_type) {
      return res
        .status(400)
        .json({ error: "Missing required fields: date, time, service_type" });
    }

    const serviceKey = service_type.toLowerCase();
    const dayOfWeek = moment(date).isoWeekday();

    // ✅ Check allowed weekdays
    if (allowedDays[serviceKey] && !allowedDays[serviceKey].includes(dayOfWeek)) {
      return res
        .status(400)
        .json({ error: "This service is not available on that date" });
    }

    // ✅ Normalize time
    const timeSQL = moment(time, ["HH:mm:ss", "HH:mm"]).format("HH:mm:ss");

    // ✅ Check for duplicate booking
    const conflict = await pool.query(
      `SELECT * FROM appointments 
       WHERE date = $1 AND time = $2 AND LOWER(service_type) = $3`,
      [date, timeSQL, serviceKey]
    );
    if (conflict.rows.length > 0) {
      return res.status(400).json({ error: "This slot is already booked" });
    }

    // ✅ Insert
    const { rows } = await pool.query(
      `INSERT INTO appointments 
        (patient_id, reason, first_name, last_name, date, time, status, service_type) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) 
       RETURNING *`,
      [
        patient_id || null,
        reason || null,
        first_name || null,
        last_name || null,
        date,
        timeSQL,
        status || "scheduled",
        serviceKey,
      ]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("Appointments POST error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------- Update appointment ---------- */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let { first_name, last_name, reason, date, time, status, service_type } =
      req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    if (first_name) {
      fields.push(`first_name = $${idx++}`);
      values.push(first_name);
    }
    if (last_name) {
      fields.push(`last_name = $${idx++}`);
      values.push(last_name);
    }
    if (reason) {
      fields.push(`reason = $${idx++}`);
      values.push(reason);
    }
    if (date) {
      fields.push(`date = $${idx++}`);
      values.push(date);
    }
    if (time) {
      const timeSQL = moment(time, ["HH:mm:ss", "HH:mm"]).format("HH:mm:ss");
      fields.push(`time = $${idx++}`);
      values.push(timeSQL);
    }
    if (status) {
      fields.push(`status = $${idx++}`);
      values.push(status);
    }
    if (service_type) {
      fields.push(`service_type = $${idx++}`);
      values.push(service_type.toLowerCase());
    }

    if (!fields.length) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE appointments SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Appointments PUT error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------- Delete appointment ---------- */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query(
      "DELETE FROM appointments WHERE id = $1",
      [id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Appointments DELETE error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
