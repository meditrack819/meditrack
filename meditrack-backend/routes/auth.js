const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { pool } = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

/* ===================================================
   🔹 Helpers
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
   🔹 CSRF Token (for frontend axios setup)
=================================================== */
router.get("/csrf-token", (req, res) => {
  const csrfToken = crypto.randomBytes(24).toString("hex");
  res.json({ csrfToken });
});

/* ===================================================
   🔹 STAFF REGISTER
=================================================== */
router.post("/staff/register", async (req, res) => {
  try {
    const { name, email, password, service_type, role } = req.body;

    if (!name || !email || !password || !service_type) {
      return res.status(400).json({ error: "All fields are required." });
    }

    const existing = await pool.query("SELECT * FROM staff WHERE email = $1", [
      email.toLowerCase(),
    ]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered." });
    }

    const hashed = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `
      INSERT INTO staff (name, email, password, service_type, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, email, service_type, role
    `,
      [name, email.toLowerCase(), hashed, service_type, role || "staff"]
    );

    const user = rows[0];
    const token = generateToken(user);

    res.json({ success: true, token, user });
  } catch (err) {
    console.error("❌ Staff register error:", err);
    res.status(500).json({ error: "Server error during registration." });
  }
});

/* ===================================================
   🔹 STAFF LOGIN (username = email field)
=================================================== */
router.post("/staff/login", async (req, res) => {
  try {
    const { email, password } = req.body; // username comes here as email
    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required." });
    }

    const { rows } = await pool.query("SELECT * FROM staff WHERE email = $1", [
      email.toLowerCase(),
    ]);
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: "User not found. Please check your credentials." });
    }

    const user = rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid password." });
    }

    const token = generateToken(user);
    delete user.password;

    res.json({ success: true, token, user });
  } catch (err) {
    console.error("❌ Staff login error:", err);
    res.status(500).json({ error: "Server error during staff login." });
  }
});

/* ===================================================
   🔹 GENERIC LOGIN (alias)
=================================================== */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required." });
    }

    const { rows } = await pool.query("SELECT * FROM staff WHERE email = $1", [
      email.toLowerCase(),
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const user = rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid password." });
    }

    const token = generateToken(user);
    delete user.password;

    res.json({ success: true, token, user });
  } catch (err) {
    console.error("❌ Generic login error:", err);
    res.status(500).json({ error: "Server error during login." });
  }
});

/* ===================================================
   🔹 PATIENT REGISTER
=================================================== */
router.post("/patient/register", async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body;
    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({ error: "All fields are required." });
    }

    const existing = await pool.query(
      "SELECT * FROM patients WHERE email = $1",
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered." });
    }

    const hashed = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `
      INSERT INTO patients (first_name, last_name, email, password)
      VALUES ($1, $2, $3, $4)
      RETURNING id, first_name, last_name, email
    `,
      [first_name, last_name, email.toLowerCase(), hashed]
    );

    const user = rows[0];
    const token = generateToken(user);

    res.json({ success: true, token, user });
  } catch (err) {
    console.error("❌ Patient register error:", err);
    res
      .status(500)
      .json({ error: "Server error during patient registration." });
  }
});

/* ===================================================
   🔹 CHANGE PASSWORD (Protected + Min 6 Chars)
=================================================== */
router.post("/staff/change-password", async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized: Missing token." });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Invalid or expired token." });
    }

    const userId = decoded.id;

    // Fetch the user from the DB
    const { rows } = await pool.query("SELECT * FROM staff WHERE id = $1", [
      userId,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const user = rows[0];

    // Validate old password
    const validPassword = await bcrypt.compare(oldPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Incorrect current password." });
    }

    // ✅ Enforce minimum password length (6 chars)
    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters long." });
    }

    // ✅ Hash and update the password
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE staff SET password = $1 WHERE id = $2", [
      hashed,
      userId,
    ]);

    res.json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    console.error("❌ Change password error:", err);
    res.status(500).json({ error: "Server error changing password." });
  }
});

/* ===================================================
   🔹 EXPORT
=================================================== */
module.exports = router;
