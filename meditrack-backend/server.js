const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

require("dotenv").config();

const app = express();

/* ----------------- CORS setup ----------------- */
const allowedOrigins = (process.env.CORS_ORIGINS || "").split(",").map(o => o.trim());

// If no CORS_ORIGINS provided, fall back to allowing all
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow requests like curl/mobile
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
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
});
