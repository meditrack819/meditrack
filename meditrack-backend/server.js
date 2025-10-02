// backend/server.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

/* ---------------- Middleware ---------------- */
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

/* ---------------- Routes ---------------- */
try {
  /* ---------------- Routes ---------------- */
console.log("⏳ Loading routes...");

const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);
console.log("✅ Auth routes mounted at /api/auth");

const apptRoutes = require("./routes/appointments");
app.use("/api/appointments", apptRoutes);
console.log("✅ Appointment routes mounted at /api/appointments");

const patientRoutes = require("./routes/patients");
app.use("/api/patients", patientRoutes);
console.log("✅ Patient routes mounted at /api/patients");

const prescriptionRoutes = require("./routes/prescriptions");
app.use("/api/prescriptions", prescriptionRoutes);
console.log("✅ Prescription routes mounted at /api/prescriptions");

const stockRoutes = require("./routes/stock");
app.use("/api/stock", stockRoutes);
console.log("✅ Stock routes mounted at /api/stock");


} catch (err) {
  console.error("❌ Route mounting error:", err);
}

/* ---------------- Health Check ---------------- */
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

/* ---------------- Root ---------------- */
app.get("/", (req, res) => {
  res.send("✅ MediTrack Backend is running 🚀");
});

/* ---------------- 404 Fallback ---------------- */
app.use((req, res) => {
  console.warn(`⚠️ 404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

/* ---------------- Start Server ---------------- */
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
