const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const patientRoutes = require("./routes/patients");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Mount patient routes at /patients
app.use("/patients", require("./routes/patients")); 
app.use("/prescriptions", require("./routes/prescriptions")); 

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 MediTrack Backend running on port ${PORT}`);
});
