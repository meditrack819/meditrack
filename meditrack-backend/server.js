const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();

/* ----------------- CORS setup ----------------- */
let allowedOrigins = (process.env.CORS_ORIGINS || "").split(",").map(o => o.trim());

// Add defaults for your frontend & API if not in .env
const defaultOrigins = [
  "http://meditrack.space",
  "https://meditrack.space",
  "http://www.meditrack.space",
  "https://www.meditrack.space",
  "https://api.meditrack.space",
];
allowedOrigins = [...new Set([...allowedOrigins, ...defaultOrigins])];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow curl/mobile/Postman
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.warn(`❌ CORS blocked request from: ${origin}`);
      return callback(new Error("CORS policy: Origin not allowed"), false);
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

/* ----------------- Routes ----------------- */
app.use("/patients", require("./routes/patients"));
app.use("/prescriptions", require("./routes/prescriptions"));
app.use("/appointments", require("./routes/appointments"));
app.use("/stock", require("./routes/stock"));
app.use("/ml", require("./routes/ml"));
app.use("/debug", require("./routes/debug"));

/* ----------------- Server start ----------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 MediTrack Backend running on port ${PORT}`);
  console.log("✅ Allowed Origins:", allowedOrigins);
});
