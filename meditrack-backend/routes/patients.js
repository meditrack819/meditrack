// routes/patients.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

/* ---------------- Supabase Admin (optional; only used if email is provided) ---------------- */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing. Auth actions will be skipped when creating patients without email (email is optional).');
}
const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

/* ---------------- helpers ---------------- */
function generatePassword() {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const a = 'abcdefghijklmnopqrstuvwxyz';
  const d = '0123456789';
  const pools = [A, a, d];
  const pick = (s) => s[crypto.randomInt(0, s.length)];
  let pwd = pools.map(pick).join('');
  const all = A + a + d;
  while (pwd.length < 12) pwd += pick(all);
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

const toNull = (v) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? null : v;

const ymdOrNull = (v) => {
  if (toNull(v) === null) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const titleCase = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();

const cleanPhone = (s) =>
  (s || '').replace(/[^\d+]/g, '').replace(/^00/, '+').trim();

const normalizeIncoming = (body) => {
  const p = { ...body };
  p.first_name  = titleCase(p.first_name);
  p.middle_name = titleCase(p.middle_name);
  p.last_name   = titleCase(p.last_name);

  p.email       = toNull(p.email) ? String(p.email).trim().toLowerCase() : null; // optional
  p.phone       = toNull(p.phone) ? cleanPhone(p.phone) : null;

  p.birthdate   = ymdOrNull(p.birthdate);
  p.sex         = toNull(p.sex) ? titleCase(p.sex) : null;

  p.building_no = toNull(p.building_no) ? titleCase(p.building_no) : null;
  p.street      = toNull(p.street) ? titleCase(p.street) : null;
  p.barangay    = toNull(p.barangay) ? titleCase(p.barangay) : null;
  p.city        = toNull(p.city) ? titleCase(p.city) : null;

  p.last_visit  = ymdOrNull(p.last_visit);
  return p;
};

const compiledNameSQL = `
  CONCAT_WS(' ',
    COALESCE(first_name,''), COALESCE(middle_name,''), COALESCE(last_name,'')
  )
`;

/* ---------------- diagnostics (optional) ---------------- */
router.get('/_columns', async (_req, res) => {
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

/** LIST
 * GET /patients?name=
 * Returns: id, compiled name, email, phone, age (computed), last_visit
 * Fallback: If legacy "name" column still exists and split parts are empty, use it.
 */
router.get('/', async (req, res) => {
  try {
    const { name } = req.query;

    // Detect if legacy "name" column still exists
    const colCheck = await pool.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'name'
      LIMIT 1
    `);
    const hasLegacyName = colCheck.rowCount > 0;

    // Build SELECT list with optional legacy fallback
    // If "name" column exists, prefer compiled; if compiled is empty, use legacy name.
    const selectName = hasLegacyName
      ? `NULLIF(${compiledNameSQL}, '') IS NOT NULL
            ? ${compiledNameSQL}
            : name` // not valid SQL; we'll emulate with COALESCE(NULLIF(compiled,''), NULLIF(name,''))
      : `${compiledNameSQL}`;

    // Emulate the conditional above with SQL:
    const NAME_EXPR = hasLegacyName
      ? `COALESCE(NULLIF(${compiledNameSQL}, ''), NULLIF(name, ''))`
      : `${compiledNameSQL}`;

    let where = '';
    let params = [];
    if (name && name.trim()) {
      params.push(name.trim());
      where = `WHERE ${NAME_EXPR} ILIKE '%' || $1 || '%'`;
    }

    const q = `
      SELECT
        id,
        ${NAME_EXPR} AS name,
        email,
        phone,
        COALESCE(EXTRACT(YEAR FROM age(CURRENT_DATE, birthdate))::int, NULL) AS age,
        last_visit
      FROM patients
      ${where}
      ORDER BY id ASC;
    `;
    const { rows } = await pool.query(q, params);
    const normalized = rows.map(r => ({
      ...r,
      name: r.name ? titleCase(r.name) : null,
      email: r.email || null,
      phone: r.phone || null,
    }));
    res.json(normalized);
  } catch (err) {
    console.error('❌ fetch patients:', err);
    res.status(500).json({ error: err.message });
  }
});

/** GET ONE for edit form (no password/uuid in payload) */
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, middle_name, last_name, email, phone,
              birthdate, sex, building_no, street, barangay, city, last_visit, created_at, photo_url, user_id
       FROM patients WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('❌ fetch patient:', err);
    res.status(500).json({ error: err.message });
  }
});

/** CREATE */
router.post('/', async (req, res) => {
  const client = await pool.connect();
  let authUserId = null;

  try {
    const p = normalizeIncoming(req.body || {});
    if (!p.first_name || !p.last_name) {
      return res.status(400).json({ error: 'first_name and last_name are required' });
    }

    // If email is provided, ensure uniqueness and create auth user
    let finalPassword = null;
    if (p.email) {
      const dup = await pool.query(`SELECT id FROM patients WHERE email = $1 LIMIT 1`, [p.email]);
      if (dup.rows.length) {
        return res.status(409).json({ error: 'A patient with this email already exists.' });
      }
      if (!supabaseAdmin) {
        return res.status(500).json({ error: 'Supabase admin not configured on server (email signups require it).' });
      }
      finalPassword = generatePassword();
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: p.email,
        password: finalPassword,
        email_confirm: true,
        user_metadata: { role: 'patient', name: `${p.first_name} ${p.last_name}`.trim() },
      });
      if (createErr) {
        const msg = createErr.message || 'Auth create failed';
        const http = /already/i.test(msg) ? 409 : 400;
        return res.status(http).json({ error: `Auth create failed: ${msg}` });
      }
      authUserId = created?.user?.id || null;
    }

    await client.query('BEGIN');

    const insertQ = `
      INSERT INTO patients
        (first_name, middle_name, last_name, email, phone,
         birthdate, sex, building_no, street, barangay, city, last_visit, user_id${finalPassword ? ', password' : ''})
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13${finalPassword ? ',$14' : ''})
      RETURNING id;
    `;
    const vals = [
      p.first_name, p.middle_name, p.last_name, p.email, p.phone,
      p.birthdate, p.sex, p.building_no, p.street, p.barangay, p.city, p.last_visit, authUserId
    ];
    if (finalPassword) vals.push(finalPassword);

    const { rows: inserted } = await client.query(insertQ, vals);
    await client.query('COMMIT');

    return res.status(201).json({
      id: inserted[0].id,
      ...(finalPassword ? { password: finalPassword, email: p.email } : {})
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    if (authUserId && supabaseAdmin) {
      try { await supabaseAdmin.auth.admin.deleteUser(authUserId); } catch {}
    }
    console.error('❌ POST /patients failed:', err);
    return res.status(500).json({
      error: err.detail || err.message || 'Database insert error'
    });
  } finally {
    client.release();
  }
});

/** UPDATE */
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const id = req.params.id;

    const { rows: existingRows } = await client.query(
      `SELECT id, user_id, email FROM patients WHERE id = $1`,
      [id]
    );
    if (existingRows.length === 0) return res.status(404).json({ error: 'Patient not found' });
    const existing = existingRows[0];

    const p = normalizeIncoming(req.body || {});

    await client.query('BEGIN');

    // Email uniqueness & auth sync
    if (p.email && p.email !== existing.email) {
      const { rows: conflict } = await client.query(
        `SELECT id FROM patients WHERE email = $1 AND id <> $2 LIMIT 1`,
        [p.email, id]
      );
      if (conflict.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Another patient already uses this email.' });
      }
    }

    const q = `
      UPDATE patients SET
        first_name = COALESCE($1, first_name),
        middle_name= COALESCE($2, middle_name),
        last_name  = COALESCE($3, last_name),
        email      = COALESCE($4, email),
        phone      = COALESCE($5, phone),
        birthdate  = COALESCE($6, birthdate),
        sex        = COALESCE($7, sex),
        building_no= COALESCE($8, building_no),
        street     = COALESCE($9, street),
        barangay   = COALESCE($10, barangay),
        city       = COALESCE($11, city),
        last_visit = COALESCE($12, last_visit)
      WHERE id = $13
      RETURNING id, first_name, middle_name, last_name, email, phone, birthdate, sex, building_no, street, barangay, city, last_visit;
    `;
    const vals = [
      toNull(p.first_name) ? p.first_name : null,
      toNull(p.middle_name) ? p.middle_name : null,
      toNull(p.last_name) ? p.last_name : null,
      toNull(p.email) ? p.email : null,
      toNull(p.phone) ? p.phone : null,
      toNull(p.birthdate) ? p.birthdate : null,
      toNull(p.sex) ? p.sex : null,
      toNull(p.building_no) ? p.building_no : null,
      toNull(p.street) ? p.street : null,
      toNull(p.barangay) ? p.barangay : null,
      toNull(p.city) ? p.city : null,
      toNull(p.last_visit) ? p.last_visit : null,
      id
    ];
    const { rows } = await client.query(q, vals);
    const updated = rows[0];

    // Sync email to Supabase Auth if changed and we have a user
    if (p.email && p.email !== existing.email && existing.user_id && supabaseAdmin) {
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existing.user_id, {
        email: p.email,
      });
      if (updErr) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Auth email update failed: ${updErr.message}` });
      }
    }

    await client.query('COMMIT');
    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ update patient:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

/** DELETE (also delete Auth if present) */
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      `SELECT id, user_id FROM patients WHERE id = $1`,
      [req.params.id]
    );
    if (existing.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Patient not found' });
    }

    const userId = existing[0].user_id;

    const { rows } = await client.query(
      `DELETE FROM patients WHERE id = $1 RETURNING id`,
      [req.params.id]
    );

    if (userId && supabaseAdmin) {
      try { await supabaseAdmin.auth.admin.deleteUser(userId); } catch (e) {
        console.error('⚠️ delete auth user:', e.message);
      }
    }

    await client.query('COMMIT');
    res.json({ message: '✅ Patient deleted', id: rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ delete patient:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
