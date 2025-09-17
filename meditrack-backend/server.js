const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(bodyParser.json());

// Routes
app.use("/patients", require("./routes/patients"));
app.use("/prescriptions", require("./routes/prescriptions"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 MediTrack Backend running on port ${PORT}`);
});
