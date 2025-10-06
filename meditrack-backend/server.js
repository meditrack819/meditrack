// backend/server.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

/* -----------------------------------------------------
   🔧 Middleware
----------------------------------------------------- */
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://meditrack.space",
      "https://www.meditrack.space",
      "https://admin.meditrack.space",
    ],
    credentials: true,
  })
);
app.use(express.json());

/* -----------------------------------------------------
   🧾 Logger
----------------------------------------------------- */
app.use((req, res, next) => {
  console.log(`➡️ ${req.method} ${req.originalUrl}`);
  next();
});

/* ================== Root ================== */
app.get("/", (_req, res) => res.send("MediTrack Backend is running 🚀"));

/* ================== Routes ================== */
try {
  console.log("⏳ Loading routes...");

  const authRoutes = require("./routes/auth");
  app.use("/api/auth", authRoutes);
  console.log("✅ Auth routes mounted at /api/auth");

  const patientRoutes = require("./routes/patients");
  app.use("/api/patients", patientRoutes);
  console.log("✅ Patient routes mounted at /api/patients");

  const prescriptionRoutes = require("./routes/prescriptions");
  app.use("/api/prescriptions", prescriptionRoutes);
  console.log("✅ Prescription routes mounted at /api/prescriptions");

  const appointmentRoutes = require("./routes/appointments");
  app.use("/api/appointments", appointmentRoutes);
  console.log("✅ Appointment routes mounted at /api/appointments");

  const stockRoutes = require("./routes/stock");
  app.use("/api/stock", stockRoutes);
  console.log("✅ Stock routes mounted at /api/stock");

  const mlRoutes = require("./routes/ml");
  app.use("/api/ml", mlRoutes);
  console.log("✅ ML routes mounted at /api/ml");

  app.get("/api/test", (req, res) => {
    res.json({ message: "✅ API test route is alive" });
  });
} catch (err) {
  console.error("❌ Route mounting error:", err);
}


/* -----------------------------------------------------
   🧪 Direct Test Routes
----------------------------------------------------- */
app.get("/api/test", (req, res) => {
  res.json({ message: "✅ API is alive" });
});

app.get("/api/auth/test", (req, res) => {
  res.json({ message: "✅ Auth route working fine" });
});
/* -----------------------------------------------------
   💚 Health Check
----------------------------------------------------- */
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

/* -----------------------------------------------------
   🧭 Root Endpoint
----------------------------------------------------- */
app.get("/", (req, res) => {
  res.send("✅ MediTrack Backend is running 🚀");
});

/* -----------------------------------------------------
   ⚠️ 404 Fallback
----------------------------------------------------- */
app.use((req, res) => {
  console.warn(`⚠️ 404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

/* -----------------------------------------------------
   🚀 Start Server
----------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
