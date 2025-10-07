// backend/server.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

/* -----------------------------------------------------
   🔧 Middleware
----------------------------------------------------- */

// 🧱 Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // disable if inline styles/scripts used
  })
);

// 🧁 Parse cookies for JWT HttpOnly cookie auth
app.use(cookieParser());

// 🧾 Body parser
app.use(express.json({ limit: "1mb" }));

// 🌍 CORS — allow only trusted origins
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://meditrack.space",
      "https://www.meditrack.space",
      "https://admin.meditrack.space",
    ],
    credentials: true, // allow cookies / credentials
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

// 🪵 Request logger
app.use((req, res, next) => {
  console.log(`➡️ ${req.method} ${req.originalUrl}`);
  next();
});

/* -----------------------------------------------------
   🧩 Routes
----------------------------------------------------- */
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

  app.get("/api/test", (_req, res) => {
    res.json({ message: "✅ API test route is alive" });
  });
} catch (err) {
  console.error("❌ Route mounting error:", err);
}

/* -----------------------------------------------------
   💚 Health & Diagnostics
----------------------------------------------------- */
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
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
  console.log(`✅ MediTrack Backend running securely on port ${PORT}`);
});
