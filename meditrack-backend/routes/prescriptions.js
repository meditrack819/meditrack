// backend/routes/prescriptions.js
const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

/* =========================================================
   📦 Supabase Setup
========================================================= */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("⚠ Missing Supabase env vars — image upload disabled");
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Create bucket (ignore if exists)
  (async () => {
    try {
      await supabase.storage.createBucket("prescriptions", {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
      });
    } catch {
      /* bucket already exists */
    }
  })();
}

/* =========================================================
   🧪 Detect optional columns
========================================================= */
let HAS_INSTRUCTIONS = false;
let HAS_IMAGE_PATH = false;

(async () => {
  try {
    const { rows } = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='prescriptions'
    `);

    HAS_INSTRUCTIONS = rows.some(r => r.column_name === "instructions");
    HAS_IMAGE_PATH = rows.some(r => r.column_name === "image_path");

    console.log("[prescriptions] Detected:", { HAS_INSTRUCTIONS, HAS_IMAGE_PATH });
  } catch (e) {
    console.warn("[prescriptions] Column detection failed:", e.message);
  }
})();

/* =========================================================
   🔍 Resolve patient user_id (UUID)
========================================================= */
async function resolvePatientUserId(patientId) {
  const val = String(patientId || "").trim();
  if (!val) return null;

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

  if (isUuid) {
    const { rows } = await pool.query(
      "SELECT id FROM patients WHERE user_id=$1 LIMIT 1",
      [val]
    );
    return rows.length ? val : null;
  }

  const { rows } = await pool.query(
    "SELECT user_id FROM patients WHERE id=$1 LIMIT 1",
    [val]
  );

  return rows.length ? rows[0].user_id : null;
}

/* =========================================================
   📦 Detect stock table
========================================================= */
let STOCK_META = null;

async function detectStockMeta(client) {
  if (STOCK_META) return STOCK_META;

  const reg = await client.query(`
    SELECT 
      to_regclass('stock_inventory') AS s1,
      to_regclass('inventory') AS s2,
      to_regclass('stock') AS s3;
  `);

  const { s1, s2, s3 } = reg.rows[0];

  if (s1) STOCK_META = { table: "stock_inventory", medCol: "medicine_name", qtyCol: "quantity" };
  else if (s2) STOCK_META = { table: "inventory", medCol: "medicine", qtyCol: "stock" };
  else if (s3) STOCK_META = { table: "stock", medCol: "medicine_name", qtyCol: "quantity" };
  else throw new Error("No supported stock table found");

  console.log("[stock-meta]", STOCK_META);
  return STOCK_META;
}

const norm = (s) => String(s || "").trim().replace(/\s+/g, " ");

/* =========================================================
   ➕ CREATE Prescription
========================================================= */
router.post("/", async (req, res) => {
  try {
    const {
      patient_id,
      medication_name,
      times_per_day,
      duration_days,
      total_quantity,
      start_date,
      instructions,
      service_type,
      diagnosis,
    } = req.body;

    if (!patient_id || !medication_name || !times_per_day || !duration_days) {
      return res.status(400).json({
        error: "patient_id, medication_name, times_per_day, duration_days are required",
      });
    }

    const userUuid = await resolvePatientUserId(patient_id);
    if (!userUuid) return res.status(400).json({ error: "Invalid patient_id" });

    const qty = Number(total_quantity || 0);
    if (!qty || qty <= 0) {
      return res.status(400).json({ error: "total_quantity must be positive" });
    }

    /* -----------------------------------------
       Optional diagnosis auto-lookup
    ----------------------------------------- */
    let finalDiagnosis = diagnosis || null;

    if (!finalDiagnosis) {
      try {
        const { rows } = await pool.query(
          "SELECT diagnosis FROM patients WHERE id=$1 OR user_id=$1 LIMIT 1",
          [patient_id]
        );
        if (rows.length && rows[0].diagnosis) finalDiagnosis = rows[0].diagnosis;
      } catch {}
    }

    /* -----------------------------------------
       Stock deduction (optional)
    ----------------------------------------- */
    const medName = medication_name.trim();

    try {
      const meta = await detectStockMeta(pool);

      const sel = await pool.query(
        `SELECT * FROM ${meta.table} WHERE LOWER(${meta.medCol}) = LOWER($1) LIMIT 1`,
        [medName]
      );

      if (sel.rows.length) {
        const stock = sel.rows[0];
        const currentQty = Number(stock[meta.qtyCol] || 0);

        if (qty <= currentQty) {
          await pool.query(
            `UPDATE ${meta.table} 
             SET ${meta.qtyCol}=${meta.qtyCol}-$2, last_updated=NOW()
             WHERE id=$1`,
            [stock.id, qty]
          );

          // optional movement log
          try {
            await pool.query(
              `INSERT INTO stock_movements
               (stock_id, medicine_name, change_qty, reason, ref_table, given_to, batch_number, expiration_date)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [
                stock.id,
                medName,
                -Math.abs(qty),
                "Prescription created",
                "prescriptions",
                patient_id,
                stock.batch_number || null,
                stock.expiration_date || null,
              ]
            );
          } catch {}
        }
      }
    } catch (err) {
      console.warn("[stock] skipped:", err.message);
    }

    /* -----------------------------------------
       Insert Prescription
    ----------------------------------------- */
    let rxRes;

    try {
      rxRes = await pool.query(
        `INSERT INTO prescriptions
           (patient_id, medication_name, times_per_day, duration_days, total_quantity, start_date,
            instructions, created_at, diagnosis, service_type)
         VALUES ($1,$2,$3,$4,$5,COALESCE($6,CURRENT_DATE),$7,NOW(),$8,$9)
         RETURNING *`,
        [
          userUuid,
          medName,
          times_per_day,
          duration_days,
          qty,
          start_date || null,
          instructions || null,
          finalDiagnosis || null,
          service_type || null,
        ]
      );
    } catch (err) {
      // fallback: schema without diagnosis/service_type
      rxRes = await pool.query(
        `INSERT INTO prescriptions
         (patient_id, medication_name, times_per_day, duration_days, total_quantity, start_date,
          instructions, created_at)
         VALUES ($1,$2,$3,$4,$5,COALESCE($6,CURRENT_DATE),$7,NOW())
         RETURNING *`,
        [
          userUuid,
          medName,
          times_per_day,
          duration_days,
          qty,
          start_date || null,
          instructions || null,
        ]
      );
    }

    return res.status(201).json(rxRes.rows[0]);
  } catch (e) {
    console.error("❌ create prescription:", e);
    res.status(500).json({ error: e.message });
  }
});

