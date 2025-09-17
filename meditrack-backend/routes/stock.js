const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const ML_HOST = process.env.ML_HOST || '127.0.0.1';
const ML_PORT = Number(process.env.ML_PORT || 8000);
const ML_BASE = process.env.ML_BASE || `http://${ML_HOST}:${ML_PORT}/api/ml`;

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const ML_DATA_XLSX = path.resolve(__dirname, '..', process.env.ML_DATA_XLSX || 'data/health_center_patients_7812.xlsx');

function datasetExists() { try { return fs.existsSync(ML_DATA_XLSX); } catch { return false; } }
function ensureXlsxOr400(res) {
  if (!datasetExists()) {
    res.status(400).json({
      error: 'ml_data_not_found',
      detail: `Excel not found at ${ML_DATA_XLSX}. Upload via /stock/analytics/dataset.`,
    });
    return false;
  }
  return true;
}

const forward = async (res, axiosPromise) => {
  try {
    const { data, status } = await axiosPromise;
    return res.status(status).json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data || { error: 'ml_proxy_failed' };
    console.error('ML proxy error:', status, data);
    return res.status(status).json(data);
  }
};

/* =========================
   STOCK CRUD (unchanged)
   ========================= */

router.get('/', async (req, res) => {
  try {
    const { search, order } = req.query;
    const ord = String(order || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      const result = await pool.query(
        `SELECT id, medicine_name, quantity, expiration_date, last_updated
           FROM stock_inventory
          WHERE medicine_name ILIKE $1
          ORDER BY medicine_name ${ord}`,
        [q]
      );
      return res.json(result.rows);
    }

    const result = await pool.query(
      `SELECT id, medicine_name, quantity, expiration_date, last_updated
         FROM stock_inventory
        ORDER BY id ASC`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('GET /stock error:', err);
    res.status(500).json({ error: 'Failed to fetch stock' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, medicine_name, quantity, expiration_date, last_updated
         FROM stock_inventory
        WHERE id = $1
        LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /stock/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { medicine_name, quantity, expiration_date, mode } = req.body;
    if (!medicine_name) return res.status(400).json({ error: 'medicine_name is required' });

    const qty = Number(quantity ?? 0);
    if (!Number.isFinite(qty)) return res.status(400).json({ error: 'quantity must be a number' });

    await client.query('BEGIN');

    const sel = await client.query(
      `SELECT id, quantity FROM stock_inventory WHERE LOWER(medicine_name) = LOWER($1) LIMIT 1`,
      [medicine_name]
    );

    let row;
    if (sel.rows.length) {
      const id = sel.rows[0].id;
      if (String(mode || 'add') === 'set') {
        const upd = await client.query(
          `UPDATE stock_inventory
              SET quantity = $2,
                  expiration_date = COALESCE($3, expiration_date),
                  last_updated = NOW()
            WHERE id = $1
          RETURNING id, medicine_name, quantity, expiration_date, last_updated`,
          [id, qty, expiration_date || null]
        );
        row = upd.rows[0];
      } else {
        const upd = await client.query(
          `UPDATE stock_inventory
              SET quantity = quantity + $2,
                  expiration_date = COALESCE($3, expiration_date),
                  last_updated = NOW()
            WHERE id = $1
          RETURNING id, medicine_name, quantity, expiration_date, last_updated`,
          [id, qty, expiration_date || null]
        );
        row = upd.rows[0];
      }
    } else {
      const ins = await client.query(
        `INSERT INTO stock_inventory (medicine_name, quantity, expiration_date)
         VALUES ($1, $2, $3)
         RETURNING id, medicine_name, quantity, expiration_date, last_updated`,
        [medicine_name, qty, expiration_date || null]
      );
      row = ins.rows[0];
    }

    await client.query('COMMIT');
    res.status(201).json(row);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /stock error:', err);
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'duplicate_medicine', detail: 'Medicine already exists' });
    }
    res.status(500).json({ error: 'Failed to save stock item' });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const id = req.params.id;
    const { medicine_name, quantity, expiration_date } = req.body || {};

    const { rows: ex } = await client.query(
      `SELECT id, medicine_name, quantity, expiration_date
         FROM stock_inventory
        WHERE id = $1
        LIMIT 1`,
      [id]
    );
    if (!ex.length) return res.status(404).json({ error: 'Not found' });

    if (medicine_name !== undefined && !String(medicine_name).trim()) {
      return res.status(400).json({ error: 'medicine_name cannot be empty' });
    }
    if (quantity !== undefined) {
      const qnum = Number(quantity);
      if (!Number.isFinite(qnum)) return res.status(400).json({ error: 'quantity must be a number' });
    }

    const sets = []; const vals = [];
    const push = (frag, v) => { sets.push(frag); vals.push(v); };

    if (medicine_name !== undefined) push(`medicine_name = $${vals.length + 1}`, String(medicine_name).trim());
    if (quantity !== undefined)     push(`quantity = $${vals.length + 1}`, Number(quantity));
    if (expiration_date !== undefined) push(`expiration_date = $${vals.length + 1}`, expiration_date || null);
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });

    const realSets = []; const realVals = []; let idx = 1;
    for (let i = 0; i < sets.length; i++) {
      const frag = sets[i].replace(/\$\d+/, `$${idx++}`); realSets.push(frag); realVals.push(vals[i]);
    }
    realSets.push(`last_updated = NOW()`);

    const sql = `
      UPDATE stock_inventory
         SET ${realSets.join(', ')}
       WHERE id = $${idx}
      RETURNING id, medicine_name, quantity, expiration_date, last_updated
    `;
    realVals.push(id);

    const { rows: updated } = await client.query(sql, realVals);
    if (!updated.length) return res.status(404).json({ error: 'Not found' });
    res.json(updated[0]);
  } catch (err) {
    console.error('PUT /stock/:id error:', err);
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'duplicate_medicine', detail: 'Medicine name already exists' });
    }
    res.status(500).json({ error: 'Failed to update stock item' });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM stock_inventory WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /stock/:id error:', err);
    res.status(500).json({ error: 'Failed to delete stock item' });
  }
});

