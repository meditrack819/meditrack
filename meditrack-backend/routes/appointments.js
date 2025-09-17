// routes/appointments.js
const express = require("express");
const router = express.Router();
const moment = require("moment");
const { pool } = require("../db");

// ---- Config (must match frontend) ----
const SLOT_MINUTES = 30;
const OPEN_HOUR = 8;   // 08:00
const CLOSE_HOUR = 17; // last start 16:30
const SLOTS_PER_DAY = ((CLOSE_HOUR - OPEN_HOUR) * 60) / SLOT_MINUTES; // 18

const isWeekend = (ds) => {
  const dow = moment(ds, "YYYY-MM-DD", true).isoWeekday(); // 1..7
  return dow === 6 || dow === 7;
};

const isUUID = (s) =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

const isNumericId = (v) => (typeof v === "string" ? /^\d+$/.test(v) : Number.isInteger(v));

// Lookup a display name from patients by numeric id
async function getPatientNameByNumericId(numericId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(name, NULLIF(TRIM(CONCAT(first_name,' ',last_name)),'')) AS display_name
     FROM patients
     WHERE id = $1
     LIMIT 1`,
    [numericId]
  );
  return rows[0]?.display_name || null;
}

/* ========== GET /appointments (list) ========== 
   No JOIN (patient_id is UUID; patients has only int id). Always return patient_name as stored. */
router.get("/", async (req, res) => {
  try {
    const { start, end } = req.query;
    const params = [];
    const where = [];

    if (start) { params.push(start); where.push(`date >= $${params.length}`); }
    if (end)   { params.push(end);   where.push(`date <= $${params.length}`); }

    const sql = `
      SELECT id, patient_id, patient_name, reason, date, time, status
      FROM appointments
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY date ASC, time ASC
    `;
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error("GET /appointments error:", e);
    res.status(500).json({ error: e.message });
  }
});

/* ========== GET /appointments/day-map ========== */
router.get("/day-map", async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: "start and end are required (YYYY-MM-DD)" });

    const aggSql = `
      SELECT date::date, COUNT(*)::int AS count
      FROM appointments
      WHERE date BETWEEN $1 AND $2
      GROUP BY date
    `;
    const { rows: agg } = await pool.query(aggSql, [start, end]);

    const { rows: closures } = await pool.query(
      `SELECT date::date, is_closed FROM day_closures WHERE date BETWEEN $1 AND $2`,
      [start, end]
    );

    const map = {};
    let cursor = moment(start, "YYYY-MM-DD");
    const limit = moment(end, "YYYY-MM-DD");
    while (cursor.isSameOrBefore(limit, "day")) {
      const ds = cursor.format("YYYY-MM-DD");
      map[ds] = {
        date: ds,
        bookedCount: 0,
        isClosed: isWeekend(ds),
        isWeekend: isWeekend(ds),
      };
      cursor.add(1, "day");
    }

    agg.forEach((r) => {
      const ds = moment(r.date).format("YYYY-MM-DD");
      if (!map[ds]) {
        map[ds] = { date: ds, bookedCount: 0, isClosed: isWeekend(ds), isWeekend: isWeekend(ds) };
      }
      map[ds].bookedCount = r.count;
    });

    closures.forEach((r) => {
      const ds = moment(r.date).format("YYYY-MM-DD");
      if (!map[ds]) {
        map[ds] = { date: ds, bookedCount: 0, isClosed: isWeekend(ds), isWeekend: isWeekend(ds) };
      }
      if (r.is_closed) map[ds].isClosed = true;
    });

    Object.values(map).forEach((d) => {
      d.isFull = d.isClosed || d.bookedCount >= SLOTS_PER_DAY;
    });

    res.json(Object.values(map));
  } catch (e) {
    console.error("GET /appointments/day-map error:", e);
    res.status(500).json({ error: e.message });
  }
});

/* ========== POST /appointments (create) ========== 
   Accepts:
   - patient_name (preferred)
   - patient_id: if UUID, store it; if numeric, use it ONLY to look up a name (do NOT store in UUID column)
*/
router.post("/", async (req, res) => {
  try {
    const { patient_id, patient_name, reason, date, time } = req.body;

    if (!date || !time) {
      return res.status(400).json({ error: "date and time are required" });
    }
    if (isWeekend(date)) {
      return res.status(400).json({ error: "No clinic hours on weekends." });
    }

    // Build final patient_name
    let finalPatientName = (patient_name && String(patient_name).trim()) || null;

    // Decide what to store in patient_id (UUID column) safely
    let patientUUID = null;
    if (typeof patient_id === "string" && patient_id.trim()) {
      const pid = patient_id.trim();
      if (isUUID(pid)) {
        // valid uuid → store in column
        patientUUID = pid;
      } else if (isNumericId(pid)) {
        // numeric → use to lookup display name, but DO NOT store in uuid column
        const lookedUp = await getPatientNameByNumericId(parseInt(pid, 10));
        if (!finalPatientName && lookedUp) finalPatientName = lookedUp;
      }
    }

    // Closed day?
    const { rows: c } = await pool.query(
      `SELECT 1 FROM day_closures WHERE date = $1 AND is_closed = true LIMIT 1`,
      [date]
    );
    if (c.length) return res.status(400).json({ error: "Day is closed." });

    // Conflict?
    const { rows: conflict } = await pool.query(
      `SELECT 1 FROM appointments WHERE date = $1 AND time = $2 LIMIT 1`,
      [date, time]
    );
    if (conflict.length) return res.status(409).json({ error: "Time slot already taken." });

    const insertSql = `
      INSERT INTO appointments (patient_id, patient_name, reason, date, time, status)
      VALUES ($1::uuid, $2, $3, $4, $5, 'scheduled')
      RETURNING id, patient_id, patient_name, reason, date, time, status
    `;
    const { rows } = await pool.query(insertSql, [
      patientUUID,                 // can be NULL; cast is safe on NULL
      finalPatientName || null,
      reason || null,
      date,
      time,
    ]);

    res.json(rows[0]);
  } catch (e) {
    console.error("POST /appointments error:", e);
    res.status(500).json({ error: e.message });
  }
});

/* ========== PUT /appointments/:id (edit + attendance) ========== 
   Accepts any subset of: { patient_name, patient_id, reason, date, time, status, attended, missed }
   Rules:
   - If changing date/time: block weekends/closed days and conflicts (excluding self).
   - Only store UUID in appointments.patient_id; numeric patient_id is used for last_visit updates / name lookup.
   - If status='attended' OR attended===true => update patients.last_visit to the appointment date when a numeric patient id is provided.
*/
router.put("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const apptId = req.params.id;
    const {
      patient_id,
      patient_name,
      reason,
      date,
      time,
      status,
      attended,
      missed,
    } = req.body || {};

    // Fetch existing appointment
    const { rows: exRows } = await client.query(
      `SELECT id, patient_id, patient_name, reason, date, time, status
       FROM appointments WHERE id = $1`,
      [apptId]
    );
    if (!exRows.length) return res.status(404).json({ error: "Appointment not found" });
    const existing = exRows[0];

    // Determine final values (only set if provided)
    let nextDate = date ?? existing.date;
    let nextTime = time ?? existing.time;

    // Validate date/time if changed
    if (date || time) {
      if (!nextDate || !nextTime) {
        return res.status(400).json({ error: "Both date and time are required when changing schedule." });
      }
      if (isWeekend(nextDate)) {
        return res.status(400).json({ error: "No clinic hours on weekends." });
      }

      const { rows: closed } = await client.query(
        `SELECT 1 FROM day_closures WHERE date = $1 AND is_closed = true LIMIT 1`,
        [nextDate]
      );
      if (closed.length) return res.status(400).json({ error: "Day is closed." });

      const { rows: conflict } = await client.query(
        `SELECT 1 FROM appointments WHERE date = $1 AND time = $2 AND id <> $3 LIMIT 1`,
        [nextDate, nextTime, apptId]
      );
      if (conflict.length) return res.status(409).json({ error: "Time slot already taken." });
    }

    // Determine name and UUID for patient
    let finalPatientName = (typeof patient_name === "string" ? patient_name.trim() : null);
    let patientUUID = null;
    let numericPatientId = null;

    if (typeof patient_id === "string" && patient_id.trim()) {
      const pid = patient_id.trim();
      if (isUUID(pid)) {
        patientUUID = pid;
      } else if (isNumericId(pid)) {
        numericPatientId = parseInt(pid, 10);
        if (!finalPatientName) {
          const looked = await getPatientNameByNumericId(numericPatientId);
          if (looked) finalPatientName = looked;
        }
      }
    }

    // Attendance → status normalization
    let nextStatus = status || existing.status || "scheduled";
    if (attended === true) nextStatus = "attended";
    else if (missed === true) nextStatus = "missed";

    await client.query("BEGIN");

    // Build dynamic UPDATE
    const fields = [];
    const vals = [];
    const push = (sqlFrag, v) => { fields.push(sqlFrag); vals.push(v); };

    if (finalPatientName !== null) push(`patient_name = $${vals.length + 1}`, finalPatientName);
    if (date) push(`date = $${vals.length + 1}`, nextDate);
    if (time) push(`time = $${vals.length + 1}`, nextTime);
    if (typeof reason === "string") push(`reason = $${vals.length + 1}`, reason || null);
    if (nextStatus) push(`status = $${vals.length + 1}`, nextStatus);

    // Only set patient_id column when a UUID is provided explicitly
    if (patientUUID) push(`patient_id = $${vals.length + 1}::uuid`, patientUUID);

    if (!fields.length) {
      // nothing to update; return existing row
      await client.query("ROLLBACK");
      return res.json(existing);
    }

    const updateSql = `
      UPDATE appointments
      SET ${fields.join(", ")}
      WHERE id = $${vals.length + 1}
      RETURNING id, patient_id, patient_name, reason, date, time, status
    `;
    vals.push(apptId);

    const { rows: updatedRows } = await client.query(updateSql, vals);
    const updated = updatedRows[0];

    // If attended → update patient's last_visit (only when numeric patient id is provided)
    if (nextStatus === "attended" && (numericPatientId || isNumericId(req.body?.patient_numeric_id))) {
      const patientNumeric = numericPatientId || parseInt(req.body.patient_numeric_id, 10);
      if (Number.isInteger(patientNumeric)) {
        await client.query(
          `UPDATE patients SET last_visit = $1 WHERE id = $2`,
          [updated.date, patientNumeric]
        );
      }
    }

    await client.query("COMMIT");
    res.json(updated);
  } catch (e) {
    await pool.query("ROLLBACK").catch(()=>{});
    console.error("PUT /appointments/:id error:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ---------- DELETE /appointments/:id ----------
router.delete("/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM appointments WHERE id = $1`, [req.params.id]);
    res.json({ deleted: rowCount });
  } catch (e) {
    console.error("DELETE /appointments/:id error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- POST /appointments/toggle-day ----------
router.post("/toggle-day", async (req, res) => {
  try {
    const { date, close } = req.body;
    if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });

    if (close) {
      await pool.query(
        `INSERT INTO day_closures (date, is_closed)
         VALUES ($1, true)
         ON CONFLICT (date) DO UPDATE SET is_closed = EXCLUDED.is_closed`,
        [date]
      );
    } else {
      await pool.query(`DELETE FROM day_closures WHERE date = $1`, [date]);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("POST /appointments/toggle-day error:", e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
