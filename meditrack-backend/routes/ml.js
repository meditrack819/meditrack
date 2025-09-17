const express = require("express");
const axios = require("axios");
const FormData = require("form-data");

const router = express.Router();
const ML_BASE = "http://127.0.0.1:8000";

// POST /ml/forecast  (multipart: file=xlsx, horizon=6)
router.post("/forecast", async (req, res) => {
  try {
    if (!req.files || !req.files.file) return res.status(400).json({ error: "file is required" });
    const horizon = Number(req.body.horizon || 6);
    const form = new FormData();
    form.append("file", req.files.file.data, { filename: req.files.file.name || "data.xlsx" });
    form.append("horizon", String(horizon));

    const r = await axios.post(`${ML_BASE}/api/ml/forecast`, form, { headers: form.getHeaders() });
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

// POST /ml/seasonality  (multipart: file=xlsx)
router.post("/seasonality", async (req, res) => {
  try {
    if (!req.files || !req.files.file) return res.status(400).json({ error: "file is required" });
    const form = new FormData();
    form.append("file", req.files.file.data, { filename: req.files.file.name || "data.xlsx" });
    const r = await axios.post(`${ML_BASE}/api/ml/seasonality`, form, { headers: form.getHeaders() });
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

// POST /ml/restock  (multipart: forecast_csv, current_stock_csv)
router.post("/restock", async (req, res) => {
  try {
    const fc = req.files?.forecast_csv;
    const cs = req.files?.current_stock_csv;
    if (!fc || !cs) return res.status(400).json({ error: "forecast_csv and current_stock_csv are required" });
    const form = new FormData();
    form.append("forecast_csv", fc.data, { filename: fc.name || "forecast.csv" });
    form.append("current_stock_csv", cs.data, { filename: cs.name || "current_stock.csv" });
    const r = await axios.post(`${ML_BASE}/api/ml/restock`, form, { headers: form.getHeaders() });
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

module.exports = router;
