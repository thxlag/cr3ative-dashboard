import crypto from 'node:crypto';

const store = new Map(); // token -> { userId, data, ts }
const TTL_MS = 10 * 60 * 1000;

export function putWorkBreakdown(userId, data){
  prune();
  const token = crypto.randomBytes(8).toString('hex');
  store.set(token, { userId, data, ts: Date.now() });
  return token;
}

export function getWorkBreakdown(token){
  const row = store.get(token);
  if (!row) return null;
  if (Date.now() - row.ts > TTL_MS){ store.delete(token); return null; }
  return row;
}

function prune(){
  const now = Date.now();
  for (const [k,v] of store.entries()){
    if (now - (v.ts||0) > TTL_MS) store.delete(k);
  }
}

