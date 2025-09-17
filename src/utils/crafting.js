import { getDB } from '../lib/db.js';
import { decWallet, incWallet, getUser } from '../lib/econ.js';
import { addGamblingProfitToPool } from './lottery.js';

function ensureRecipes(db){
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        cost INTEGER NOT NULL DEFAULT 0,
        inputs_json TEXT NOT NULL,
        outputs_json TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1
      );
    `);
    // seed a few if empty
    const c = db.prepare('SELECT COUNT(*) AS c FROM recipes').get().c || 0;
    if (c === 0){
      const seed = [
        { name: 'Shiny Badge', cost: 1000, in: [{ item: 'Common Token', qty: 5 }], out: [{ item: 'Shiny Badge', qty: 1 }] },
        { name: 'Enrichment Pack', cost: 500, in: [{ item: 'Pet Food', qty: 1 },{ item: 'Toy', qty: 1 }], out: [{ item: 'Enrichment Pack', qty: 1 }] },
      ];
      const stmt = db.prepare('INSERT INTO recipes (name, cost, inputs_json, outputs_json, enabled) VALUES (?, ?, ?, ?, 1)');
      for (const r of seed) stmt.run(r.name, r.cost, JSON.stringify(r.in), JSON.stringify(r.out));
    }
  } catch {}
}

export function listRecipes(){
  const db = getDB(); ensureRecipes(db);
  const rows = db.prepare('SELECT id, name, cost, inputs_json, outputs_json, enabled FROM recipes WHERE enabled = 1 ORDER BY id ASC').all();
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    cost: r.cost,
    inputs: safeJson(r.inputs_json, []),
    outputs: safeJson(r.outputs_json, []),
  }));
}

function safeJson(s, d){ try { return JSON.parse(s||'[]'); } catch { return d; } }

export function craftMake(userId, recipeId, qty = 1){
  const db = getDB(); ensureRecipes(db);
  qty = Math.max(1, Math.floor(qty));
  const r = db.prepare('SELECT id, name, cost, inputs_json, outputs_json, enabled FROM recipes WHERE id = ?').get(recipeId);
  if (!r || !r.enabled) return { ok: false, code: 'not_found' };
  const inputs = safeJson(r.inputs_json, []);
  const outputs = safeJson(r.outputs_json, []);
  const user = getUser(userId);
  const totalCost = (r.cost||0) * qty;
  if ((user.wallet||0) < totalCost) return { ok: false, code: 'funds' };

  // Check inventory
  for (const i of inputs){
    const row = db.prepare('SELECT qty FROM user_inventory ui JOIN shop_items si ON si.id = ui.item_id WHERE ui.user_id = ? AND si.name = ?').get(userId, i.item);
    const have = row?.qty || 0;
    if (have < (i.qty||1) * qty) return { ok: false, code: 'materials', need: i };
  }

  db.exec('BEGIN');
  try {
    if (!decWallet(userId, totalCost, `craft:${r.id}`)) throw new Error('balance_changed');
    // consume inputs
    for (const i of inputs){
      const need = (i.qty||1) * qty;
      const it = db.prepare('SELECT id FROM shop_items WHERE name = ?').get(i.item);
      if (!it) throw new Error('no_item');
      db.prepare('UPDATE user_inventory SET qty = MAX(0, qty - ?) WHERE user_id = ? AND item_id = ?')
        .run(need, userId, it.id);
    }
    // grant outputs
    for (const o of outputs){
      const give = (o.qty||1) * qty;
      const it = db.prepare('SELECT id FROM shop_items WHERE name = ?').get(o.item);
      if (!it) {
        // auto-create cosmetic-only items with zero price if missing
        db.prepare('INSERT INTO shop_items (name, description, price, enabled) VALUES (?, ?, 0, 1)').run(o.item, 'Crafted item');
      }
      const it2 = db.prepare('SELECT id FROM shop_items WHERE name = ?').get(o.item);
      db.prepare(`INSERT INTO user_inventory (user_id, item_id, qty) VALUES (?, ?, ?) ON CONFLICT(user_id, item_id) DO UPDATE SET qty = qty + excluded.qty`)
        .run(userId, it2.id, give);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return { ok: false, code: e.message || 'error' };
  }

  try { addGamblingProfitToPool(null, Math.floor(totalCost * (Number(process.env.CRAFT_POOL_PCT || 1.0)))); } catch {}
  return { ok: true, recipe: { id: r.id, name: r.name }, qty, totalCost };
}

