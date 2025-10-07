const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

/* ===================================================
   🔒 Middleware Setup
=================================================== */
router.use(cookieParser());

// 🧱 Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: { error: "Too many login attempts. Try again later." },
});

const registerLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 10,
  message: { error: "Too many registration attempts. Try again later." },
});

/* ===================================================
   🧩 Helper Functions
=================================================== */
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

/* ===================================================
   🧑‍💼 STAFF AUTH
=================================================== */

/* ---------- Staff Register ---------- */
router.post("/staff/register", registerLimiter, async (req, res) => {
  try {
    const { name, email, password, service_type, role } = req.body;

    // 🔍 Validate inputs
    if (!name || !email || !password || !service_type) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters long" });
    }

    // 🚫 Check existing email
    const existing = await pool.query("SELECT * FROM staff WHERE email = $1", [
      email.toLowerCase(),
    ]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // 🔐 Hash password
    const hashed = await bcrypt.hash(password, 12);

    // 💾 Insert staff record
    const { rows } = await pool.query(
      `INSERT INTO staff (name, email, password, service_type, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, service_type, role`,
      [name, email.toLowerCase(), hashed, service_type, role || "staff"]
    );

    const user = rows[0];
    const token = generateToken(user);

    // 🍪 Set token as HttpOnly cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({ success: true, user });
  } catch (err) {
    console.error("❌ Staff register error:", err);
    res
      .status(500)
      .json({ error: "Server error during staff registration" });
  }
});

/* ---------- Staff Login ---------- */
router.post("/staff/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // 🔍 Validate input
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // 🔎 Find user
    const { rows } = await pool.query("SELECT * FROM staff WHERE email = $1", [
      email.toLowerCase(),
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = rows[0];

    // 🔑 Compare passwords
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // 🎟️ Generate token
    const token = generateToken(user);
    delete user.password;

    // 🍪 Send token securely via cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      user,
    });
  } catch (err) {
    console.error("❌ Staff login error:", err);
    res.status(500).json({ error: "Server error during staff login" });
  }
});

/* ---------- Staff Logout ---------- */
router.post("/staff/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
  res.status(200).json({ success: true, message: "Logged out successfully" });
});

/* ===================================================
   🧍‍♂️ PATIENT AUTH
=================================================== */
router.post("/patient/register", registerLimiter, async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body;

    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const existing = await pool.query(
      "SELECT * FROM patients WHERE email = $1",
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashed = await bcrypt.hash(password, 12);

    const { rows } = await pool.query(
      `INSERT INTO patients (first_name, last_name, email, password)
       VALUES ($1, $2, $3, $4)
       RETURNING id, first_name, last_name, email`,
      [first_name, last_name, email.toLowerCase(), hashed]
    );

    const user = rows[0];
    const token = generateToken(user);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({ success: true, user });
  } catch (err) {
    console.error("❌ Patient register error:", err);
    res.status(500).json({ error: "Server error during patient registration" });
  }
});

/* ===================================================
   🧭 GENERIC LOGIN (Fallback)
=================================================== */
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const { rows } = await pool.query("SELECT * FROM staff WHERE email = $1", [
      email.toLowerCase(),
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const token = generateToken(user);
    delete user.password;

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({ success: true, user });
  } catch (err) {
    console.error("❌ Generic login error:", err);
    res.status(500).json({ error: "Server error during login" });
  }
});

module.exports = router;
