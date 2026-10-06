import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { cfg } from './config.js';
import { db, bus, save, addLedger } from './store.js';
import { decrypt } from './crypto.js';
import { connection, sendSigned, tokenBalance, burn } from './solana.js';
import { tradeLocal } from './pump.js';
import { tracker } from './tracker.js';

// The treasury engine. For each coin it:
//   1. collects pump.fun creator fees into the coin's treasury wallet
//   2. splits what was collected into buckets using the coin's locked split
//   3. spends the buyback bucket on buying the coin, then burns what it bought
// The ops, community and holders buckets are tracked and reserved until those
// integrations exist. Nothing here runs unless ENGINE_ENABLED=true.

const BUCKETS = ['ops', 'community', 'buyback', 'holders'];
const running = new Set();

export function startEngine() {
  if (!cfg.engineEnabled) {
    console.log('[engine] disabled (set ENGINE_ENABLED=true to collect fees and run buybacks)');
    return;
  }
  const run = async () => {
    for (const coin of db.coins) {
      if (running.has(coin.mint)) continue;
      running.add(coin.mint);
      try { await runCoin(coin); } catch (e) { console.error('[engine]', coin.symbol, e.message); }
      finally { running.delete(coin.mint); }
    }
  };
  setTimeout(run, 20_000);
  setInterval(run, cfg.engineIntervalMs);
  console.log(`[engine] running every ${cfg.engineIntervalMs / 60000} min`);
}

async function runCoin(coin) {
  const kp = Keypair.fromSecretKey(decrypt(coin.treasurySecretEnc));
  const owner = kp.publicKey;

  // 1. Collect creator fees
  await tracker.refreshTreasuries();
  if ((coin.treasuryStats.unclaimedSol || 0) >= cfg.minClaimSol) {
    const before = await connection.getBalance(owner);
    const tx = await tradeLocal({ publicKey: coin.treasury, action: 'collectCreatorFee', priorityFee: cfg.priorityFeeSol, pool: 'pump' });
    tx.sign([kp]);
    const sig = await sendSigned(tx);
    const delta = (await connection.getBalance(owner) - before) / LAMPORTS_PER_SOL;
    if (delta > 0) {
      coin.treasuryStats.collectedSol += delta;
      for (const k of BUCKETS) coin.buckets[k] += (delta * coin.split[k]) / 100;
    }
    addLedger({ type: 'collect', mint: coin.mint, symbol: coin.symbol, sol: delta, sig });
    save();
    bus.emit('coin', coin);
  }

  // 2. Buyback, then burn exactly what was bought
  const balance = (await connection.getBalance(owner)) / LAMPORTS_PER_SOL;
  const spend = Math.floor(Math.min(coin.buckets.buyback, balance - cfg.treasuryReserveSol) * 1e6) / 1e6;
  if (spend < 0.005) return;

  const pre = await tokenBalance(owner, coin.mint);
  const buyTx = await tradeLocal({
    publicKey: coin.treasury, action: 'buy', mint: coin.mint, denominatedInSol: 'true',
    amount: spend, slippage: 15, priorityFee: cfg.priorityFeeSol, pool: 'auto',
  });
  buyTx.sign([kp]);
  const buySig = await sendSigned(buyTx);
  coin.buckets.buyback -= spend;
  addLedger({ type: 'buyback', mint: coin.mint, symbol: coin.symbol, sol: spend, sig: buySig });

  const post = await tokenBalance(owner, coin.mint);
  const bought = post.amount - pre.amount;
  if (bought > 0n && post.account) {
    const burnSig = await burn(kp, coin.mint, post.account, bought, new PublicKey(post.programId));
    coin.burnedRaw = (BigInt(coin.burnedRaw || '0') + bought).toString();
    coin.decimals = post.decimals;
    addLedger({ type: 'burn', mint: coin.mint, symbol: coin.symbol, tokens: Number(bought) / 10 ** post.decimals, sig: burnSig });
  }
  save();
  bus.emit('coin', coin);
}
