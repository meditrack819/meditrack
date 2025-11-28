// routes/patients.js
const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { sendSMS } = require("../utils/sms");

// ✅ node-fetch wrapper (CommonJS)
const fetch = (...args) =>
  import("node-fetch").then(({ default: f }) => f(...args));

/* ---------------- Supabase Admin ---------------- */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseAdmin = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { fetch },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  console.log("✅ Supabase admin client initialized.");
} else {
  console.warn("⚠️ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.");
}

/* ---------------- Helpers ---------------- */
function generatePassword() {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const a = "abcdefghijklmnopqrstuvwxyz";
  const d = "0123456789";
  const pools = [A, a, d];
  const pick = (s) => s[crypto.randomInt(0, s.length)];
  let pwd = pools.map(pick).join(""); // ensure at least 1 of each
  const all = A + a + d;
  while (pwd.length < 12) pwd += pick(all);
  return pwd.split("").sort(() => Math.random() - 0.5).join("");
}

const toNull = (v) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v;

const ymdOrNull = (v) => {
  if (toNull(v) === null) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const titleCase = (s = "") =>
  (s || "")
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();

const cleanPhone = (s = "") => (s || "").replace(/[^\d]+/g, "").replace(/^00/, "+").trim();

function computeAge(birthdate) {
  if (!birthdate) return null;
  const d = new Date(birthdate);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

function computePatientTypeFromDOB(birthdate) {
  const age = computeAge(birthdate);
  if (age === null || age >= 18) return "adult";
  if (age < 2) return "infant";
  return "minor";
}

const normalizeIncoming = (body) => {
  const p = { ...body };

  p.first_name = titleCase(p.first_name);
  p.middle_name = titleCase(p.middle_name);
  p.last_name = titleCase(p.last_name);
  p.suffix = toNull(p.suffix);

  p.email = toNull(p.email) ? String(p.email).trim().toLowerCase() : null;
  p.phone = toNull(p.phone) ? cleanPhone(p.phone) : null;

  p.birthdate = ymdOrNull(p.birthdate);
  p.sex = toNull(p.sex) ? titleCase(p.sex) : null;

  p.building_no = toNull(p.building_no) ? titleCase(p.building_no) : null;
  p.street = toNull(p.street) ? titleCase(p.street) : null;
  p.barangay = toNull(p.barangay) ? titleCase(p.barangay) : null;
  p.city = toNull(p.city) ? titleCase(p.city) : null;

  p.religion = toNull(p.religion) ? titleCase(p.religion) : null;
  p.civil_status = toNull(p.civil_status) ? titleCase(p.civil_status) : null;
  p.work = toNull(p.work) ? titleCase(p.work) : null;


  p.last_visit = ymdOrNull(p.last_visit);

  return p;
};

const compiledNameSQL = `
  CONCAT_WS(' ',
    COALESCE(first_name,''), COALESCE(middle_name,''), COALESCE(last_name,'')
  )
`;

/* ---------------- Family/ID Generator ---------------- */
async function generateFamilyAndId(client, year) {
  const { rows: families } = await client.query(
    `SELECT family_no FROM patients WHERE family_no LIKE $1 ORDER BY family_no DESC LIMIT 1`,
    [`%-${year}`]
  );

  let nextFamilyNo;
  if (families.length === 0) {
    nextFamilyNo = `01-${year}`;
  } else {
    const lastFam = families[0].family_no.split("-")[0];
    const nextNum = String(parseInt(lastFam, 10) + 1).padStart(2, "0");
    nextFamilyNo = `${nextNum}-${year}`;
  }

  const nextId = `${nextFamilyNo.split("-")[0]}1-${year}`;
  return { family_no: nextFamilyNo, id: nextId };
}

async function generateIdFromFamily(client, family_no, year) {
  const { rows: members } = await client.query(
    `SELECT id FROM patients WHERE family_no = $1 ORDER BY id DESC LIMIT 1`,
    [family_no]
  );

  let newId;
  const famPrefix = family_no.split("-")[0];
  if (members.length === 0) {
    newId = `${famPrefix}1-${year}`;
  } else {
    const lastId = members[0].id.split("-")[0];
    const lastCounter = parseInt(lastId.slice(famPrefix.length), 10);
    const nextCounter = lastCounter + 1;
    newId = `${famPrefix}${nextCounter}-${year}`;
  }
  return newId;
}

/* ---------------- Diagnostics ---------------- */
router.get("/_columns", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'patients'
      ORDER BY ordinal_position
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- CRUD ---------------- */
// 🔹 LIST ALL PATIENTS
router.get("/", async (req, res) => {
  try {
    const { name } = req.query;
    let where = "";
    let params = [];

    if (name && name.trim()) {
      params.push(`%${name.trim()}%`);
      where = `WHERE (first_name || ' ' || last_name) ILIKE $1`;
    }

    const q = `
      SELECT
        id,
        family_no,
        first_name || ' ' || last_name AS name,
        email,
        phone,
        COALESCE(EXTRACT(YEAR FROM age(CURRENT_DATE, birthdate))::int, NULL) AS age,
        last_visit
      FROM patients
      ${where}
      ORDER BY id ASC
    `;

    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    console.error("❌ Fetch patients:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 GET ONE PATIENT
// 🔹 GET ONE PATIENT (with diagnosis and illness_history)
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id, family_no, first_name, middle_name, last_name, suffix,
        email, phone, birthdate, sex,
        building_no, street, barangay, city,
        religion, civil_status, work,
        last_visit, created_at, photo_url, user_id,
        patient_type, age,
        diagnosis,                        -- ✅ include diagnosis
        illness_history                   -- ✅ include illness_history (if JSONB)
      FROM patients
      WHERE id = $1
      `,
      [req.params.id]
    );

    if (rows.length === 0)
      return res.status(404).json({ error: "Patient not found" });

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Fetch patient:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 CREATE PATIENT
router.post("/", async (req, res) => {
  const client = await pool.connect();
  try {
    const p = normalizeIncoming(req.body || {});
    if (!p.first_name || !p.last_name)
      return res.status(400).json({ error: "first_name and last_name required" });

    const year = String(new Date().getFullYear()).slice(-2);
    let family_no = p.family_no || null;
    let id = p.id || null;

    if (family_no && id) {
      const { rowCount } = await client.query(
        "SELECT 1 FROM patients WHERE id = $1 OR family_no = $2",
        [id, family_no]
      );
      if (rowCount > 0)
        return res.status(400).json({ error: "Family no or ID already exists" });
    } else if (family_no && !id) {
      const generated = await generateIdFromFamily(client, family_no, year);
      id = generated.id;
    } else {
      const generated = await generateFamilyAndId(client, year);
      family_no = generated.family_no;
      id = generated.id;
    }

const finalEmail = p.email || `${id}@patients.local`;
const finalPassword = generatePassword();

try {
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  const duplicate = existingUsers?.users?.find(u => u.email === finalEmail);

  if (duplicate) {
    await supabaseAdmin.auth.admin.deleteUser(duplicate.id);
    console.log(`🧹 Removed duplicate auth user for ${finalEmail}`);
  }
} catch (e) {
  console.warn("⚠️ Supabase duplicate check failed:", e.message);
}

const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
  email: finalEmail,
  password: finalPassword,
  email_confirm: true,
  user_metadata: {
    role: "patient",
    patient_id: id,
    name: `${p.first_name} ${p.last_name}`.trim(),
    must_change_password: true,
  },
});

    if (createErr)
      return res.status(400).json({ error: `Auth create failed: ${createErr.message}` });

    const authUserId = created?.user?.id || null;
    const hashedPassword = await bcrypt.hash(finalPassword, 10);

    await client.query("BEGIN");
const insertQ = `
INSERT INTO patients (
  id, family_no, first_name, middle_name, last_name, email, phone,
  birthdate, sex, building_no, street, barangay, city,
  last_visit, user_id, password, diagnosis
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
RETURNING id, family_no
`;


const vals = [
  id, family_no, p.first_name, p.middle_name, p.last_name,
  finalEmail, p.phone, p.birthdate, p.sex,
  p.building_no, p.street, p.barangay, p.city,
  p.last_visit, authUserId, hashedPassword,
  toNull(p.diagnosis)
];

    const { rows: inserted } = await client.query(insertQ, vals);
    await client.query("COMMIT");

// ✅ Send SMS notification
if (p.phone) {
  try {
    const smsMessage = `Welcome to MediTrack!\n\nID: ${id}\nPassword: ${finalPassword}\n\nMag-login sa app gamit ang ID at password at palitan ang password.`;
    await sendSMS(p.phone, smsMessage);
  } catch (e) {
    console.warn("⚠️ SMS send failed:", e.message);
  }
}


    res.status(201).json({
      id: inserted[0].id,
      family_no: inserted[0].family_no,
      email: finalEmail,
      password: finalPassword,
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("❌ Post patients failed:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 🔹 UPDATE PATIENT — also logs illness history automatically
router.put("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const id = req.params.id;

    // Check if patient exists
    const { rows: existingRows } = await client.query(
      "SELECT * FROM patients WHERE id = $1",
      [id]
    );

    if (existingRows.length === 0)
      return res.status(404).json({ error: "Patient not found" });

    const existing = existingRows[0];
    const p = normalizeIncoming(req.body || {});
    const age = p.birthdate ? computeAge(p.birthdate) : null;
    const patientType = p.birthdate ? computePatientTypeFromDOB(p.birthdate) : null;

    // Begin transaction
    await client.query("BEGIN");

    // Update patient info (including diagnosis)
    const q = `
      UPDATE patients SET
        first_name   = COALESCE($1, first_name),
        middle_name  = COALESCE($2, middle_name),
        last_name    = COALESCE($3, last_name),
        suffix       = COALESCE($4, suffix),
        phone        = COALESCE($5, phone),
        birthdate    = COALESCE($6, birthdate),
        age          = COALESCE($7, age),
        sex          = COALESCE($8, sex),
        building_no  = COALESCE($9, building_no),
        street       = COALESCE($10, street),
        barangay     = COALESCE($11, barangay),
        city         = COALESCE($12, city),
        religion     = COALESCE($13, religion),
        civil_status = COALESCE($14, civil_status),
        work         = COALESCE($15, work),
        last_visit   = COALESCE($16, last_visit),
        patient_type = COALESCE($17, patient_type),
        diagnosis    = COALESCE($18, diagnosis),
        updated_at   = NOW()
      WHERE id = $19
      RETURNING *;
    `;

    const vals = [
      toNull(p.first_name),
      toNull(p.middle_name),
      toNull(p.last_name),
      toNull(p.suffix),
      toNull(p.phone),
      toNull(p.birthdate),
      age,
      toNull(p.sex),
      toNull(p.building_no),
      toNull(p.street),
      toNull(p.barangay),
      toNull(p.city),
      toNull(p.religion),
      toNull(p.civil_status),
      toNull(p.work),
      toNull(p.last_visit),
      patientType,
      toNull(p.diagnosis),
      id,
    ];

    const { rows } = await client.query(q, vals);
    const updated = rows[0];

    // 🧠 If diagnosis changed, append to illness_history
    // 🧠 If diagnosis changed, append only if it's not already the latest
if (p.diagnosis) {
  const currentHistory = Array.isArray(existing.illness_history)
    ? existing.illness_history
    : [];

  const lastEntry = currentHistory[currentHistory.length - 1];
  const isDuplicate =
    lastEntry &&
    lastEntry.diagnosis?.toLowerCase().trim() ===
      p.diagnosis.toLowerCase().trim();

  // Only push if different from the most recent
  if (!isDuplicate) {
    const newEntry = {
      diagnosis: p.diagnosis,
      date: new Date().toISOString(),
    };
    const newHistory = [...currentHistory, newEntry];

    await client.query(
      "UPDATE patients SET illness_history = $1 WHERE id = $2",
      [JSON.stringify(newHistory), id]
    );
    updated.illness_history = newHistory;
  }
}


    await client.query("COMMIT");

    res.json(updated);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("❌ Error updating patient diagnosis:", err);
    res.status(500).json({ error: "Failed to update diagnosis" });
  } finally {
    client.release();
  }
});


// 🔹 DELETE PATIENT
router.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: existing } = await client.query(
      "SELECT id, user_id FROM patients WHERE id = $1",
      [req.params.id]
    );

    if (existing.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Patient not found" });
    }

    const userId = existing[0].user_id;
    const { rows } = await client.query(
      "DELETE FROM patients WHERE id = $1 RETURNING id",
      [req.params.id]
    );

    if (userId && supabaseAdmin) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch (e) {
        console.warn("⚠️ Delete auth user:", e.message);
      }
    }

    await client.query("COMMIT");
    res.json({ message: "✅ Patient deleted", id: rows[0].id });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("❌ Delete patient:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});
/* ---------------- MEDICAL HISTORY ---------------- */
// 📋 POST — Add diagnosis to illness history
router.post("/:id/illness-history", async (req, res) => {
  const { id } = req.params;
  const { diagnosis, date } = req.body;

  try {
    // Get current illness history
    const patientRes = await pool.query("SELECT illness_history FROM patients WHERE id = $1", [id]);
    let history = patientRes.rows[0]?.illness_history || [];

    // Add new record
    history.push({ diagnosis, date });

    // Save updated history back
    await pool.query("UPDATE patients SET illness_history = $1 WHERE id = $2", [JSON.stringify(history), id]);
    res.json({ message: "Illness history updated", history });
  } catch (err) {
    console.error("Error saving illness history:", err);
    res.status(500).json({ error: "Failed to save illness history" });
  }
});

// GET
router.get("/:id/history", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM patient_medical_history WHERE patient_id = $1 LIMIT 1`,
      [req.params.id]
    );
    res.json(rows[0] || {});
  } catch (err) {
    console.error("❌ fetch medical history:", err);
    res.status(500).json({ error: err.message });
  }
});

// UPSERT
router.put("/:id/history", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const fields = [
      "diabetes","hypertension","cancer","cancer_site","lung_disease","eye_disease",
      "chest_pain_exertion","chest_pain_spread","chest_pain_fast","chest_pain_breathless",
      "chest_pain_sweating","chest_pain_relieved","chest_pain_30min","chest_pain_other",
      "family_sakit_puso","family_stroke","family_diabetes","family_cancer","family_sakit_lungs",
      "family_sakit_bato","family_other","gulay","prutas","isda","karne","processed",
      "maalat_per_week","umiinom","klase_alak","gaano_karami","kadalas_inom","binge",
      "ehersisyo","uri_ehersisyo","sapat_ehersisyo","naninigarilyo","sticks_per_day",
      "tumigil","years_quit","ever_100_sticks","stress","stress_dahilan","stress_effect",
      "weight","height","waist","hip","bmi","wh_ratio","fbs","rbs","left_bp","right_bp",
      "baseline_bp","cholesterol","urine_protein","urine_ketones","risk_profile",
      "cancer_screened","cancer_screen_type","cancer_screen_result"
    ];

    const insertCols = ["patient_id", ...fields];
    const insertVals = [req.params.id, ...fields.map(f => req.body[f] ?? null)];
    const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(",");
    const updates = fields.map((f, i) => `${f} = $${i + 2}`).join(", ");

    const upsert = `
      INSERT INTO patient_medical_history (${insertCols.join(", ")})
      VALUES (${placeholders})
      ON CONFLICT (patient_id) DO UPDATE
      SET ${updates}, updated_at = now()
      RETURNING *;
    `;
    const { rows } = await client.query(upsert, insertVals);
    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ upsert medical history:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

/* ---------------- VITAL SIGNS ---------------- */

// GET
router.get("/:id/vitals", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, temp, hr, rr, spo2, systolic, diastolic, created_at
       FROM patient_vitals_log
       WHERE patient_id = $1
       ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ fetch vitals:", err);
    res.status(500).json({ error: err.message });
  }
});

// ADD
router.post("/:id/vitals", async (req, res) => {
  try {
    const { temp, hr, rr, spo2, systolic, diastolic } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO patient_vitals_log
        (patient_id, temp, hr, rr, spo2, systolic, diastolic)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [req.params.id, temp || null, hr || null, rr || null, spo2 || null, systolic || null, diastolic || null]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error("❌ insert vitals:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- CHANGE PASSWORD ---------------- */
router.post("/:id/change-password", async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  try {
    const { rows } = await pool.query("SELECT user_id FROM patients WHERE id = $1", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Patient not found" });

    const userId = rows[0].user_id;
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
      user_metadata: { must_change_password: false },
    });
    if (updateErr) throw updateErr;

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE patients SET password = $1 WHERE id = $2", [hashed, id]);
    res.json({ success: true, message: "Password updated" });
  } catch (err) {
    console.error("❌ change-password error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- SEARCH BY NAME ---------------- */
// Simple lookup by first and last name
router.get("/search", async (req, res) => {
  try {
    const { first_name, last_name } = req.query;
    if (!first_name || !last_name) {
      return res.status(400).json({ error: "first_name and last_name required" });
    }

    // Perform case-insensitive partial match
    const { rows } = await pool.query(
      `
      SELECT id, first_name, last_name
      FROM patients
      WHERE LOWER(first_name) = LOWER($1)
        AND LOWER(last_name) = LOWER($2)
      LIMIT 1;
      `,
      [first_name.trim(), last_name.trim()]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "No matching patient found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ /patients/search error:", err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
