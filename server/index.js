import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { cfg } from './config.js';
import { db, bus, load, save, addLedger, publicCoin, stats } from './store.js';
import { encrypt, decrypt } from './crypto.js';
import { connection, pollConfirm, verifyPayment, transferAll } from './solana.js';
import { uploadMetadata, tradeLocal } from './pump.js';
import { tracker, recentTrades } from './tracker.js';
import { startEngine } from './engine.js';

load();
const app = express();
app.use(express.json({ limit: '100kb' }));

// Lets a site hosted elsewhere (e.g. Vercel) call this API. Comma-separated list.
const allowed = (cfg.corsOrigin || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

const liveStats = () => stats({ engineEnabled: cfg.engineEnabled, trackerConnected: tracker.connected, launchesEnabled: !!cfg.secret });

/* ---------------- live stream (SSE) ---------------- */
const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(msg);
}
let statsTimer = null;
const pushStats = () => { if (!statsTimer) statsTimer = setTimeout(() => { statsTimer = null; broadcast('stats', liveStats()); }, 500); };
bus.on('trade', (t) => { broadcast('trade', t); pushStats(); });
bus.on('coin', (c) => { broadcast('coin', publicCoin(c)); pushStats(); });
bus.on('ledger', (l) => { broadcast('ledger', l); pushStats(); });
bus.on('status', pushStats);
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25_000);

