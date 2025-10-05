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
    ],
    credentials: true,
  })
);

app.use(express.json());

/* -----------------------------------------------------
   🧾 Logger (see all incoming requests)
----------------------------------------------------- */
app.use((req, res, next) => {
  console.log(`➡️ ${req.method} ${req.originalUrl}`);
  next();
});

/* -----------------------------------------------------
   🚏 Routes
----------------------------------------------------- */
try {
  console.log("⏳ Loading routes...");

  const authRoutes = require("./routes/auth");
  app.use("/api/auth", authRoutes); // ✅ NO /api prefix here
  console.log("✅ Auth routes mounted at /auth");

  const apptRoutes = require("./routes/appointments");
  app.use("/api/appointments", apptRoutes);
  console.log("✅ Appointment routes mounted at /appointments");

  const patientRoutes = require("./routes/patients");
  app.use("/api/patients", patientRoutes);
  console.log("✅ Patient routes mounted at /patients");

  const prescriptionRoutes = require("./routes/prescriptions");
  app.use("/api/prescriptions", prescriptionRoutes);
  console.log("✅ Prescription routes mounted at /prescriptions");

  const stockRoutes = require("./routes/stock");
  app.use("/api/stock", stockRoutes);
  console.log("✅ Stock routes mounted at /stock");
} catch (err) {
  console.error("❌ Route mounting error:", err);
}



/* -----------------------------------------------------
   🧪 Test Routes
----------------------------------------------------- */
// Direct test — bypasses routes
app.get("/api/auth/test-direct", (req, res) => {
  res.json({ message: "✅ Direct route from server.js works" });
});

// Shortcut root test
app.get("/api/test", (req, res) => {
  res.json({ message: "✅ API is alive" });
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
