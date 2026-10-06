import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export const cfg = {
  port: num(process.env.PORT, 8787),
  rpcUrl: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
  // Encrypts every treasury and mint key at rest. Launching is disabled until it's set.
  secret: process.env.TREASURY_SECRET || '',
  // Optional: upload metadata through Pinata instead of pump.fun's IPFS endpoint.
  pinataJwt: process.env.PINATA_JWT || '',
  engineEnabled: process.env.ENGINE_ENABLED === 'true',
  engineIntervalMs: num(process.env.ENGINE_INTERVAL_MIN, 10) * 60_000,
  // Extra SOL the creator sends on top of the dev buy, to cover pump.fun's
  // creation cost and network fees. Whatever is left stays in the treasury.
  launchBufferSol: num(process.env.LAUNCH_BUFFER_SOL, 0.03),
  minDevBuySol: num(process.env.MIN_DEV_BUY_SOL, 0.01),
  maxDevBuySol: num(process.env.MAX_DEV_BUY_SOL, 5),
  priorityFeeSol: num(process.env.PRIORITY_FEE_SOL, 0.0005),
  minClaimSol: num(process.env.MIN_CLAIM_SOL, 0.01),
  treasuryReserveSol: num(process.env.TREASURY_RESERVE_SOL, 0.01),
  dataDir: process.env.DATA_DIR || 'data',
};
