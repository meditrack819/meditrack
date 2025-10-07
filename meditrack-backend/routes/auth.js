/**
 * routes/auth.js — Secure Version
 */

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");
const rateLimit = require("express-rate-limit");
const csrf = require("csurf");
const cookieParser = require("cookie-parser");
const { pool } = require("../db");

const router = express.Router();
router.use(cookieParser());

// 🔐 Environment
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET || "6LfeHOErAAAAAB8HKr7y1O6fosNPezHz5u_V5jhH";

/* -----------------------------------------------------
   🧩 CSRF Protection
   (Frontend calls GET /api/auth/csrf-token to get token)
----------------------------------------------------- */
const csrfProtection = csrf({ cookie: true });

router.get("/csrf-token", csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

/* -----------------------------------------------------
   ⚙️ Rate Limiting — Prevent brute-force
----------------------------------------------------- */
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // limit each IP to 10 requests
  message: { error: "Too many login attempts. Try again later." },
});

/* -----------------------------------------------------
   🔑 Helper: JWT generator
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

/* -----------------------------------------------------
   ✅ Staff Login — Secure
----------------------------------------------------- */
router.post("/staff/login", loginLimiter, async (req, res) => {
  try {
    const { email, password, captcha, csrf } = req.body;

    // 1️⃣ reCAPTCHA verification
    if (!captcha) {
      return res.status(400).json({ error: "Captcha token missing" });
    }
    const captchaVerify = await fetch(
      `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET}&response=${captcha}`,
      { method: "POST" }
    );
    const captchaData = await captchaVerify.json();
    if (!captchaData.success) {
      return res.status(403).json({ error: "Captcha verification failed" });
    }

    // 2️⃣ Basic field validation
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    // 3️⃣ Lookup user
    const result = await pool.query("SELECT * FROM staff WHERE email = $1", [
      email.toLowerCase(),
    ]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "No user found" });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // 4️⃣ Generate token
    const token = generateToken(user);
    delete user.password;

    res.cookie("csrfToken", csrf, {
      httpOnly: false,
      secure: true,
      sameSite: "Strict",
    });

    res.json({
      message: "Login successful",
      token,
      user,
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "Server error during login" });
  }
});

/* -----------------------------------------------------
   ✅ Staff Register — Keep same as before
----------------------------------------------------- */
router.post("/staff/register", async (req, res) => {
  try {
    const { name, email, password, service_type, role } = req.body;
    if (!name || !email || !password || !service_type)
      return res.status(400).json({ error: "All fields required" });

    const existing = await pool.query("SELECT * FROM staff WHERE email = $1", [
      email.toLowerCase(),
    ]);
    if (existing.rows.length > 0)
      return res.status(400).json({ error: "Email already registered" });

    const hashed = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO staff (name, email, password, service_type, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, service_type, role`,
      [name, email.toLowerCase(), hashed, service_type, role || "staff"]
    );

    const user = rows[0];
    const token = generateToken(user);
    res.json({ success: true, token, user });
  } catch (err) {
    console.error("❌ Register error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