/* =========================================================
   📋 LIST by Patient
========================================================= */
router.get("/patient/:patientId", async (req, res) => {
  try {
    const uuid = await resolvePatientUserId(req.params.patientId);
    if (!uuid) return res.json([]);

    const { rows } = await pool.query(
      "SELECT * FROM prescriptions WHERE patient_id=$1 ORDER BY created_at DESC",
      [uuid]
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================================================
   ✏️ UPDATE Prescription
========================================================= */
router.put("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { id } = req.params;
    const {
      medication_name,
      times_per_day,
      duration_days,
      total_quantity,
      start_date,
      instructions,
    } = req.body;

    const oldRxRes = await client.query("SELECT * FROM prescriptions WHERE id=$1", [id]);
    if (!oldRxRes.rows.length)
      return res.status(404).json({ error: "Prescription not found" });

    const oldRx = oldRxRes.rows[0];
    const newQty = Number(total_quantity || 0);

    if (newQty <= 0) return res.status(400).json({ error: "Invalid total_quantity" });

    const meta = await detectStockMeta(client);
    const name = norm(medication_name || oldRx.medication_name);

    const stockRow = await client.query(
      `SELECT * FROM ${meta.table} WHERE LOWER(${meta.medCol}) = LOWER($1) LIMIT 1`,
      [name]
    );

    if (!stockRow.rows.length)
      return res.status(400).json({ error: `No stock found for "${name}"` });

    const stock = stockRow.rows[0];
    const currentQty = Number(stock[meta.qtyCol]);
    const diff = newQty - oldRx.total_quantity;

    if (diff > 0 && diff > currentQty)
      return res.status(400).json({
        error: `Insufficient stock. Need +${diff}, available ${currentQty}`,
      });

    await client.query(
      `UPDATE ${meta.table}
       SET ${meta.qtyCol}=${meta.qtyCol}-$2
       WHERE id=$1`,
      [stock.id, diff]
    );

    const cleanDate = start_date || null;

    const { rows } = await client.query(
      `UPDATE prescriptions
         SET medication_name=$2, times_per_day=$3, duration_days=$4, total_quantity=$5,
             start_date=COALESCE($6,start_date),
             instructions=COALESCE($7,instructions),
             updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [id, name, times_per_day, duration_days, newQty, cleanDate, instructions]
    );

    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

/* =========================================================
   🗑️ DELETE Prescription
========================================================= */
router.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { id } = req.params;

    const { rows: presRows } = await client.query(
      `SELECT id, medication_name, total_quantity, patient_id
       FROM prescriptions
       WHERE id=$1`,
      [id]
    );

    if (!presRows.length)
      return res.status(404).json({ error: "Prescription not found" });

    const rx = presRows[0];

    const { rows: patientRows } = await client.query(
      `SELECT first_name, last_name 
       FROM patients 
       WHERE user_id=$1 LIMIT 1`,
      [rx.patient_id]
    );

    const patient = patientRows[0] || {};
    const patientName = `${patient.first_name || ""} ${patient.last_name || ""}`.trim();

    const meta = await detectStockMeta(client);
    const medName = rx.medication_name.trim();

    const stockRow = await client.query(
      `SELECT * FROM ${meta.table}
       WHERE LOWER(${meta.medCol}) = LOWER($1)
       LIMIT 1`,
      [medName]
    );

    if (stockRow.rows.length) {
      const stock = stockRow.rows[0];

      await client.query(
        `UPDATE ${meta.table}
         SET ${meta.qtyCol}=${meta.qtyCol}+$2, last_updated=NOW()
         WHERE id=$1`,
        [stock.id, rx.total_quantity]
      );

      await client.query(
        `INSERT INTO stock_movements
           (stock_id, medicine_name, change_qty, reason, ref_table, given_to)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          stock.id,
          medName,
          rx.total_quantity,
          "Prescription deleted",
          "prescriptions",
          patientName,
        ]
      );
    }

    await client.query(`DELETE FROM prescriptions WHERE id=$1`, [id]);

    await client.query("COMMIT");
    res.json({ ok: true, restored: rx.total_quantity });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

/* =========================================================
   📤 IMAGE UPLOAD
========================================================= */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/webp"];
    if (!ok.includes(file.mimetype)) return cb(new Error("Invalid file type"));
    cb(null, true);
  },
});

