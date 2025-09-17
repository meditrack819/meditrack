// backend/routes/prescriptions.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');

const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

/* ---------- Supabase Storage (private bucket) ---------- */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[prescriptions] ⚠️ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — image upload will be disabled.');
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  (async () => {
    try {
      await supabase.storage.createBucket('prescriptions', {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      });
    } catch (e) {
      // ignore "already exists"
    }
  })();
}

/* ---------- Feature detection ---------- */

/* Optional prescriptions.instructions column (you had this) */
let HAS_INSTRUCTIONS = false;
/* Optional prescriptions.image_path column */
let HAS_IMAGE_PATH = false;
/* Optional side-table prescription_images (prescription_id, file_path, created_at) */
let HAS_IMAGE_TABLE = false;

(async () => {
  try {
    const { rows } = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_name='prescriptions'
          AND column_name IN ('instructions','image_path')`
    );
    HAS_INSTRUCTIONS = rows.some(r => r.column_name === 'instructions');
    HAS_IMAGE_PATH   = rows.some(r => r.column_name === 'image_path');
    console.log('[prescriptions] instructions column:', HAS_INSTRUCTIONS, 'image_path column:', HAS_IMAGE_PATH);
  } catch (e) {
    console.warn('[prescriptions] column detect failed:', e.message);
  }

  try {
    const { rows } = await pool.query(`SELECT to_regclass('prescription_images') AS t`);
    HAS_IMAGE_TABLE = !!rows?.[0]?.t;
    console.log('[prescriptions] prescription_images table present:', HAS_IMAGE_TABLE);
  } catch (e) {
    console.warn('[prescriptions] table detect failed:', e.message);
  }
})();

/* Resolve patients.id (int) → patients.user_id (uuid) */
async function resolvePatientUserId(maybeId) {
  const val = String(maybeId || '').trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
  if (isUuid) return val;

  const n = Number(val);
  if (!Number.isFinite(n)) return null;

  const { rows } = await pool.query('SELECT user_id FROM patients WHERE id = $1 LIMIT 1', [n]);
  return rows[0]?.user_id || null;
}

/* Stock table meta (supports stock_inventory or legacy inventory) */
let STOCK_META = null;
async function detectStockMeta(client) {
  if (STOCK_META) return STOCK_META;

  const reg = await client.query(`SELECT to_regclass('stock_inventory') AS s1, to_regclass('inventory') AS s2`);
  const s1 = reg.rows[0]?.s1;
  const s2 = reg.rows[0]?.s2;

  if (s1) {
    STOCK_META = { table: 'stock_inventory', medCol: 'medicine_name', qtyCol: 'quantity', expCol: 'expiration_date' };
    console.log('[stock-meta] using stock_inventory(medicine_name, quantity)');
    return STOCK_META;
  }
  if (s2) {
    STOCK_META = { table: 'inventory', medCol: 'medicine', qtyCol: 'stock', expCol: 'expiration_date' };
    console.log('[stock-meta] using inventory(medicine, stock)');
    return STOCK_META;
  }
  throw new Error('No supported stock table found (expected stock_inventory or inventory)');
}
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/* DEBUG: which stock table is used */
router.get('/_debug/stock-meta', async (_req, res) => {
  const client = await pool.connect();
  try {
    const meta = await detectStockMeta(client);
    res.json(meta);
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

/* ---------- CREATE: POST /prescriptions — decrement stock atomically ---------- */
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      patient_id,
      medication_name,
      times_per_day,
      duration_days,
      total_quantity,
      start_date,
      instructions,
    } = req.body;

    if (!patient_id || !medication_name || !times_per_day || !duration_days) {
      return res.status(400).json({
        error: 'patient_id, medication_name, times_per_day, duration_days are required',
      });
    }
    const userUuid = await resolvePatientUserId(patient_id);
    if (!userUuid) return res.status(400).json({ error: 'Invalid patient_id' });

    const qty = Number(total_quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ error: 'total_quantity must be a positive number' });
    }

    await client.query('BEGIN');

    const meta = await detectStockMeta(client);

    // Find stock row case-insensitive exact; fallback to first token
    const name = norm(medication_name);
    let sel = await client.query(
      `SELECT * FROM ${meta.table} WHERE LOWER(${meta.medCol}) = LOWER($1) LIMIT 1`,
      [name]
    );
    if (!sel.rows.length) {
      const token = name.split(' ')[0];
      if (token) {
        sel = await client.query(
          `SELECT * FROM ${meta.table}
            WHERE ${meta.medCol} ILIKE $1
            ORDER BY LENGTH(${meta.medCol}) ASC LIMIT 1`,
          [`%${token}%`]
        );
      }
    }
    if (!sel.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `No stock found for "${medication_name}". Add it in stock first.` });
    }

    const row = sel.rows[0];
    const currentQty = Number(row[meta.qtyCol] ?? 0);
    if (qty > currentQty) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Insufficient stock for "${row[meta.medCol]}". Requested ${qty}, available ${currentQty}.`
      });
    }

    // Decrement
    const dec = await client.query(
      `UPDATE ${meta.table}
          SET ${meta.qtyCol} = ${meta.qtyCol} - $2
        WHERE id = $1
      RETURNING *`,
      [row.id, qty]
    );
    const stockAfter = dec.rows[0];

    // Insert prescription
    const rxSQL = HAS_INSTRUCTIONS ? `
      INSERT INTO prescriptions
        (patient_id, medication_name, times_per_day, duration_days, total_quantity,
         start_date, instructions, first_intake_time, created_at)
      VALUES ($1,$2,$3,$4,$5, COALESCE($6, CURRENT_DATE), $7, NULL, NOW())
      RETURNING *`
    : `
      INSERT INTO prescriptions
        (patient_id, medication_name, times_per_day, duration_days, total_quantity,
         start_date, first_intake_time, created_at)
      VALUES ($1,$2,$3,$4,$5, COALESCE($6, CURRENT_DATE), NULL, NOW())
      RETURNING *`;
    const rxParams = HAS_INSTRUCTIONS
      ? [userUuid, norm(medication_name), Number(times_per_day), Number(duration_days), qty, start_date || null, instructions || null]
      : [userUuid, norm(medication_name), Number(times_per_day), Number(duration_days), qty, start_date || null];
    const rxIns = await client.query(rxSQL, rxParams);
    const rx = rxIns.rows[0];

    // Optional audit
    try {
      await client.query(
        `INSERT INTO stock_movements (stock_id, medicine_name, change_qty, reason, ref_table, ref_id)
         VALUES ($1, $2, $3, 'prescription', 'prescriptions', $4)`,
        [stockAfter.id, stockAfter[meta.medCol], -qty, rx.id]
      );
    } catch {}

    await client.query('COMMIT');
    res.status(201).json({ prescription: rx, stock_after: stockAfter, stock_meta: meta });
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('create prescription (with stock) error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

/* ---------- PATCH /prescriptions/:id/first-time ---------- */
router.patch('/:id/first-time', async (req, res) => {
  try {
    const { id } = req.params;
    const first = String(req.body.first_time || '').trim();
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(first);
    if (!m) return res.status(400).json({ error: 'first_time must be "HH:mm" (24h)' });

    const { rows } = await pool.query(
      `UPDATE prescriptions
          SET first_intake_time = $2
        WHERE id = $1
        RETURNING *`,
      [id, first]
    );

    if (!rows.length) return res.status(404).json({ error: 'Prescription not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('set first_intake_time error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- LIST by patient ---------- */
router.get('/patient/:patientId', async (req, res) => {
  try {
    const userUuid = await resolvePatientUserId(req.params.patientId);
    if (!userUuid) return res.json([]);

    const { rows } = await pool.query(
      `SELECT * FROM prescriptions
        WHERE patient_id = $1
        ORDER BY created_at DESC`,
      [userUuid]
    );
    res.json(rows);
  } catch (e) {
    console.error('list by patient error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- legacy GET /prescriptions/:patientId ---------- */
router.get('/:patientId', async (req, res) => {
  try {
    const userUuid = await resolvePatientUserId(req.params.patientId);
    if (!userUuid) return res.json([]);

    const { rows } = await pool.query(
      `SELECT * FROM prescriptions
        WHERE patient_id = $1
        ORDER BY created_at DESC`,
      [userUuid]
    );
    res.json(rows);
  } catch (e) {
    console.error('legacy list error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- DELETE /prescriptions/:id — restore stock ---------- */
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sel = await client.query(
      `SELECT id, medication_name, total_quantity
         FROM prescriptions
        WHERE id = $1
        LIMIT 1`,
      [req.params.id]
    );
    if (!sel.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Prescription not found' });
    }
    const rx = sel.rows[0];

    const meta = await detectStockMeta(client);
    const up = await client.query(
      `UPDATE ${meta.table}
          SET ${meta.qtyCol} = ${meta.qtyCol} + COALESCE($2,0)
        WHERE LOWER(${meta.medCol}) = LOWER($1)
      RETURNING *`,
      [rx.medication_name, rx.total_quantity]
    );

    try {
      if (up.rows.length) {
        await client.query(
          `INSERT INTO stock_movements (stock_id, medicine_name, change_qty, reason, ref_table, ref_id)
           VALUES ($1, $2, COALESCE($3,0), 'rx-delete-return', 'prescriptions', $4)`,
          [up.rows[0].id, up.rows[0][meta.medCol], rx.total_quantity, rx.id]
        );
      }
    } catch {}

    await client.query(`DELETE FROM prescriptions WHERE id = $1`, [rx.id]);

    await client.query('COMMIT');
    res.json({ ok: true, stock_after: up.rows[0] || null, stock_meta: meta });
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('delete prescription (with stock return) error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

/* ======================================================================= */
/* ======================  NEW IMAGE UPLOAD / SIGNED URL  ================= */
/* ======================================================================= */

/* Multer memory storage for images */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/webp'];
    if (!ok.includes(file.mimetype)) return cb(new Error('Only PNG/JPEG/WEBP allowed'));
    cb(null, true);
  },
});

function randomName(len = 8) {
  return crypto.randomBytes(len).toString('hex');
}

/**
 * POST /prescriptions/:id/image
 * Field: "file" (multipart/form-data)
 * Stores to Supabase bucket "prescriptions" at prescriptions/:id/<rand>.<ext>
 * Saves path either to prescriptions.image_path OR inserts into prescription_images
 */
router.post('/:id/image', upload.single('file'), async (req, res) => {
  try {
    if (!supabase) return res.status(501).json({ error: 'Image upload disabled: Supabase env not configured' });
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: 'file is required' });

    // Ensure rx exists
    const { rows: rxRows } = await pool.query(`SELECT id FROM prescriptions WHERE id = $1 LIMIT 1`, [id]);
    if (!rxRows.length) return res.status(404).json({ error: 'Prescription not found' });

    const ext = (path.extname(req.file.originalname || '').toLowerCase() || '.jpg').replace(/[^.\w]/g, '');
    const filePath = `${id}/${randomName()}${ext}`;

    const { error: upErr } = await supabase.storage
      .from('prescriptions')
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

    if (upErr) return res.status(500).json({ error: 'upload_failed', detail: upErr.message });

    // Persist path
    if (HAS_IMAGE_PATH) {
      await pool.query(`UPDATE prescriptions SET image_path = $2 WHERE id = $1`, [id, filePath]);
    } else if (HAS_IMAGE_TABLE) {
      await pool.query(
        `INSERT INTO prescription_images (prescription_id, file_path, created_at) VALUES ($1, $2, NOW())`,
        [id, filePath]
      );
    } else {
      return res.status(501).json({
        error: 'missing_storage_mapping',
        message:
          "Add either a 'prescriptions.image_path TEXT' column or a 'prescription_images' table to store file paths.",
        example_sql:
          "ALTER TABLE prescriptions ADD COLUMN image_path TEXT; -- or create table prescription_images (id uuid default gen_random_uuid() primary key, prescription_id uuid references prescriptions(id) on delete cascade, file_path text not null, created_at timestamptz not null default now());",
      });
    }

    return res.status(201).json({ ok: true, file_path: filePath });
  } catch (e) {
    console.error('upload image error:', e);
    return res.status(500).json({ error: e.message });
  }
});

/**
 * GET /prescriptions/:id/signed-url
 * Returns { url, expires_in }
 * Looks up file_path from prescriptions.image_path or latest in prescription_images.
 */
router.get('/:id/signed-url', async (req, res) => {
  try {
    if (!supabase) return res.status(501).json({ error: 'Signed URL disabled: Supabase env not configured' });

    const { id } = req.params;
    let filePath = null;

    if (HAS_IMAGE_PATH) {
      const { rows } = await pool.query(`SELECT image_path FROM prescriptions WHERE id = $1 LIMIT 1`, [id]);
      filePath = rows?.[0]?.image_path || null;
    } else if (HAS_IMAGE_TABLE) {
      const { rows } = await pool.query(
        `SELECT file_path FROM prescription_images WHERE prescription_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [id]
      );
      filePath = rows?.[0]?.file_path || null;
    } else {
      return res.status(404).json({ error: 'no_image' });
    }

    if (!filePath) return res.status(404).json({ error: 'no_image' });

    const { data, error } = await supabase.storage.from('prescriptions').createSignedUrl(filePath, 60 * 60 * 24 * 7);
    if (error) return res.status(500).json({ error: 'sign_failed', detail: error.message });

    return res.json({ url: data?.signedUrl, expires_in: 60 * 60 * 24 * 7 });
  } catch (e) {
    console.error('signed-url error:', e);
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
