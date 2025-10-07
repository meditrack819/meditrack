const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const axios = require("axios");
const { pool } = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

/* ===================================================
   🧱 Middleware
=================================================== */
router.use(cookieParser());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many login attempts. Try again later." },
});

const registerLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 10,
  message: { error: "Too many registration attempts. Try again later." },
});

/* ===================================================
   🔧 Helper: Token Generator
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

/* ---------- Register ---------- */
router.post("/staff/register", registerLimiter, async (req, res) => {
  try {
    const { name, email, password, service_type, role } = req.body;

    if (!name || !email || !password || !service_type) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const existing = await pool.query("SELECT * FROM staff WHERE email = $1", [
      email.toLowerCase(),
    ]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashed = await bcrypt.hash(password, 12);

    const { rows } = await pool.query(
      `INSERT INTO staff (name, email, password, service_type, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, service_type, role`,
      [name, email.toLowerCase(), hashed, service_type, role || "staff"]
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
    console.error("❌ Staff register error:", err);
    res.status(500).json({ error: "Server error during registration" });
  }
});

/* ---------- Login with reCAPTCHA ---------- */
router.post("/staff/login", loginLimiter, async (req, res) => {
  try {
    const { email, password, captchaToken } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    // 🧩 reCAPTCHA verification
    if (!captchaToken)
      return res.status(400).json({ error: "Please complete the reCAPTCHA" });

    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${captchaToken}`;

    const captchaRes = await axios.post(verifyURL);
    if (!captchaRes.data.success) {
      return res.status(403).json({ error: "Failed reCAPTCHA verification" });
    }

    // 🔍 Validate input
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
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

/* ---------- Logout ---------- */
router.post("/staff/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
  res.status(200).json({ success: true, message: "Logged out successfully" });
});

module.exports = router;
