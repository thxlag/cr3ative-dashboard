// src/utils/shop.js
import { getDB } from '../lib/db.js';
import { decWallet, getUser } from '../lib/econ.js';

export function listItems({ includeDisabled = false } = {}) {
  const db = getDB();
  const q = includeDisabled ? '1=1' : 'enabled = 1';
  return db.prepare(`SELECT id, name, description, price, role_id, stock, enabled FROM shop_items WHERE ${q} ORDER BY price ASC, id ASC`).all();
}

export function getItemById(id) {
  const db = getDB();
  return db.prepare('SELECT id, name, description, price, role_id, stock, enabled FROM shop_items WHERE id = ?').get(id) || null;
}

export function getInventory(userId) {
  const db = getDB();
  return db.prepare(`
    SELECT si.id, si.name, si.description, ui.qty
    FROM user_inventory ui
    JOIN shop_items si ON si.id = ui.item_id
    WHERE ui.user_id = ? AND ui.qty > 0
    ORDER BY si.price DESC
  `).all(userId);
}

export function purchaseItem(guild, userId, itemId, qty = 1) {
  const db = getDB();
  qty = Math.max(1, Math.floor(qty));
  const item = getItemById(itemId);
  if (!item || !item.enabled) return { ok: false, code: 'not_found' };
  const total = item.price * qty;

  const user = getUser(userId);
  if (user.wallet < total) return { ok: false, code: 'insufficient_funds' };

  const now = Date.now();

  // transaction
  db.exec('BEGIN');
  try {
    const fresh = getItemById(itemId);
    if (!fresh?.enabled) throw new Error('not_enabled');
    if (fresh.stock != null && fresh.stock < qty) throw new Error('out_of_stock');

    // deduct funds
    if (!decWallet(userId, total, `purchase:${itemId}`)) throw new Error('balance_changed');

    // update inventory
    db.prepare(`
      INSERT INTO user_inventory (user_id, item_id, qty)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, item_id) DO UPDATE SET qty = qty + excluded.qty
    `).run(userId, itemId, qty);

    // decrement stock if limited
    if (fresh.stock != null) {
      db.prepare('UPDATE shop_items SET stock = stock - ? WHERE id = ?').run(qty, itemId);
    }

    // purchases history
    db.prepare('INSERT INTO purchases (user_id, item_id, qty, amount, at_ts) VALUES (?, ?, ?, ?, ?)')
      .run(userId, itemId, qty, total, now);

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    const code = e.message;
    if (code === 'out_of_stock') return { ok: false, code };
    return { ok: false, code: code || 'error' };
  }

  return { ok: true, total, item, qty };
}

// --- Seeding helpers ---
function ensureShopTables(db){
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        price INTEGER NOT NULL DEFAULT 0,
        role_id TEXT,
        stock INTEGER,
        enabled INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS user_inventory (
        user_id TEXT NOT NULL,
        item_id INTEGER NOT NULL,
        qty INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, item_id)
      );
      CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        item_id INTEGER NOT NULL,
        qty INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        at_ts INTEGER NOT NULL
      );
    `);
  } catch {}
}

function upsertItem(db, { name, description = '', price = 0, role_id = null, stock = null, enabled = 1 }){
  const row = db.prepare('SELECT id, price, description FROM shop_items WHERE name = ?').get(name);
  if (!row){
    db.prepare('INSERT INTO shop_items (name, description, price, role_id, stock, enabled) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, description, price, role_id, stock, enabled);
  } else {
    // keep stock/role as-is; allow updating price/description via seed tweaks
    db.prepare('UPDATE shop_items SET price = ?, description = ? WHERE id = ?').run(price, description, row.id);
  }
}

export function ensurePetItems(){
  const db = getDB();
  ensureShopTables(db);
  upsertItem(db, { name: 'Pet Food', description: 'Feed your pet to restore energy.', price: Math.max(50, Number(process.env.PET_FOOD_PRICE || 150)) });
  upsertItem(db, { name: 'Toy', description: 'Play with your pet to boost mood.', price: Math.max(50, Number(process.env.PET_TOY_PRICE || 200)) });
  // Optional utility token used in sample recipes
  upsertItem(db, { name: 'Common Token', description: 'A common crafting token.', price: Math.max(25, Number(process.env.COMMON_TOKEN_PRICE || 100)) });
}
