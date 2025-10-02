// backend/db.js
const { Pool } = require("pg");
require("dotenv").config();

const connectionString =
  process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!connectionString) {
  throw new Error("[db] DATABASE_URL is missing in .env");
}

console.log("🔗 Using DB connection:", connectionString); // 👈 ADD THIS LINE

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: Number(process.env.PGPOOL_MAX || 10),
});

pool.on("error", (err) => {
  console.error("🔴 PG Pool Error:", err);
});

module.exports = { pool };
