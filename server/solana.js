import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createBurnInstruction } from '@solana/spl-token';
import { cfg } from './config.js';

export const connection = new Connection(cfg.rpcUrl, 'confirmed');
export const PUMP_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
// Rent-exempt minimum for a 0-byte system account; the creator vault keeps this.
export const VAULT_RENT_LAMPORTS = 890_880;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// pump.fun bonding-curve creator fees accrue to this PDA until collected.
export function creatorVault(creator) {
  return PublicKey.findProgramAddressSync([Buffer.from('creator-vault'), creator.toBuffer()], PUMP_PROGRAM)[0];
}

export async function pollConfirm(signature, timeoutMs = 75_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const s = value[0];
    if (s?.err) throw new Error('Transaction failed on-chain: ' + JSON.stringify(s.err));
    if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return signature;
    await sleep(2000);
  }
  throw Object.assign(new Error('Timed out waiting for confirmation'), { timeout: true, signature });
}

export async function sendSigned(tx) {
  const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
  await pollConfirm(sig);
  return sig;
}

// Checks that `signature` is a confirmed SOL transfer of at least `minLamports`
// from `from` to `to`.
export async function verifyPayment(signature, from, to, minLamports) {
  const end = Date.now() + 60_000;
  let tx = null;
  while (!tx && Date.now() < end) {
    tx = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
    if (!tx) await sleep(2000);
  }
  if (!tx) return { ok: false, error: "Payment transaction wasn't found on-chain yet. Try confirming again in a moment." };
  if (tx.meta?.err) return { ok: false, error: 'Payment transaction failed on-chain.' };
  const paid = tx.transaction.message.instructions
    .filter((ix) => ix.program === 'system' && ix.parsed?.type === 'transfer')
    .filter((ix) => ix.parsed.info.source === from && ix.parsed.info.destination === to)
    .reduce((a, ix) => a + Number(ix.parsed.info.lamports), 0);
  if (paid < minLamports) {
    return { ok: false, error: `Payment too small: received ${paid / LAMPORTS_PER_SOL} SOL, need ${minLamports / LAMPORTS_PER_SOL} SOL.` };
  }
  return { ok: true, lamports: paid };
}

export async function transferAll(fromKp, to) {
  const bal = await connection.getBalance(fromKp.publicKey);
  const lamports = bal - 5000;
  if (lamports <= 0) throw new Error('Nothing to refund');
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: fromKp.publicKey, toPubkey: new PublicKey(to), lamports }));
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = fromKp.publicKey;
  tx.sign(fromKp);
  return sendSigned(tx);
}

export async function tokenBalance(owner, mint) {
  const res = await connection.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(mint) });
  const acc = res.value[0];
  if (!acc) return { amount: 0n, decimals: 6, account: null, programId: null };
  const t = acc.account.data.parsed.info.tokenAmount;
  return { amount: BigInt(t.amount), decimals: t.decimals, account: acc.pubkey, programId: acc.account.owner };
}

export async function burn(ownerKp, mint, account, amount, programId) {
  const tx = new Transaction().add(createBurnInstruction(account, new PublicKey(mint), ownerKp.publicKey, amount, [], programId));
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = ownerKp.publicKey;
  tx.sign(ownerKp);
  return sendSigned(tx);
}
