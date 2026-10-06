import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { cfg } from './config.js';

// A small JSON-file database. Fine for one server process; swap for Postgres
// or SQLite before running more than one instance.
const file = path.resolve(cfg.dataDir, 'db.json');

export const db = { coins: [], launches: [], ledger: [], usedSignatures: [] };
export const bus = new EventEmitter();
bus.setMaxListeners(100);

export function load() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) Object.assign(db, JSON.parse(fs.readFileSync(file, 'utf8')));
}

let timer = null;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}
function flush() {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}
process.on('exit', () => { try { flush(); } catch {} });

export function addLedger(entry) {
  const row = { id: crypto.randomUUID(), at: Date.now(), ...entry };
  db.ledger.unshift(row);
  if (db.ledger.length > 5000) db.ledger.length = 5000;
  save();
  bus.emit('ledger', row);
  return row;
}

// Never send key material to clients.
export function publicCoin(c) {
  const { treasurySecretEnc, ...rest } = c;
  return rest;
}

export function stats(extra = {}) {
  const sum = (f) => db.coins.reduce((a, c) => a + (f(c) || 0), 0);
  return {
    coins: db.coins.length,
    volumeSol: sum((c) => c.stats.volumeSol),
    trades: sum((c) => c.stats.trades),
    collectedSol: sum((c) => c.treasuryStats.collectedSol),
    unclaimedSol: sum((c) => c.treasuryStats.unclaimedSol),
    burns: db.ledger.filter((l) => l.type === 'burn').length,
    ...extra,
  };
}
