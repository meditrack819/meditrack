// backend/db.js
const { Pool } = require('pg');
require('dotenv').config();

const connectionString =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL || // legacy fallback
  '';

if (!connectionString) {
  throw new Error('[db] DATABASE_URL is missing. Add it to backend .env');
}

const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: Number(process.env.PGPOOL_MAX || 10),
  keepAlive: true,
});

pool.on('error', (err) => {
  console.error('🔴 pg pool error:', err);
});

/** quick “SELECT 1” check used by /health/db */
async function healthCheck() {
  const c = await pool.connect();
  try {
    await c.query('select 1');
    return true;
  } finally {
    c.release();
  }
}

module.exports = { pool, healthCheck };