/* =========================
   ML ANALYTICS
   ========================= */

// Health
router.get('/analytics/ping', async (_req, res) => {
  return forward(res, axios.get(`${ML_BASE}/health`, { timeout: 5000 }));
});

/* ---- DB MODE ---- */
router.get('/analytics/forecast', async (req, res) => {
  const horizon = Number(req.query?.horizon ?? 6);
  const includeAllStock = String(req.query?.include_all_stock ?? 'true').toLowerCase() === 'true';
  return forward(res, axios.get(`${ML_BASE}/forecast_db`, {
    timeout: 20000, params: { horizon, include_all_stock: includeAllStock },
  }));
});

router.get('/analytics/top-forecast', async (req, res) => {
  const horizon = Number(req.query?.horizon ?? 6);
  const metric = String(req.query?.metric ?? 'next');
  const includeAllStock = String(req.query?.include_all_stock ?? 'true').toLowerCase() === 'true';
  const topRaw = req.query?.top;
  const top = (topRaw === undefined || topRaw === '') ? undefined : Number(topRaw);
  const params = { horizon, metric, include_all_stock: includeAllStock };
  if (top !== undefined && Number.isFinite(top)) params.top = top;
  return forward(res, axios.get(`${ML_BASE}/top_forecast_db`, { timeout: 20000, params }));
});

router.get('/analytics/seasonality', async (_req, res) => {
  return forward(res, axios.get(`${ML_BASE}/seasonality_db`, { timeout: 20000 }));
});

router.get('/analytics/restock', async (req, res) => {
  const horizon = Number(req.query?.horizon ?? 6);
  return forward(res, axios.get(`${ML_BASE}/restock_db`, { timeout: 20000, params: { horizon } }));
});

