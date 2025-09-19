// backend/routes/patients.js
const express = require("express");
const router = express.Router();
const { pool } = require("../db");

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

/* ---------------- Supabase Admin ---------------- */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

/* ---------------- helpers ---------------- */
function generatePassword() {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const a = "abcdefghijklmnopqrstuvwxyz";
  const d = "0123456789";
  const pools = [A, a, d];
  const pick = (s) => s[crypto.randomInt(0, s.length)];
  let pwd = pools.map(pick).join("");
  const all = A + a + d;
  while (pwd.length < 12) pwd += pick(all);
  return pwd
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

const toNull = (v) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "")
    ? null
    : v;

const ymdOrNull = (v) => {
  if (toNull(v) === null) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const titleCase = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();

const cleanPhone = (s) =>
  (s || "").replace(/[^\d+]/g, "").replace(/^00/, "+").trim();

/* ---------------- diagnostics ---------------- */
router.get("/_columns", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'patients'
      ORDER BY ordinal_position
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- CRUD ---------------- */

/** LIST patients */
router.get("/", async (req, res) => {
  try {
    const { name } = req.query;

    let where = "";
    let params = [];

    if (name && name.trim()) {
      params.push(`%${name.trim()}%`);
      where = `WHERE CONCAT_WS(' ', first_name, middle_name, last_name) ILIKE $1`;
    }

    const q = `
      SELECT
        id,
        first_name,
        middle_name,
        last_name,
        email,
        phone,
        COALESCE(EXTRACT(YEAR FROM age(CURRENT_DATE, birthdate))::int, NULL) AS age,
        last_visit
      FROM patients
      ${where}
      ORDER BY id ASC;
    `;
    const { rows } = await pool.query(q, params);

    const patients = rows.map((r) => ({
      id: r.id,
      first_name: titleCase(r.first_name),
      middle_name: r.middle_name ? titleCase(r.middle_name) : null,
      last_name: titleCase(r.last_name),
      email: r.email || "",
      phone: r.phone || "",
      age: r.age || null,
      last_visit: r.last_visit || null,
    }));

    res.json(patients);
  } catch (err) {
    console.error("❌ GET /patients:", err);
    res.status(500).json({ error: err.message });
  }
});

/** GET ONE patient */
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, middle_name, last_name, email, phone,
              birthdate, sex, building_no, street, barangay, city,
              last_visit, created_at, photo_url, user_id
       FROM patients WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Patient not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("❌ GET /patients/:id:", err);
    res.status(500).json({ error: err.message });
  }
});

/** CREATE patient */
router.post("/", async (req, res) => {
  const client = await pool.connect();
  let authUserId = null;
  try {
    const p = req.body || {};
    if (!p.first_name || !p.last_name) {
      return res
        .status(400)
        .json({ error: "first_name and last_name are required" });
    }

    let finalPassword = null;

    if (p.email && supabaseAdmin) {
      // create Supabase auth user
      finalPassword = generatePassword();
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: p.email,
        password: finalPassword,
        email_confirm: true,
        user_metadata: { role: "patient" },
      });
      if (error) {
        return res.status(400).json({ error: `Auth create failed: ${error.message}` });
      }
      authUserId = data.user.id;
    }

    await client.query("BEGIN");
    const insertQ = `
      INSERT INTO patients
        (first_name, middle_name, last_name, email, phone, birthdate, sex,
         building_no, street, barangay, city, last_visit, user_id ${finalPassword ? ", password" : ""})
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13 ${finalPassword ? ",$14" : ""})
      RETURNING id;
    `;
    const vals = [
      titleCase(p.first_name),
      titleCase(p.middle_name),
      titleCase(p.last_name),
      toNull(p.email),
      cleanPhone(p.phone),
      ymdOrNull(p.birthdate),
      toNull(p.sex),
      toNull(p.building_no),
      toNull(p.street),
      toNull(p.barangay),
      toNull(p.city),
      ymdOrNull(p.last_visit),
      authUserId,
    ];
    if (finalPassword) vals.push(finalPassword);

    const { rows } = await client.query(insertQ, vals);
    await client.query("COMMIT");

    res.status(201).json({
      id: rows[0].id,
      ...(finalPassword ? { email: p.email, password: finalPassword } : {}),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    if (authUserId && supabaseAdmin) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      } catch {}
    }
    console.error("❌ POST /patients:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

/** UPDATE patient */
router.put("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const p = req.body || {};

    const q = `
      UPDATE patients SET
        first_name = COALESCE($1, first_name),
        middle_name= COALESCE($2, middle_name),
        last_name  = COALESCE($3, last_name),
        email      = COALESCE($4, email),
        phone      = COALESCE($5, phone),
        birthdate  = COALESCE($6, birthdate),
        sex        = COALESCE($7, sex),
        building_no= COALESCE($8, building_no),
        street     = COALESCE($9, street),
        barangay   = COALESCE($10, barangay),
        city       = COALESCE($11, city),
        last_visit = COALESCE($12, last_visit)
      WHERE id = $13
      RETURNING *;
    `;
    const vals = [
      toNull(p.first_name),
      toNull(p.middle_name),
      toNull(p.last_name),
      toNull(p.email),
      toNull(p.phone),
      ymdOrNull(p.birthdate),
      toNull(p.sex),
      toNull(p.building_no),
      toNull(p.street),
      toNull(p.barangay),
      toNull(p.city),
      ymdOrNull(p.last_visit),
      req.params.id,
    ];

    const { rows } = await client.query(q, vals);
    if (rows.length === 0)
      return res.status(404).json({ error: "Patient not found" });

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ PUT /patients:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

/** DELETE patient */
router.delete("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM patients WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Patient not found" });

    res.json({ message: "Deleted", id: rows[0].id });
  } catch (err) {
    console.error("❌ DELETE /patients:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
