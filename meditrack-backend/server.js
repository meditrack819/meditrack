const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Mount your route files
app.use("/patients", require("./routes/patients"));
app.use("/prescriptions", require("./routes/prescriptions"));
app.use("/appointments", require("./routes/appointments"));
app.use("/stock", require("./routes/stock"));
app.use("/ml", require("./routes/ml"));
app.use("/debug", require("./routes/debug"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 MediTrack Backend running on port ${PORT}`);
});
