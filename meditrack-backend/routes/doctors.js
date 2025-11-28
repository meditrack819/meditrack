const express = require("express");
const router = express.Router();
const { pool } = require("../db");

/* =========================================================
   🩺 GET — All doctors (optionally filter by service_type)
   ========================================================= */
router.get("/", async (req, res) => {
  try {
    const { service_type } = req.query;

    if (!service_type) {
      const { rows } = await pool.query("SELECT * FROM doctors ORDER BY name ASC");
      return res.json(rows);
    }

    const lowerType = service_type.toLowerCase();

    // 🧠 Flexible match
    let query;
    let values;
    if (lowerType.startsWith("vax-")) {
      // Exact match for vaccination nurses
      query = "SELECT * FROM doctors WHERE LOWER(service_type) = LOWER($1) ORDER BY name ASC";
      values = [lowerType];
    } else {
      // Partial match for grouped services (medical, dental, etc.)
      query = "SELECT * FROM doctors WHERE LOWER(service_type) LIKE $1 ORDER BY name ASC";
      values = [`${lowerType}%`];
    }

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching doctors:", err);
    res.status(500).json({ error: "Failed to load doctors" });
  }
});
router.get("/", async (req, res) => {
  try {
    const { service_type } = req.query;

    if (!service_type) {
      const { rows } = await pool.query("SELECT * FROM doctors ORDER BY name ASC");
      return res.json(rows);
    }

    const lowerType = service_type.toLowerCase();

    // 🧠 Flexible match
    let query;
    let values;
    if (lowerType.startsWith("vax-")) {
      // Exact match for vaccination nurses
      query = "SELECT * FROM doctors WHERE LOWER(service_type) = LOWER($1) ORDER BY name ASC";
      values = [lowerType];
    } else {
      // Partial match for grouped services (medical, dental, etc.)
      query = "SELECT * FROM doctors WHERE LOWER(service_type) LIKE $1 ORDER BY name ASC";
      values = [`${lowerType}%`];
    }

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching doctors:", err);
    res.status(500).json({ error: "Failed to load doctors" });
  }
});


/* =========================================================
   ➕ POST — Add new doctor
   ========================================================= */
router.post("/", async (req, res) => {
  try {
    const { name, specialization, service_type, contact } = req.body;

    if (!name || !specialization || !service_type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await pool.query(
      `INSERT INTO doctors (name, specialization, service_type, contact, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [name, specialization, service_type, contact || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creating doctor:", err);
    res.status(500).json({ error: "Failed to add doctor" });
  }
});

/* =========================================================
   ❌ DELETE — Remove a doctor
   ========================================================= */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("DELETE FROM doctors WHERE id = $1 RETURNING *", [id]);

    if (result.rowCount === 0)
      return res.status(404).json({ error: "Doctor not found" });

    res.json({ message: "Doctor deleted", doctor: result.rows[0] });
  } catch (err) {
    console.error("Error deleting doctor:", err);
    res.status(500).json({ error: "Failed to delete doctor" });
  }
});

/* =========================================================
   ✏️ PUT — Update doctor
   ========================================================= */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, specialization, service_type, contact, allowed_days, is_active } = req.body;

    const result = await pool.query(
      `UPDATE doctors
       SET 
         name = COALESCE($1, name),
         specialization = COALESCE($2, specialization),
         service_type = COALESCE($3, service_type),
         contact = COALESCE($4, contact),
         allowed_days = COALESCE($5, allowed_days),
         is_active = COALESCE($6, is_active)
       WHERE id = $7
       RETURNING *`,
      [name, specialization, service_type, contact, allowed_days, is_active, id]
    );

    if (result.rowCount === 0)
      return res.status(404).json({ error: "Doctor not found" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating doctor:", err);
    res.status(500).json({ error: "Failed to update doctor" });
  }
});


module.exports = router;
