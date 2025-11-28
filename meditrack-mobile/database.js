// database.js
import * as SQLite from 'expo-sqlite';

let db = null;

export const initDatabase = () => {
  try {
    db = SQLite.openDatabaseSync('meditrack.db');

    db.execSync(`
      CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT
      );
    `);

    db.runSync(
      `INSERT OR IGNORE INTO patients (id, name, email, password) VALUES (?, ?, ?, ?)`,
      [1, 'John Doe', 'john@example.com', '1234']
    );

    console.log("✅ Database initialized (Sync)");
    return db;
  } catch (error) {
    console.error("❌ Database error:", error);
    throw error;
  }
};

export const getDb = () => {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
};
