// scripts/migrate-shop.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shop_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      price       INTEGER NOT NULL,
      role_id     TEXT,             -- optional: grant role on purchase
      stock       INTEGER,          -- null = unlimited
      enabled     INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS user_inventory (
      user_id TEXT NOT NULL,
      item_id INTEGER NOT NULL,
      qty     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, item_id),
      FOREIGN KEY (item_id) REFERENCES shop_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id  TEXT NOT NULL,
      item_id  INTEGER NOT NULL,
      qty      INTEGER NOT NULL,
      amount   INTEGER NOT NULL, -- total cost
      at_ts    INTEGER NOT NULL,
      FOREIGN KEY (item_id) REFERENCES shop_items(id) ON DELETE CASCADE
    );
  `);

  // Seed a few items if none exist
  const count = db.prepare('SELECT COUNT(*) AS c FROM shop_items').get().c;
  if (count === 0) {
    const stmt = db.prepare('INSERT INTO shop_items (name, description, price, role_id, stock, enabled) VALUES (?, ?, ?, ?, ?, 1)');
    stmt.run('VIP Tag', 'Grants the VIP role', 2_500, null, null);
    stmt.run('Lucky Charm', 'Slightly boosts work earnings (flavor item)', 800, null, null);
    stmt.run('Server Booster', 'One-time shoutout by the bot', 1_500, null, 25);
  }

  db.exec('COMMIT');
  console.log('✅ shop tables ready');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}

