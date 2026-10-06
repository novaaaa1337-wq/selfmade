import WebSocket from 'ws';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { db, bus, save } from './store.js';
import { connection, creatorVault, VAULT_RENT_LAMPORTS } from './solana.js';

// Streams real trades for every coin launched here, from PumpPortal's data feed.
// Docs: https://pumpportal.fun/data-api/real-time
export const recentTrades = [];

class Tracker {
  connected = false;
  ws = null;
  subs = new Set();

  start() {
    db.coins.forEach((c) => this.subs.add(c.mint));
    this.connect();
    this.refreshTreasuries();
    setInterval(() => this.refreshTreasuries(), 60_000);
  }

  connect() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    this.ws = ws;
    ws.on('open', () => {
      this.connected = true;
      bus.emit('status');
      if (this.subs.size) ws.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: [...this.subs] }));
    });
    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      this.onMessage(m);
    });
    ws.on('close', () => {
      this.connected = false;
      bus.emit('status');
      setTimeout(() => this.connect(), 3000);
    });
    ws.on('error', (e) => console.error('[tracker]', e.message));
  }

  subscribe(mints) {
    mints.forEach((m) => this.subs.add(m));
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: mints }));
  }

  onMessage(m) {
    if (!m.mint || (m.txType !== 'buy' && m.txType !== 'sell')) return;
    const coin = db.coins.find((c) => c.mint === m.mint);
    if (!coin) return;
    const sol = Number(m.solAmount) || 0;
    const s = coin.stats;
    s.trades += 1;
    s[m.txType === 'buy' ? 'buys' : 'sells'] += 1;
    s.volumeSol += sol;
    if (m.marketCapSol) s.mcapSol = Number(m.marketCapSol);
    s.lastTradeAt = Date.now();
    const t = {
      sig: m.signature, mint: m.mint, symbol: coin.symbol, side: m.txType, sol,
      tokens: Number(m.tokenAmount) || 0, trader: m.traderPublicKey, mcapSol: s.mcapSol, at: Date.now(),
    };
    recentTrades.unshift(t);
    if (recentTrades.length > 500) recentTrades.length = 500;
    save();
    bus.emit('trade', t);
    bus.emit('coin', coin);
  }

  // Reads real balances: the treasury wallet and its uncollected pump.fun creator fees.
  async refreshTreasuries() {
    for (const coin of db.coins) {
      try {
        const t = new PublicKey(coin.treasury);
        const [bal, vault] = await Promise.all([connection.getBalance(t), connection.getBalance(creatorVault(t))]);
        coin.treasuryStats.balanceSol = bal / LAMPORTS_PER_SOL;
        coin.treasuryStats.unclaimedSol = Math.max(0, vault - VAULT_RENT_LAMPORTS) / LAMPORTS_PER_SOL;
        coin.treasuryStats.updatedAt = Date.now();
        bus.emit('coin', coin);
      } catch (e) {
        console.error('[tracker] balance', coin.symbol, e.message);
      }
    }
    save();
  }
}

export const tracker = new Tracker();
