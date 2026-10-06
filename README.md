# SELFMADE

A launchpad where every coin funds itself. Coins are created on pump.fun with a
fresh **treasury wallet as the creator**, so pump.fun creator fees go to the coin,
not a dev. The server tracks every trade live and (optionally) spends the fees
on buybacks and burns.

Nothing on the site is sample data. With no coins launched, every number is zero.

## What's real today

| Feature | Status |
|---|---|
| Wallet connection (Phantom, Solflare, Backpack, any Wallet Standard wallet) | live |
| Launch on pump.fun via PumpPortal (image + metadata to IPFS, dev buy) | live |
| Each coin gets its own page at `/#/c/<mint>` | live |
| Live trades via PumpPortal websocket, streamed to browsers over SSE | live |
| Treasury balance + uncollected creator fees read from Solana | live |
| Collect creator fees, split into buckets | live when `ENGINE_ENABLED=true` |
| Buyback, then burn exactly what was bought | live when `ENGINE_ENABLED=true` |
| Auto-refund if pump.fun creation fails after payment | live |
| DEX profile payment, community bot, holder payouts | **planned** (funds are reserved in buckets) |

## Launch flow

1. Creator fills the form and connects a wallet.
2. `POST /api/launch/prepare`: server uploads metadata, generates a treasury keypair and a mint keypair (both encrypted with `TREASURY_SECRET`).
3. Creator signs one SOL transfer (dev buy + `LAUNCH_BUFFER_SOL`) to the treasury.
4. `POST /api/launch/confirm`: server verifies the transfer on-chain, asks PumpPortal for a `create` transaction with the treasury as creator, signs it with the mint + treasury keys, and sends it.
5. If creation fails, the treasury balance is refunded to the creator.

## Run it

Requires Node 20+.

```bash
npm install
cp .env.example .env    # then set TREASURY_SECRET and RPC_URL
npm run dev             # server on :8787, site on http://localhost:5173
```

Production:

```bash
npm run build && npm start   # serves the site and API on :8787
```

## Before you take real money

- **Custody.** The server holds every treasury key. Whoever runs it can move those funds. Say so clearly to users (the launch form requires them to acknowledge it) and protect the server and `TREASURY_SECRET` accordingly. Losing the secret loses every treasury.
- **Use a paid RPC** (`RPC_URL`, `VITE_RPC_URL`). The public endpoint rate-limits hard.
- **Storage** is a JSON file in `data/`. Move to Postgres before running more than one instance.
- **Third-party fees.** PumpPortal charges a fee on transactions built through its API, and pump.fun has its own creation and trading fees. Check their current docs and tell users.
- Test the whole flow with a tiny dev buy first.

## Files

- `server/index.js` API, launch flow, SSE stream
- `server/tracker.js` PumpPortal trade stream and treasury balance reads
- `server/engine.js` fee collection, buyback and burn
- `server/pump.js` PumpPortal and IPFS calls
- `src/` React site; `src/lib/motion.js` holds all the animation

## Deploy to your own domain

The app is one Node process (API + live stream + site) that needs a **persistent
disk** for `data/`. Serverless hosts like Vercel or Netlify won't work for the server.

**Render (simplest):**
1. Push this folder to a GitHub repo.
2. Render → New → Blueprint → pick the repo. It reads `render.yaml`.
3. In the service's Environment tab set `TREASURY_SECRET`, `RPC_URL` and `VITE_RPC_URL`, then redeploy.
4. Settings → Custom Domains → add `yourdomain.com`, then add the DNS record Render shows you at your domain registrar. HTTPS is automatic.

**Any VPS or Docker host (Railway, Fly.io, DigitalOcean…):**
```bash
docker build -t selfmade --build-arg VITE_RPC_URL=https://your-rpc .
docker run -d -p 80:8787 -v selfmade-data:/data --env-file .env selfmade
```
Put it behind HTTPS (Caddy, or the host's built-in TLS). Wallets require HTTPS.

Back up `/data/db.json` and `TREASURY_SECRET`. Together they control every treasury.
