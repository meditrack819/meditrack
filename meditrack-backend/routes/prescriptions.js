// backend/routes/prescriptions.js
const express = require("express");
const router = express.Router();
const { pool } = require("../db");

const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

/* ---------- Supabase Storage (private bucket) ---------- */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("[prescriptions] ⚠️ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — image upload disabled.");
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  (async () => {
    try {
      await supabase.storage.createBucket("prescriptions", {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
      });
    } catch {
      // ignore "already exists"
    }
  })();
}

/* ---------- Feature detection ---------- */
let HAS_INSTRUCTIONS = false;
let HAS_IMAGE_PATH = false;

(async () => {
  try {
    const { rows } = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_name='prescriptions'
          AND column_name IN ('instructions','image_path')`
    );
    HAS_INSTRUCTIONS = rows.some((r) => r.column_name === "instructions");
    HAS_IMAGE_PATH = rows.some((r) => r.column_name === "image_path");
    console.log("[prescriptions] instructions:", HAS_INSTRUCTIONS, "image_path:", HAS_IMAGE_PATH);
  } catch (e) {
    console.warn("[prescriptions] column detect failed:", e.message);
  }
})();

/* ---------- Helper: resolve patient identifiers ---------- */
async function resolvePatientUserId(maybeId) {
  const val = String(maybeId || "").trim();
  if (!val) return null;

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
  if (isUuid) return val;

  const { rows } = await pool.query(
    "SELECT user_id FROM patients WHERE id = $1 LIMIT 1",
    [val]
  );
  return rows[0]?.user_id || null;
}

/* ---------- Stock table detection ---------- */
let STOCK_META = null;
async function detectStockMeta(client) {
  if (STOCK_META) return STOCK_META;

  const reg = await client.query(
    `SELECT to_regclass('stock_inventory') AS s1, to_regclass('inventory') AS s2`
  );
  const s1 = reg.rows[0]?.s1;
  const s2 = reg.rows[0]?.s2;

  if (s1) {
    STOCK_META = { table: "stock_inventory", medCol: "medicine_name", qtyCol: "quantity" };
    console.log("[stock-meta] using stock_inventory");
    return STOCK_META;
  }
  if (s2) {
    STOCK_META = { table: "inventory", medCol: "medicine", qtyCol: "stock" };
    console.log("[stock-meta] using inventory");
    return STOCK_META;
  }
  throw new Error("No supported stock table found");
}

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();

/* ---------- CREATE: POST /prescriptions ---------- */
router.post("/", async (req, res) => {
  const client = await pool.connect();
  try {
    const { patient_id, medication_name, times_per_day, duration_days, total_quantity, start_date, instructions } = req.body;

    if (!patient_id || !medication_name || !times_per_day || !duration_days) {
      return res.status(400).json({ error: "patient_id, medication_name, times_per_day, duration_days are required" });
    }
    const userUuid = await resolvePatientUserId(patient_id);
    if (!userUuid) return res.status(400).json({ error: "Invalid patient_id" });

    const qty = Number(total_quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0)
      return res.status(400).json({ error: "total_quantity must be positive" });

    await client.query("BEGIN");
    const meta = await detectStockMeta(client);

    // Lookup stock
    const name = norm(medication_name);
    let sel = await client.query(
      `SELECT * FROM ${meta.table} WHERE LOWER(${meta.medCol}) = LOWER($1) LIMIT 1`,
      [name]
    );
    if (!sel.rows.length) {
      const token = name.split(" ")[0];
      if (token) {
        sel = await client.query(
          `SELECT * FROM ${meta.table} WHERE ${meta.medCol} ILIKE $1 ORDER BY LENGTH(${meta.medCol}) ASC LIMIT 1`,
          [`%${token}%`]
        );
      }
    }
    if (!sel.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `No stock found for "${medication_name}"` });
    }

    const row = sel.rows[0];
    const currentQty = Number(row[meta.qtyCol] ?? 0);
    if (qty > currentQty) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Insufficient stock. Requested ${qty}, available ${currentQty}` });
    }

    // Decrement stock
    await client.query(
      `UPDATE ${meta.table} SET ${meta.qtyCol} = ${meta.qtyCol} - $2 WHERE id = $1`,
      [row.id, qty]
    );

    // Insert prescription
    const rxSQL = HAS_INSTRUCTIONS ? `
      INSERT INTO prescriptions
        (patient_id, medication_name, times_per_day, duration_days, total_quantity,
         start_date, instructions, created_at)
      VALUES ($1,$2,$3,$4,$5, COALESCE($6, CURRENT_DATE), $7, NOW())
      RETURNING *`
    : `
      INSERT INTO prescriptions
        (patient_id, medication_name, times_per_day, duration_days, total_quantity,
         start_date, created_at)
      VALUES ($1,$2,$3,$4,$5, COALESCE($6, CURRENT_DATE), NOW())
      RETURNING *`;
    const rxParams = HAS_INSTRUCTIONS
      ? [userUuid, norm(medication_name), Number(times_per_day), Number(duration_days), qty, start_date || null, instructions || null]
      : [userUuid, norm(medication_name), Number(times_per_day), Number(duration_days), qty, start_date || null];
    const rxIns = await client.query(rxSQL, rxParams);

    await client.query("COMMIT");
    res.status(201).json(rxIns.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("create prescription error:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

/* ---------- LIST by patient ---------- */
router.get("/patient/:patientId", async (req, res) => {
  try {
    const userUuid = await resolvePatientUserId(req.params.patientId);
    if (!userUuid) return res.json([]);
    const { rows } = await pool.query(
      `SELECT * FROM prescriptions WHERE patient_id = $1 ORDER BY created_at DESC`,
      [userUuid]
    );
    res.json(rows);
  } catch (e) {
    console.error("list prescriptions error:", e);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- UPDATE prescription ---------- */
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

    // 1. Get existing prescription
    const oldRxRes = await client.query(
      `SELECT * FROM prescriptions WHERE id=$1`,
      [id]
    );
    if (!oldRxRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Prescription not found" });
    }
    const oldRx = oldRxRes.rows[0];

    const newQty = Number(total_quantity);
    if (!Number.isFinite(newQty) || newQty <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "total_quantity must be positive" });
    }

    const meta = await detectStockMeta(client);

    // 2. Find stock row for this medicine
    const name = norm(medication_name || oldRx.medication_name);
    let stockRow = await client.query(
      `SELECT * FROM ${meta.table} WHERE LOWER(${meta.medCol}) = LOWER($1) LIMIT 1`,
      [name]
    );
    if (!stockRow.rows.length) {
      const token = name.split(" ")[0];
      if (token) {
        stockRow = await client.query(
          `SELECT * FROM ${meta.table} WHERE ${meta.medCol} ILIKE $1 ORDER BY LENGTH(${meta.medCol}) ASC LIMIT 1`,
          [`%${token}%`]
        );
      }
    }

    if (!stockRow.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `No stock found for "${name}"` });
    }

    const row = stockRow.rows[0];
    const currentQty = Number(row[meta.qtyCol] ?? 0);

    // 3. Adjust stock based on difference
    const diff = newQty - oldRx.total_quantity; // + if increased, - if decreased
    if (diff > 0 && diff > currentQty) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Insufficient stock. Need +${diff}, available ${currentQty}` });
    }

    await client.query(
      `UPDATE ${meta.table} SET ${meta.qtyCol} = ${meta.qtyCol} - $2 WHERE id = $1`,
      [row.id, diff]
    );

    // 4. Update prescription
    const { rows } = await client.query(
      `UPDATE prescriptions
         SET medication_name=$2,
             times_per_day=$3,
             duration_days=$4,
             total_quantity=$5,
             start_date=COALESCE($6, start_date),
             instructions=COALESCE($7, instructions)
       WHERE id=$1
       RETURNING *`,
      [
        id,
        name,
        times_per_day,
        duration_days,
        newQty,
        start_date || null,
        instructions || null,
      ]
    );

    await client.query("COMMIT");
    res.json(rows[0]);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("update prescription error:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});


/* ---------- DELETE prescription ---------- */
router.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Get prescription
    const sel = await client.query(
      `SELECT id, medication_name, total_quantity FROM prescriptions WHERE id=$1`,
      [req.params.id]
    );
    if (!sel.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Prescription not found" });
    }
    const rx = sel.rows[0];

    // 2. Detect stock table
    const meta = await detectStockMeta(client);

    // 3. Find the exact stock row (same logic as in CREATE)
    const name = norm(rx.medication_name);
    let stockRow = await client.query(
      `SELECT id FROM ${meta.table} WHERE LOWER(${meta.medCol}) = LOWER($1) LIMIT 1`,
      [name]
    );
    if (!stockRow.rows.length) {
      const token = name.split(" ")[0];
      if (token) {
        stockRow = await client.query(
          `SELECT id FROM ${meta.table} WHERE ${meta.medCol} ILIKE $1 ORDER BY LENGTH(${meta.medCol}) ASC LIMIT 1`,
          [`%${token}%`]
        );
      }
    }

    if (stockRow.rows.length) {
      // 4. Restore stock
      await client.query(
        `UPDATE ${meta.table} SET ${meta.qtyCol} = ${meta.qtyCol} + $2 WHERE id = $1`,
        [stockRow.rows[0].id, rx.total_quantity]
      );
    } else {
      console.warn(`[delete] No stock row found for ${rx.medication_name}`);
    }

    // 5. Delete prescription
    await client.query(`DELETE FROM prescriptions WHERE id=$1`, [rx.id]);

    await client.query("COMMIT");
    res.json({ ok: true, restored: rx.total_quantity });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("delete prescription error:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});


/* ======================================================================= */
/* ======================  IMAGE UPLOAD / SIGNED URL  ==================== */
/* ======================================================================= */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/webp"];
    if (!ok.includes(file.mimetype)) {
      return cb(new Error("Only PNG, JPEG, and WEBP files are allowed"));
    }
    cb(null, true);
  },
});

function randomName(len = 8) {
  return crypto.randomBytes(len).toString("hex");
}

/* ---------- POST /prescriptions/:id/image ---------- */
router.post("/:id/image", (req, res) => {
  const singleUpload = upload.single("image"); // expects "image"
  singleUpload(req, res, async (err) => {
    if (err) {
      console.error("multer error:", err.message);
      return res.status(400).json({ error: err.message });
    }

    try {
      if (!supabase) return res.status(501).json({ error: "Image upload disabled" });
      const { id } = req.params;

      if (!req.file) {
        console.warn("[upload] No file received");
        return res.status(400).json({ error: "No file received" });
      }

      console.log(`[upload] file received: name=${req.file.originalname}, type=${req.file.mimetype}, size=${req.file.size} bytes`);

      const { rows } = await pool.query(`SELECT id FROM prescriptions WHERE id=$1`, [id]);
      if (!rows.length) return res.status(404).json({ error: "Prescription not found" });

      const ext = (path.extname(req.file.originalname || "").toLowerCase() || ".jpg").replace(/[^.\w]/g, "");
      const filePath = `${id}/${randomName()}${ext}`;

      const { error: upErr } = await supabase.storage
        .from("prescriptions")
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (upErr) {
        console.error("supabase upload error:", upErr.message);
        return res.status(500).json({ error: "upload_failed", detail: upErr.message });
      }

      if (HAS_IMAGE_PATH) {
        await pool.query(`UPDATE prescriptions SET image_path=$2 WHERE id=$1`, [id, filePath]);
      }

      res.status(201).json({ ok: true, file_path: filePath });
    } catch (e) {
      console.error("upload image error:", e);
      res.status(500).json({ error: e.message });
    }
  });
});

/* ---------- GET /prescriptions/:id/signed-url ---------- */
router.get("/:id/signed-url", async (req, res) => {
  try {
    if (!supabase) return res.status(501).json({ error: "Signed URL disabled" });

    const { id } = req.params;
    const { rows } = await pool.query(`SELECT image_path FROM prescriptions WHERE id=$1`, [id]);
    const filePath = rows?.[0]?.image_path || null;

    if (!filePath) return res.status(404).json({ error: "no_image" });

    const { data, error } = await supabase.storage
      .from("prescriptions")
      .createSignedUrl(filePath, 60 * 60 * 24 * 7);
    if (error) return res.status(500).json({ error: "sign_failed", detail: error.message });

    res.json({ url: data?.signedUrl, expires_in: 60 * 60 * 24 * 7 });
  } catch (e) {
    console.error("signed-url error:", e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