const randomName = (len = 8) => crypto.randomBytes(len).toString("hex");

router.post("/:id/image", upload.single("image"), async (req, res) => {
  try {
    if (!supabase) return res.status(501).json({ error: "Image upload disabled" });

    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: "No file received" });

    const { rows } = await pool.query("SELECT id FROM prescriptions WHERE id=$1", [id]);
    if (!rows.length) return res.status(404).json({ error: "Prescription not found" });

    const ext = path.extname(req.file.originalname || ".jpg").toLowerCase();
    const filePath = `${id}/${randomName()}${ext}`;

    const { error: upErr } = await supabase.storage
      .from("prescriptions")
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (upErr) throw upErr;

    if (HAS_IMAGE_PATH)
      await pool.query("UPDATE prescriptions SET image_path=$2 WHERE id=$1", [id, filePath]);

    res.json({ ok: true, file_path: filePath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id/signed-url", async (req, res) => {
  try {
    if (!supabase) return res.status(501).json({ error: "Signed URL disabled" });

    const { id } = req.params;
    const { rows } = await pool.query(
      "SELECT image_path FROM prescriptions WHERE id=$1",
      [id]
    );

    const filePath = rows[0]?.image_path;
    if (!filePath) return res.status(404).json({ error: "no_image" });

    const { data, error } = await supabase.storage
      .from("prescriptions")
      .createSignedUrl(filePath, 60 * 60 * 24 * 7);

    if (error) throw error;

    res.json({ url: data.signedUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
