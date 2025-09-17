import { getDB } from './db.js';

export function getOrCreateUser(userId){
  const db = getDB();
  const row = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  if(row) return row;
  db.prepare('INSERT INTO users (user_id) VALUES (?)').run(userId);
  return db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
}

export function incWallet(userId, amount, reason=''){
  const db = getDB();
  getOrCreateUser(userId);
  db.prepare('UPDATE users SET wallet = wallet + ? WHERE user_id = ?').run(amount, userId);
  db.prepare('INSERT INTO txns (user_id, amount, type, reason, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, amount, 'wallet_inc', reason, Date.now());
}

export function decWallet(userId, amount, reason=''){
  const db = getDB();
  const user = getOrCreateUser(userId);
  if (user.wallet < amount) return false;
  db.prepare('UPDATE users SET wallet = wallet - ? WHERE user_id = ?').run(amount, userId);
  db.prepare('INSERT INTO txns (user_id, amount, type, reason, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, -Math.abs(amount), 'wallet_dec', reason, Date.now());
  return true;
}

export function transferWalletToBank(userId, amount){
  const db = getDB();
  const user = getOrCreateUser(userId);
  if(user.wallet < amount) return false;
  db.prepare('UPDATE users SET wallet = wallet - ?, bank = bank + ? WHERE user_id = ?')
    .run(amount, amount, userId);
  return true;
}

export function transferBankToWallet(userId, amount){
  const db = getDB();
  const user = getOrCreateUser(userId);
  if(user.bank < amount) return false;
  db.prepare('UPDATE users SET bank = bank - ?, wallet = wallet + ? WHERE user_id = ?')
    .run(amount, amount, userId);
  return true;
}

export function setLastDaily(userId, ts){
  const db = getDB();
  getOrCreateUser(userId);
  db.prepare('UPDATE users SET last_daily = ? WHERE user_id = ?').run(ts, userId);
}

export function setWallet(userId, amount){
  const db = getDB();
  getOrCreateUser(userId);
  db.prepare('UPDATE users SET wallet = ? WHERE user_id = ?').run(amount, userId);
}

export function setBank(userId, amount){
  const db = getDB();
  getOrCreateUser(userId);
  db.prepare('UPDATE users SET bank = ? WHERE user_id = ?').run(amount, userId);
}

export function getUser(userId){
  const db = getDB();
  return getOrCreateUser(userId);
}

export function topBank(limit=10){
  const db = getDB();
  return db.prepare('SELECT user_id, wallet, bank FROM users ORDER BY bank DESC, wallet DESC LIMIT ?').all(limit);
}
