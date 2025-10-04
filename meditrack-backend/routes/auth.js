// backend/routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

/* -----------------------------------------------------
   🧪 Test Route — confirms /api/auth/test works
----------------------------------------------------- */
router.get("/test", (req, res) => {
  res.json({ message: "✅ Auth route working fine" });
});

/* -----------------------------------------------------
   🔑 Helper — JWT generator
----------------------------------------------------- */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role || "staff",
      service_type: user.service_type || null,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

/* =====================================================
   👥 STAFF AUTH
   ===================================================== */

/* ---------- Staff Register ---------- */
router.post("/staff/register", async (req, res) => {
  try {
    const { name, email, password, service_type, role } = req.body;

    if (!name || !email || !password || !service_type) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existing = await pool.query("SELECT * FROM staff WHERE email = $1", [
      email.toLowerCase(),
    ]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO staff (name, email, password, service_type, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, service_type, role`,
      [name, email.toLowerCase(), hashed, service_type, role || "staff"]
    );

    const user = rows[0];
    const token = generateToken(user);
    return res.json({ success: true, token, user });
  } catch (err) {
    console.error("❌ Staff register error:", err);
    return res
      .status(500)
      .json({ error: "Server error during staff registration" });
  }
});

/* ---------- Staff Login ---------- */
router.post("/staff/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const { rows } = await pool.query("SELECT * FROM staff WHERE email = $1", [
      email.toLowerCase(),
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found with that email" });
    }

    const user = rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const token = generateToken(user);
    delete user.password;
    return res.json({ success: true, token, user });
  } catch (err) {
    console.error("❌ Staff login error:", err);
    return res.status(500).json({ error: "Server error during staff login" });
  }
});

/* ---------- Generic Login (alias for staff/login) ---------- */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const { rows } = await pool.query("SELECT * FROM staff WHERE email = $1", [
      email.toLowerCase(),
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found with that email" });
    }

    const user = rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const token = generateToken(user);
    delete user.password;
    return res.json({ success: true, token, user });
  } catch (err) {
    console.error("❌ Generic login error:", err);
    return res.status(500).json({ error: "Server error during login" });
  }
});

/* =====================================================
   🧍‍♀️ PATIENT AUTH
   ===================================================== */

/* ---------- Patient Register ---------- */
router.post("/patient/register", async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body;
    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existing = await pool.query(
      "SELECT * FROM patients WHERE email = $1",
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO patients (first_name, last_name, email, password)
       VALUES ($1, $2, $3, $4)
       RETURNING id, first_name, last_name, email`,
      [first_name, last_name, email.toLowerCase(), hashed]
    );

    const user = rows[0];
    const token = generateToken(user);
    return res.json({ success: true, token, user });
  } catch (err) {
    console.error("❌ Patient register error:", err);
    return res
      .status(500)
      .json({ error: "Server error during patient registration" });
  }
});

module.exports = router;