/* ---- FILE MODE (matches your previous UI upload flow) ---- */
router.post('/analytics/forecast', async (req, res) => {
  try {
    const horizon = String(req.body?.horizon ?? '6');
    const form = new FormData();
    if (req.files?.file) {
      const f = req.files.file;
      form.append('file', f.data, {
        filename: f.name || 'usage.xlsx',
        contentType: f.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    } else {
      if (!ensureXlsxOr400(res)) return;
      form.append('file', fs.createReadStream(ML_DATA_XLSX));
    }
    form.append('horizon', horizon);
    return forward(res, axios.post(`${ML_BASE}/forecast`, form, {
      headers: form.getHeaders(), maxBodyLength: Infinity, timeout: 60000,
    }));
  } catch (e) {
    console.error('POST /stock/analytics/forecast error:', e?.message || e);
    res.status(500).json({ error: 'proxy_exception' });
  }
});

router.post('/analytics/top-forecast', async (req, res) => {
  try {
    const horizon = String(req.body?.horizon ?? '6');
    const metric = String(req.body?.metric ?? 'total');
    const top = req.body?.top !== undefined ? String(req.body.top) : undefined;

    const form = new FormData();
    if (req.files?.file) {
      const f = req.files.file;
      form.append('file', f.data, {
        filename: f.name || 'usage.xlsx',
        contentType: f.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    } else {
      if (!ensureXlsxOr400(res)) return;
      form.append('file', fs.createReadStream(ML_DATA_XLSX));
    }
    form.append('horizon', horizon);
    if (top !== undefined) form.append('top', top);
    form.append('metric', metric);

    return forward(res, axios.post(`${ML_BASE}/top_forecast`, form, {
      headers: form.getHeaders(), maxBodyLength: Infinity, timeout: 60000,
    }));
  } catch (e) {
    console.error('POST /stock/analytics/top-forecast error:', e?.message || e);
    res.status(500).json({ error: 'proxy_exception' });
  }
});

router.post('/analytics/seasonality', async (req, res) => {
  try {
    const form = new FormData();
    if (req.files?.file) {
      const f = req.files.file;
      form.append('file', f.data, {
        filename: f.name || 'usage.xlsx',
        contentType: f.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    } else {
      if (!ensureXlsxOr400(res)) return;
      form.append('file', fs.createReadStream(ML_DATA_XLSX));
    }
    return forward(res, axios.post(`${ML_BASE}/seasonality`, form, {
      headers: form.getHeaders(), maxBodyLength: Infinity, timeout: 60000,
    }));
  } catch (e) {
    console.error('POST /stock/analytics/seasonality error:', e?.message || e);
    res.status(500).json({ error: 'proxy_exception' });
  }
});

router.post('/analytics/restock', async (req, res) => {
  try {
    if (req.files?.forecast_csv && req.files?.current_stock_csv) {
      const f1 = req.files.forecast_csv;
      const f2 = req.files.current_stock_csv;
      const form = new FormData();
      form.append('forecast_csv', f1.data, { filename: f1.name || 'forecast.csv', contentType: f1.mimetype || 'text/csv' });
      form.append('current_stock_csv', f2.data, { filename: f2.name || 'current_stock.csv', contentType: 'text/csv' });
      return forward(res, axios.post(`${ML_BASE}/restock`, form, {
        headers: form.getHeaders(), maxBodyLength: Infinity, timeout: 60000,
      }));
    }

    // Fallback path: generate forecast from file then call /restock with CSVs
    const horizon = String(req.body?.horizon ?? '6');
    const current = Array.isArray(req.body?.current_stock) ? req.body.current_stock : [];

    const form1 = new FormData();
    if (req.files?.file) {
      const f = req.files.file;
      form1.append('file', f.data, {
        filename: f.name || 'usage.xlsx',
        contentType: f.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    } else {
      if (!ensureXlsxOr400(res)) return;
      form1.append('file', fs.createReadStream(ML_DATA_XLSX));
    }
    form1.append('horizon', horizon);

    const fr = await axios.post(`${ML_BASE}/forecast`, form1, {
      headers: form1.getHeaders(), maxBodyLength: Infinity, timeout: 60000,
    });
    const forecastRows = Array.isArray(fr.data) ? fr.data : [];

    const headers = ['medicine', 'forecast_month', 'forecast_qty'];
    const forecastCsvBuf = Buffer.from(
      [headers.join(','), ...forecastRows.map(r => `${JSON.stringify(r.medicine)},${r.forecast_month},${r.forecast_qty}`)].join('\n'),
      'utf8'
    );
    const currentCsvBuf = Buffer.from(
      ['medicine,current_stock', ...current.map(r => `${JSON.stringify((r.medicine ?? '').toString())},${Number(r.current_stock ?? 0)}`)].join('\n'),
      'utf8'
    );

    const form2 = new FormData();
    form2.append('forecast_csv', forecastCsvBuf, { filename: 'forecast.csv', contentType: 'text/csv' });
    form2.append('current_stock_csv', currentCsvBuf, { filename: 'current_stock.csv', contentType: 'text/csv' });

    return forward(res, axios.post(`${ML_BASE}/restock`, form2, {
      headers: form2.getHeaders(), maxBodyLength: Infinity, timeout: 60000,
    }));
  } catch (err) {
    console.error('POST /stock/analytics/restock error:', err?.response?.data || err.message || err);
    res.status(500).json({ error: 'ml_restock_failed' });
  }
});

/* =========================
   DATASET MGMT
   ========================= */

router.get('/analytics/dataset', async (_req, res) => {
  try {
    let stat = null;
    try { stat = fs.statSync(ML_DATA_XLSX); } catch {}
    res.json({ path: ML_DATA_XLSX, exists: !!stat, bytes: stat?.size || 0, mtime: stat?.mtime || null });
  } catch (e) {
    res.status(500).json({ error: 'dataset_info_failed', detail: e.message });
  }
});

router.post('/analytics/dataset', async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'file_required' });
    }
    const f = req.files.file;
    const okExt = /\.xlsx$/i.test(f.name);
    const okMime = (f.mimetype || '').includes('sheet') || (f.mimetype || '').includes('excel');
    if (!okExt && !okMime) {
      return res.status(400).json({ error: 'invalid_file', detail: 'Please upload an .xlsx file' });
    }

    fs.mkdirSync(DATA_DIR, { recursive: true });
    await f.mv(ML_DATA_XLSX);

    if (!fs.existsSync(ML_DATA_XLSX)) throw new Error('save_failed');
    res.json({ ok: true, saved_to: ML_DATA_XLSX });
  } catch (e) {
    console.error('dataset upload error:', e);
    res.status(500).json({ error: 'dataset_upload_failed', detail: e.message });
  }
});

module.exports = router;
