// index.js
require('dotenv').config(); // ✅ load .env ASAP

console.log("BOOT file:", __filename);
console.log("CWD:", process.cwd());
console.log("PORT:", process.env.PORT || 5000);

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload'); // for dataset uploads if used

const axios = require('axios');
const { pool, init } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

/* ========================= ML service orchestration ========================= */

// project layout assumption:
// repo-root/
//   meditrack-backend/   <-- this file
//   meditrack-ml/
//     .venv/             <-- preferred python here
//     ml_service.py
const PY_DIR  = process.env.ML_CWD  || path.resolve(__dirname, '..', 'meditrack-ml');
const PY_HOST = process.env.ML_HOST || '127.0.0.1';
const PY_PORT = Number(process.env.ML_PORT || 8000);
const ML_URL  = `http://${PY_HOST}:${PY_PORT}`;
const SPAWN_ML = (process.env.SPAWN_ML || '1') !== '0'; // set SPAWN_ML=0 to skip auto-spawn

function resolvePythonExe() {
  if (process.env.ML_PYTHON) return process.env.ML_PYTHON;

  const isWin = process.platform === 'win32';
  const venvExe = isWin
    ? path.join(PY_DIR, '.venv', 'Scripts', 'python.exe')
    : path.join(PY_DIR, '.venv', 'bin', 'python');

  if (fs.existsSync(venvExe)) {
    console.log('🧠 Using venv Python:', venvExe);
    return venvExe;
  }
  const fallbacks = isWin ? ['py', 'python'] : ['python3', 'python'];
  console.warn('⚠️  Venv Python not found. Falling back to:', fallbacks.join(', '));
  return fallbacks[0];
}

async function isMlUp(timeoutMs = 1200) {
  try {
    await axios.get(`${ML_URL}/api/ml/health`, { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

async function waitForMl(maxMs = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (await isMlUp(1000)) {
      console.log(`✅ ML service is up at ${ML_URL}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.warn(`⏱️  ML service not confirmed yet (timeout ${maxMs}ms) — continuing…`);
  return false;
}

let mlChild = null;

async function startMlIfNeeded() {
  if (!SPAWN_ML) {
    console.log('🧠 ML auto-spawn disabled (SPAWN_ML=0). Expecting it to be running externally.');
    return;
  }

  // If something is already listening (your manual uvicorn or another instance), don't spawn.
  if (await isMlUp()) {
    console.log(`✅ ML service already running at ${ML_URL}`);
    return;
  }

  const pyCmd = resolvePythonExe();
  const args = ['-m', 'uvicorn', 'ml_service:app', '--host', PY_HOST, '--port', String(PY_PORT)];

  console.log(`🧠 Starting ML service: ${pyCmd} ${args.join(' ')} (cwd=${PY_DIR})`);
  mlChild = spawn(pyCmd, args, {
    cwd: PY_DIR,
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  mlChild.on('error', (err) => {
    console.error('❌ Failed to start ML service:', err?.message || err);
  });

  mlChild.on('exit', (code, signal) => {
    console.error(`⚠️  ML service exited (code=${code}, signal=${signal}). (No auto-respawn)`);
  });

  // Non-fatal wait; app starts regardless
  waitForMl();
}

// Kick off ML orchestration (non-blocking)
startMlIfNeeded();

/* ============================== Core middleware ============================= */

app.set('trust proxy', true);

// Allow list or wildcard
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : '*';

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(fileUpload({ createParentPath: true })); // needed for /stock/analytics/dataset uploads

/* ================================ DB init ================================== */

(async () => {
  try {
    if (typeof init === 'function') {
      await init();
      console.log('✅ DB initialized');
    }
  } catch (e) {
    console.error('❌ DB init failed:', e?.message || e);
  }
})();

/* =============================== Health checks ============================== */

app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));

app.get('/readyz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: 'db_unavailable' });
  }
});

/* ================================= Root ==================================== */

app.get('/', (_req, res) => res.send('MediTrack Backend is running 🚀'));

/* ================================= Routes ================================== */

const patientRoutes = require('./routes/patients');
const prescriptionRoutes = require('./routes/prescriptions');
const appointmentsRouter = require('./routes/appointments');

let stockRoutes;
try { stockRoutes = require('./routes/stock'); } catch {} // optional

let mlRoutes;
try { mlRoutes = require('./routes/ml'); } catch {} // optional

app.use('/patients', patientRoutes);
app.use('/prescriptions', prescriptionRoutes);
app.use('/appointments', appointmentsRouter);
if (stockRoutes) app.use('/stock', stockRoutes);
if (mlRoutes) app.use('/ml', mlRoutes);

// Debug / sanity probe
app.get('/prescriptions/ping', (_req, res) => {
  console.log('🔔 /prescriptions/ping hit');
  res.json({ ok: true });
});

/* =============================== 404 & Errors =============================== */

app.use((req, res, _next) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({ error: 'Internal Server Error' });
});

/* =============================== Start server =============================== */

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🧠 ML service expected at ${ML_URL}`);
  console.log(`🔀 ML proxy (if using routes/stock.js) ⇒ /stock/analytics/* → ${ML_URL}/api/ml/*`);
});

/* ============================ Graceful shutdown ============================ */

const shutdown = async (signal) => {
  console.log(`\n${signal} received: closing server...`);
  server.close(async () => {
    try {
      await pool.end();
      console.log('🗄️  DB pool closed');
    } catch (e) {
      console.error('DB pool close error:', e?.message || e);
    } finally {
      if (mlChild && !mlChild.killed) {
        console.log('🧠 Stopping ML service…');
        try {
          if (process.platform === 'win32') {
            mlChild.kill(); // gentle on Windows
          } else {
            process.kill(mlChild.pid, 'SIGTERM');
          }
        } catch (e) {
          console.warn('ML stop warning:', e?.message || e);
        }
      }
      process.exit(0);
    }
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
