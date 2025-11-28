// backend/routes/reports.js
const express = require("express");
const router = express.Router();
const { pool } = require("../db");

/* =========================================================
   📅 APPOINTMENTS REPORT
   GET /api/reports/appointments
========================================================= */
router.get("/appointments", async (req, res) => {
  try {
    const { start_date, end_date, service_type, doctor_id } = req.query;

    const params = [];
    const where = [];

    if (start_date) {
      params.push(start_date);
      where.push(`a.date >= $${params.length}`);
    }
    if (end_date) {
      params.push(end_date);
      where.push(`a.date <= $${params.length}`);
    }
    if (service_type && service_type !== "all") {
      params.push(service_type);
      where.push(`a.service_type = $${params.length}`);
    }
    if (doctor_id) {
      params.push(doctor_id);
      where.push(`a.doctor_id = $${params.length}`);
    }

    let sql = `
      SELECT 
        a.date,
        a.time,
        a.status,
        a.reason,
        a.service_type,
        p.first_name,
        p.last_name,
        d.name AS doctor_name
      FROM appointments a
      LEFT JOIN patients p ON p.id = a.patient_id
      LEFT JOIN doctors d  ON d.id = a.doctor_id
    `;

    if (where.length) {
      sql += " WHERE " + where.join(" AND ");
    }

    sql += " ORDER BY a.date, a.time";

    const { rows } = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) {
    console.error("❌ /reports/appointments error:", err);
    return res
      .status(500)
      .json({ error: "Failed to load appointments report" });
  }
});

/* =========================================================
   💊 PRESCRIPTIONS REPORT
   GET /api/reports/prescriptions
   - Uses real columns from prescriptions
   - Joins via patients.user_id (your FK)
========================================================= */
router.get("/prescriptions", async (req, res) => {
  try {
    const { start_date, end_date, service_type } = req.query;
    const params = [];
    const where = [];

    if (start_date) {
      params.push(start_date);
      where.push(`pr.start_date >= $${params.length}`);
    }
    if (end_date) {
      params.push(end_date);
      where.push(`pr.start_date <= $${params.length}`);
    }

    // optional: filter by service_type if you ever need it
    if (service_type && service_type !== "all") {
      params.push(service_type);
      where.push(`pr.service_type = $${params.length}`);
    }

    let sql = `
      SELECT
        pr.start_date,                            -- date of prescription
        pr.diagnosis,                             -- from prescriptions table
        pr.medication_name,
        pr.total_quantity AS prescribed_qty,      -- map to what frontend expects
        0::integer AS dispensed_qty,              -- placeholder for now
        p.first_name,
        p.last_name
      FROM prescriptions pr
      LEFT JOIN patients p 
        ON p.user_id = pr.patient_id              -- correct join
    `;

    if (where.length) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY pr.start_date DESC";

    const { rows } = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) {
    console.error("❌ /reports/prescriptions error:", err);
    return res
      .status(500)
      .json({ error: "Failed to load prescriptions report" });
  }
});

/* =========================================================
   👩‍⚕️ PATIENTS REPORT
   GET /api/reports/patients
========================================================= */
router.get("/patients", async (_req, res) => {
  const sql = `
    SELECT
      first_name,
      last_name,
      email,
      phone,
      city,
      barangay,
      NULL::text AS diagnosis
    FROM patients
    ORDER BY last_name, first_name
  `;

  try {
    const { rows } = await pool.query(sql);
    return res.json(rows);
  } catch (err) {
    console.error("❌ /reports/patients error:", err.message || err);
    return res.json([]); // keep UI safe
  }
});

/* =========================================================
   🩺 DOCTOR AVAILABILITY REPORT
   GET /api/reports/availability
========================================================= */
router.get("/availability", async (req, res) => {
  try {
    const { start_date, end_date, service_type, doctor_id } = req.query;
    const params = [];
    const where = [];

    if (start_date) {
      params.push(start_date);
      where.push(`da.date >= $${params.length}`);
    }
    if (end_date) {
      params.push(end_date);
      where.push(`da.date <= $${params.length}`);
    }
    if (service_type && service_type !== "all") {
      params.push(service_type);
      where.push(`d.service_type = $${params.length}`);
    }
    if (doctor_id) {
      params.push(doctor_id);
      where.push(`da.doctor_id = $${params.length}`);
    }

    let sql = `
  SELECT
    da.date,
    da.start_time,
    da.end_time,

    -- 🔍 Normalize status for reporting:
    -- If status is "Available" BUT reason says "Unavailable" or "Blocked",
    -- treat it as Unavailable in the report.
    CASE
      WHEN LOWER(COALESCE(da.status, '')) = 'available'
           AND LOWER(COALESCE(da.reason, '')) LIKE '%unavailable%'
        THEN 'Unavailable'
      WHEN LOWER(COALESCE(da.status, '')) = 'available'
           AND LOWER(COALESCE(da.reason, '')) LIKE '%blocked%'
        THEN 'Blocked'
      ELSE da.status
    END AS status,

    da.reason,
    d.name AS doctor_name,
    d.service_type
  FROM doctor_availability da
  LEFT JOIN doctors d ON d.id = da.doctor_id
`;


    if (where.length) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY da.date, da.start_time";

    const { rows } = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) {
    console.error("❌ /reports/availability error:", err);
    return res
      .status(500)
      .json({ error: "Failed to load availability report" });
  }
});

/* =========================================================
   📦 STOCK REPORT
   GET /api/reports/stock
========================================================= */
router.get("/stock", async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const params = [];
    const where = [];

    if (start_date) {
      params.push(start_date);
      where.push(`last_updated::date >= $${params.length}`);
    }
    if (end_date) {
      params.push(end_date);
      where.push(`last_updated::date <= $${params.length}`);
    }

    let sql = `
      SELECT
        medicine_name,
        quantity,
        expiration_date,
        last_updated,
        reorder_level
      FROM stock_inventory
    `;

    if (where.length) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY LOWER(medicine_name)";


    const { rows } = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) {
    console.error("❌ /reports/stock error:", err);
    return res.status(500).json({ error: "Failed to load stock report" });
  }
});

/* =========================================================
   👨‍⚕️ DOCTORS REPORT
   GET /api/reports/doctors
========================================================= */
router.get("/doctors", async (_req, res) => {
  try {
    const sql = `
      SELECT
        id,
        name,
        specialization,
        contact
      FROM doctors
      ORDER BY name
    `;
    const { rows } = await pool.query(sql);
    return res.json(rows);
  } catch (err) {
    console.error("❌ /reports/doctors error:", err);
    return res.status(500).json({ error: "Failed to load doctors report" });
  }
});

module.exports = router;
