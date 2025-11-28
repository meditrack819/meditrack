// backend/routes/diagnosis.js
const express = require("express");
const router = express.Router();
const { pool } = require("../db");

/* =========================================================
   💊 Get medicine suggestions based on diagnosis (safe version)
   ========================================================= */
router.get("/:diagnosis", async (req, res) => {
  const { diagnosis } = req.params;

  try {
    const diag = diagnosis.trim().toLowerCase();

    // 🧠 Query DB for specific diagnosis + global ("All") medicines
    const result = await pool.query(
      `SELECT medicine_name 
       FROM diagnosis_medicine_map 
       WHERE LOWER(diagnosis) = $1 OR LOWER(diagnosis) = 'all'`,
      [diag]
    );

    if (result.rowCount > 0) {
      const meds = result.rows.map((r) => r.medicine_name);
      return res.json(meds);
    }

    // 🩺 Fallback if DB has no entries for this diagnosis
    const fallback = {
      hypertension: ["Amlodipine", "Losartan", "Metoprolol", "Captopril"],
      diabetes: ["Metformin", "Insulin", "Glimepiride"],
      asthma: ["Salbutamol", "Budesonide", "Montelukast"],
      tuberculosis: ["Rifampicin", "Isoniazid", "Pyrazinamide", "Ethambutol"],
      "tooth extraction": ["Amoxicillin", "Mefenamic Acid", "Paracetamol"],
      "follow-up check-up": [],
      all: ["Paracetamol", "Vitamin C", "Multivitamins"], // ✅ Always safe medicines
    };

    // Merge diagnosis + "all" category for fallback
    const combined = [
      ...(fallback[diag] || []),
      ...(fallback["all"] || []),
    ];

    res.json(combined);
  } catch (err) {
    console.error("❌ Diagnosis route error:", err);
    res.status(500).json({ error: "Failed to fetch medicine suggestions" });
  }
});

module.exports = router;
