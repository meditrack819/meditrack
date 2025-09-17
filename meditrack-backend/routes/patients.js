// routes/patients.js
const express = require("express");
const router = express.Router();
const { pool } = require("../db");

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

/* ---------------- Supabase Admin ---------------- */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "⚠️ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing. Auth actions will be skipped when creating patients with email."
  );
}
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
      params.push(name.trim());
      where = `WHERE CONCAT_WS(' ', first_name, last_name) ILIKE '%' || $1 || '%'`;
    }

    const q = `
      SELECT
        id,
        CONCAT_WS(' ', first_name, last_name) AS name,
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
      name: r.name ? titleCase(r.name) : null,
      email: r.email || "",
      phone: r.phone || "",
      age: r.age || null,
      lastVisit: r.last_visit || null,
    }));

    res.json(patients);
  } catch (err) {
    console.error("❌ fetch patients:", err);
    res.status(500).json({ error: err.message });
  }
});

/** GET ONE patient */
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, middle_name, last_name, email, phone,
              birthdate, sex, building_no, street, barangay, city, last_visit, created_at, photo_url, user_id
       FROM patients WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "Patient not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("❌ fetch patient:", err);
    res.status(500).json({ error: err.message });
  }
});

// ... keep your CREATE, UPDATE, DELETE as before ...
// (I only modified the GET /patients to return the right shape)

module.exports = router;