app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`event: stats\ndata: ${JSON.stringify(liveStats())}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

/* ---------------- read API ---------------- */
app.get('/api/config', (_req, res) => res.json({
  launchesEnabled: !!cfg.secret, engineEnabled: cfg.engineEnabled, launchBufferSol: cfg.launchBufferSol,
  minDevBuySol: cfg.minDevBuySol, maxDevBuySol: cfg.maxDevBuySol,
}));
app.get('/api/stats', (_req, res) => res.json(liveStats()));
app.get('/api/coins', (_req, res) => res.json([...db.coins].sort((a, b) => b.stats.volumeSol - a.stats.volumeSol).map(publicCoin)));
app.get('/api/coins/:mint', (req, res) => {
  const coin = db.coins.find((c) => c.mint === req.params.mint);
  if (!coin) return res.status(404).json({ error: 'No coin with that address was launched here.' });
  res.json({
    coin: publicCoin(coin),
    trades: recentTrades.filter((t) => t.mint === coin.mint).slice(0, 50),
    ledger: db.ledger.filter((l) => l.mint === coin.mint).slice(0, 50),
  });
});
app.get('/api/activity', (_req, res) => {
  const items = [
    ...recentTrades.slice(0, 40).map((t) => ({ kind: 'trade', ...t })),
    ...db.ledger.slice(0, 40).map((l) => ({ kind: 'ledger', ...l })),
  ].sort((a, b) => b.at - a.at).slice(0, 40);
  res.json(items);
});

/* ---------------- launch flow ----------------
   1. prepare: upload metadata, create the coin's treasury + mint keys
   2. the creator's wallet sends dev buy + buffer to the treasury (signed in Phantom etc.)
   3. confirm: verify that payment, then create the coin on pump.fun with the
      treasury as creator, so pump.fun creator fees flow to the coin itself */
const clean = (s, max) => String(s ?? '').trim().slice(0, max);
const urlOrEmpty = (s) => { const v = clean(s, 200); return !v || /^https?:\/\//i.test(v) ? v : ''; };

app.post('/api/launch/prepare', upload.single('image'), async (req, res) => {
  try {
    if (!cfg.secret) return res.status(503).json({ error: 'Launching is turned off on this server (TREASURY_SECRET is not set).' });
    const b = req.body;
    const name = clean(b.name, 32);
    const symbol = clean(b.symbol, 10).toUpperCase();
    const description = clean(b.description, 500);
    if (!name) return res.status(400).json({ error: 'Add a name.' });
    if (!/^[A-Z0-9]{1,10}$/.test(symbol)) return res.status(400).json({ error: 'Ticker must be 1–10 letters or numbers.' });
    if (!req.file || !/^image\/(png|jpe?g|gif|webp)$/.test(req.file.mimetype)) return res.status(400).json({ error: 'Add a PNG, JPG, GIF or WEBP image (max 4 MB).' });
    let creator;
    try { creator = new PublicKey(b.creatorWallet); } catch { return res.status(400).json({ error: 'Connect a wallet first.' }); }
    const split = { ops: +b.splitOps, community: +b.splitCommunity, buyback: +b.splitBuyback, holders: +b.splitHolders };
    if (Object.values(split).some((v) => !Number.isInteger(v) || v < 0 || v > 100) || Object.values(split).reduce((a, v) => a + v, 0) !== 100) {
      return res.status(400).json({ error: 'The fee split must add up to 100%.' });
    }
    const devBuySol = Number(b.devBuySol);
    if (!(devBuySol >= cfg.minDevBuySol && devBuySol <= cfg.maxDevBuySol)) {
      return res.status(400).json({ error: `Dev buy must be between ${cfg.minDevBuySol} and ${cfg.maxDevBuySol} SOL.` });
    }

    const twitter = urlOrEmpty(b.twitter), telegram = urlOrEmpty(b.telegram), website = urlOrEmpty(b.website);
    const meta = await uploadMetadata({ name, symbol, description, twitter, telegram, website, file: req.file });
    const mintKp = Keypair.generate();
    const treasuryKp = Keypair.generate();
    const launch = {
      id: crypto.randomUUID(), status: 'awaiting_payment', createdAt: Date.now(),
      name, symbol, description, twitter, telegram, website, image: meta.image, metadataUri: meta.metadataUri,
      split, devBuySol, requiredLamports: Math.ceil((devBuySol + cfg.launchBufferSol) * LAMPORTS_PER_SOL),
      creatorWallet: creator.toBase58(),
      mint: mintKp.publicKey.toBase58(), mintSecretEnc: encrypt(mintKp.secretKey),
      treasury: treasuryKp.publicKey.toBase58(), treasurySecretEnc: encrypt(treasuryKp.secretKey),
    };
    db.launches.push(launch);
    save();
    res.json({ id: launch.id, treasury: launch.treasury, mint: launch.mint, requiredLamports: launch.requiredLamports, image: launch.image });
  } catch (e) {
    console.error('[prepare]', e);
    res.status(500).json({ error: e.message });
  }
});

function finalizeLaunch(L) {
  if (db.coins.some((c) => c.mint === L.mint)) return db.coins.find((c) => c.mint === L.mint);
  const coin = {
    mint: L.mint, name: L.name, symbol: L.symbol, description: L.description, image: L.image, metadataUri: L.metadataUri,
    twitter: L.twitter, telegram: L.telegram, website: L.website,
    creatorWallet: L.creatorWallet, treasury: L.treasury, treasurySecretEnc: L.treasurySecretEnc,
    split: L.split, devBuySol: L.devBuySol, createdAt: Date.now(), createSig: L.createSig,
    stats: { trades: 0, buys: 0, sells: 0, volumeSol: 0, mcapSol: null, lastTradeAt: null },
    treasuryStats: { balanceSol: null, unclaimedSol: null, collectedSol: 0, updatedAt: null },
    buckets: { ops: 0, community: 0, buyback: 0, holders: 0 },
    burnedRaw: '0',
  };
  db.coins.push(coin);
  L.status = 'live';
  delete L.mintSecretEnc;
  save();
  tracker.subscribe([coin.mint]);
  addLedger({ type: 'launch', mint: coin.mint, symbol: coin.symbol, sol: coin.devBuySol, sig: L.createSig });
  bus.emit('coin', coin);
  tracker.refreshTreasuries();
  return coin;
}

async function refundLaunch(L) {
  try {
    const kp = Keypair.fromSecretKey(decrypt(L.treasurySecretEnc));
    L.refundSig = await transferAll(kp, L.creatorWallet);
    L.status = 'refunded';
  } catch (e) {
    L.refundError = e.message;
  }
  save();
}

const inflight = new Set();
app.post('/api/launch/confirm', async (req, res) => {
  const { id, signature } = req.body || {};
  const L = db.launches.find((l) => l.id === id);
  if (!L) return res.status(404).json({ error: 'Launch not found.' });
  if (L.status === 'live') return res.json({ status: 'live', mint: L.mint, signature: L.createSig });
  if (L.status !== 'awaiting_payment') return res.status(409).json({ error: `This launch is ${L.status.replace('_', ' ')}.`, status: L.status });
  if (typeof signature !== 'string' || signature.length < 60) return res.status(400).json({ error: 'Missing payment signature.' });
  if (db.usedSignatures.includes(signature)) return res.status(409).json({ error: 'That payment was already used.' });
  if (inflight.has(id)) return res.status(409).json({ error: 'Already confirming this launch.' });
  inflight.add(id);
  try {
    const pay = await verifyPayment(signature, L.creatorWallet, L.treasury, L.requiredLamports);
    if (!pay.ok) return res.status(400).json({ error: pay.error });
    db.usedSignatures.push(signature);
    L.paySig = signature;
    L.status = 'creating';
    save();

    const mintKp = Keypair.fromSecretKey(decrypt(L.mintSecretEnc));
    const treasuryKp = Keypair.fromSecretKey(decrypt(L.treasurySecretEnc));
    const tx = await tradeLocal({
      publicKey: L.treasury, action: 'create',
      tokenMetadata: { name: L.name, symbol: L.symbol, uri: L.metadataUri },
      mint: L.mint, denominatedInSol: 'true', amount: L.devBuySol, slippage: 10,
      priorityFee: cfg.priorityFeeSol, pool: 'pump',
    });
    tx.sign([mintKp, treasuryKp]);
    L.createSig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
    save();
    await pollConfirm(L.createSig);
    finalizeLaunch(L);
    res.json({ status: 'live', mint: L.mint, signature: L.createSig });
  } catch (e) {
    console.error('[confirm]', e.message);
    if (L.status === 'creating') {
      if (e.timeout) { L.status = 'pending_check'; save(); }
      else { L.status = 'failed'; L.error = e.message; save(); await refundLaunch(L); }
    }
    res.status(500).json({ error: e.message, status: L.status, refundSig: L.refundSig || null });
  } finally {
    inflight.delete(id);
  }
});

app.get('/api/launch/:id', (req, res) => {
  const L = db.launches.find((l) => l.id === req.params.id);
  if (!L) return res.status(404).json({ error: 'Launch not found.' });
  res.json({ status: L.status, mint: L.mint, createSig: L.createSig || null, refundSig: L.refundSig || null, error: L.error || null });
});

// Resolves launches whose create transaction didn't confirm in time.
async function checkPending() {
  for (const L of db.launches.filter((l) => l.status === 'pending_check')) {
    try {
      const { value } = await connection.getSignatureStatuses([L.createSig], { searchTransactionHistory: true });
      const s = value[0];
      if (s && !s.err && s.confirmationStatus) { finalizeLaunch(L); continue; }
      if (s?.err) { L.status = 'failed'; L.error = JSON.stringify(s.err); await refundLaunch(L); continue; }
      const mintInfo = await connection.getAccountInfo(new PublicKey(L.mint));
      if (mintInfo) finalizeLaunch(L);
      else if (Date.now() - L.createdAt > 10 * 60_000) { L.status = 'failed'; L.error = 'Create transaction expired'; await refundLaunch(L); }
    } catch (e) { console.error('[pending]', e.message); }
  }
}
setInterval(checkPending, 30_000);

/* ---------------- static frontend ---------------- */
const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(cfg.port, () => {
  console.log(`[selfmade] api on http://localhost:${cfg.port}`);
  if (!cfg.secret) console.warn('[selfmade] TREASURY_SECRET not set: launching is disabled');
  tracker.start();
  startEngine();
  checkPending();
});
