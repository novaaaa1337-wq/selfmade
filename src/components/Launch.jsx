import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useLive } from '../lib/live.jsx';
import { short, solscanTx, pumpCoin } from '../lib/format.js';

const PHASES = [
  'Upload image and metadata to IPFS',
  'Approve the SOL transfer in your wallet',
  'Confirm your payment on-chain',
  'Create the coin on pump.fun',
  'Coin is live',
];
const SPLIT = [
  ['ops', 'Website & DEX', 30], ['community', 'Community', 25], ['buyback', 'Buyback & burn', 25], ['holders', 'Holders', 20],
];
const PENDING_KEY = 'selfmade:pending-launch';
const store = {
  get() { try { return JSON.parse(localStorage.getItem(PENDING_KEY)); } catch { return null; } },
  set(v) { try { v ? localStorage.setItem(PENDING_KEY, JSON.stringify(v)) : localStorage.removeItem(PENDING_KEY); } catch {} },
};

async function postJSON(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { data: j });
  return j;
}

export function LaunchPage() {
  const { config } = useLive();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();

  const [f, setF] = useState({ name: '', symbol: '', description: '', twitter: '', telegram: '', website: '', devBuy: '0.1' });
  const [split, setSplit] = useState(Object.fromEntries(SPLIT.map(([k, , v]) => [k, v])));
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [agree, setAgree] = useState(false);
  const [phase, setPhase] = useState(-1);
  const [fail, setFail] = useState(null);
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(store.get);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const total = Object.values(split).reduce((a, v) => a + v, 0);
  const buffer = config?.launchBufferSol ?? 0.03;
  const devBuy = Number(f.devBuy);
  const cost = Number.isFinite(devBuy) ? devBuy + buffer : null;
  const busy = phase >= 0 && phase < 4 && !fail;
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: k === 'symbol' ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') : e.target.value }));

  const pickFile = (fl) => {
    if (!fl) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(fl.type)) return setFail({ at: -1, msg: 'Use a PNG, JPG, GIF or WEBP image.' });
    if (fl.size > 4 * 1024 * 1024) return setFail({ at: -1, msg: 'Image must be 4 MB or smaller.' });
    setFail(null); setFile(fl); setPreview(URL.createObjectURL(fl));
  };

  const problem = useMemo(() => {
    if (!config) return 'Waiting for the server…';
    if (!config.launchesEnabled) return 'Launching is turned off on this server.';
    if (!f.name.trim()) return 'Add a name.';
    if (!f.symbol) return 'Add a ticker.';
    if (!file) return 'Add an image.';
    if (!(devBuy >= config.minDevBuySol && devBuy <= config.maxDevBuySol)) return `Dev buy must be ${config.minDevBuySol}–${config.maxDevBuySol} SOL.`;
    if (total !== 100) return `Fee split adds up to ${total}%. It must be 100%.`;
    if (!agree) return 'Tick the box to confirm you understand how the treasury works.';
    return null;
  }, [config, f, file, devBuy, total, agree]);

  // Polls the server so the log shows verify → create progress during confirm.
  async function confirmWithProgress(id, signature) {
    setPhase(2);
    let stop = false;
    (async () => {
      while (!stop) {
        await new Promise((r) => setTimeout(r, 1500));
        try { const s = await (await fetch(`/api/launch/${id}`)).json(); if (s.status === 'creating' || s.status === 'pending_check') setPhase(3); } catch {}
      }
    })();
    try { return await postJSON('/api/launch/confirm', { id, signature }); } finally { stop = true; }
  }

  async function launch(e) {
    e.preventDefault();
    if (!connected || !publicKey) { setVisible(true); return; }
    if (problem || busy) return;
    setFail(null); setResult(null);
    let at = 0;
    try {
      setPhase(0);
      const fd = new FormData();
      fd.append('image', file);
      fd.append('name', f.name.trim());
      fd.append('symbol', f.symbol);
      fd.append('description', f.description.trim());
      fd.append('twitter', f.twitter.trim());
      fd.append('telegram', f.telegram.trim());
      fd.append('website', f.website.trim());
      fd.append('devBuySol', String(devBuy));
      fd.append('creatorWallet', publicKey.toBase58());
      fd.append('splitOps', split.ops); fd.append('splitCommunity', split.community);
      fd.append('splitBuyback', split.buyback); fd.append('splitHolders', split.holders);
      const r = await fetch('/api/launch/prepare', { method: 'POST', body: fd });
      const prep = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(prep.error || 'Upload failed');

      at = 1; setPhase(1);
      const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: publicKey, toPubkey: new PublicKey(prep.treasury), lamports: prep.requiredLamports,
      }));
      const { context: { slot: minContextSlot }, value: { blockhash } } = await connection.getLatestBlockhashAndContext();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      const signature = await sendTransaction(tx, connection, { minContextSlot });
      const p = { id: prep.id, signature, symbol: f.symbol, mint: prep.mint };
      store.set(p); setPending(p);

      at = 2;
      const done = await confirmWithProgress(prep.id, signature);
      store.set(null); setPending(null);
      setPhase(4);
      setResult({ mint: done.mint, sig: done.signature });
    } catch (err) {
      const msg = /User rejected/i.test(err.message) ? 'You cancelled the transfer in your wallet. Nothing was sent.' : err.message;
      setFail({ at, msg, refundSig: err.data?.refundSig, status: err.data?.status });
      if (err.data?.status === 'refunded' || err.data?.status === 'failed') { store.set(null); setPending(null); }
    }
  }

  async function resume() {
    if (!pending) return;
    setFail(null); setResult(null);
    try {
      const done = await confirmWithProgress(pending.id, pending.signature);
      store.set(null); setPending(null); setPhase(4); setResult({ mint: done.mint, sig: done.signature });
    } catch (err) {
      setFail({ at: 2, msg: err.message, refundSig: err.data?.refundSig });
      if (['refunded', 'failed', 'live'].includes(err.data?.status)) { store.set(null); setPending(null); }
    }
  }

  return (
    <section className="s" id="launch">
      <div className="wrap">
        <div className="sh" data-r>
          <div><div className="eyebrow">Launch</div><h2 data-scramble>Launch a coin on pump.fun</h2></div>
          <span className="note">{connected ? `wallet ${short(publicKey?.toBase58())}` : 'connect a wallet to launch'}</span>
        </div>

        {pending && phase < 0 && (
          <div className="banner warn" data-r>
            You have a launch for ${pending.symbol} that was paid but not confirmed.
            <button className="btn sm" onClick={resume} type="button">Finish it</button>
          </div>
        )}

        <div className="term" data-r>
          <form className="term-form" onSubmit={launch} noValidate>
            <div className="row-img">
              <button type="button" className="drop" data-drag={drag ? '1' : '0'} onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]); }}
                aria-label="Choose coin image">
                {preview ? <img src={preview} alt="" /> : <span>drop image<br />or click</span>}
              </button>
              <input ref={fileRef} id="lImage" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
              <div className="col">
                <div className="f"><label htmlFor="lName">Name</label><input id="lName" value={f.name} onChange={set('name')} maxLength={32} placeholder="Mothlight" /></div>
                <div className="f"><label htmlFor="lSymbol">Ticker</label><input id="lSymbol" value={f.symbol} onChange={set('symbol')} maxLength={10} placeholder="MOTH" /></div>
              </div>
            </div>
            <div className="f"><label htmlFor="lDesc">Lore</label>
              <textarea id="lDesc" value={f.description} onChange={set('description')} maxLength={500} placeholder="What is this coin about? Used on its pump.fun page and its own website here." />
            </div>
            <div className="row3">
              <div className="f"><label htmlFor="lX">X link</label><input id="lX" value={f.twitter} onChange={set('twitter')} placeholder="https://x.com/…" /></div>
              <div className="f"><label htmlFor="lTg">Telegram</label><input id="lTg" value={f.telegram} onChange={set('telegram')} placeholder="https://t.me/…" /></div>
              <div className="f"><label htmlFor="lWeb">Website</label><input id="lWeb" value={f.website} onChange={set('website')} placeholder="https://…" /></div>
            </div>
            <div className="f">
              <label htmlFor="lDev">Dev buy (SOL)</label>
              <input id="lDev" inputMode="decimal" value={f.devBuy} onChange={set('devBuy')} />
              <span className="hint">The tokens bought at launch go to the coin's treasury, not your wallet.</span>
            </div>

            <div className="f">
              <span className="lbl">Fee split</span>
              <div className="split-bar mini" aria-hidden="true">{SPLIT.map(([k]) => <span key={k} data-k={k} style={{ flexGrow: split[k] }} />)}</div>
              {SPLIT.map(([k, label]) => (
                <div className="sl" key={k}>
                  <label htmlFor={`s_${k}`}><i data-k={k} />{label}</label>
                  <input id={`s_${k}`} type="range" min="0" max="100" step="5" value={split[k]} onChange={(e) => setSplit((p) => ({ ...p, [k]: +e.target.value }))} />
                  <output htmlFor={`s_${k}`}>{split[k]}%</output>
                </div>
              ))}
              <span className="sum" data-bad={total !== 100 ? '1' : '0'}>total {total}%</span>
            </div>

            <label className="agree">
              <input id="lAgree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>I understand the coin's treasury wallet is created and held by this server, and that it spends the creator fees according to the split above.</span>
            </label>

            <div className="launch-row">
              <button className="btn solid lg mag" type="submit" disabled={busy || (connected && !!problem)}>
                {!connected ? 'Connect wallet' : busy ? 'Launching…' : `Launch ${f.symbol ? '$' + f.symbol : 'coin'}`} <span className="arr">→</span>
              </button>
              <span className="cost">{cost !== null && devBuy > 0 ? <>You send <b>{cost.toFixed(3)} SOL</b> ({devBuy} dev buy + {buffer} for fees)</> : null}</span>
            </div>
            {connected && problem && phase < 0 && <p className="hint">{problem}</p>}
          </form>

          <div className="term-out" aria-live="polite">
            <div className="lbl">launch log</div>
            <ol className="phases">
              {PHASES.map((p, i) => {
                const st = fail && fail.at === i ? 'fail' : phase > i || (phase === 4 && i === 4) ? 'done' : phase === i ? 'run' : 'idle';
                return <li key={p} data-st={st}><span className="mk" />{p}</li>;
              })}
            </ol>
            {fail && (
              <div className="log-msg bad">
                {fail.msg}
                {fail.refundSig && <> Refund sent: <a href={solscanTx(fail.refundSig)} target="_blank" rel="noreferrer">view tx ↗</a></>}
              </div>
            )}
            {result && (
              <div className="log-msg ok">
                ${f.symbol} is live on pump.fun.
                <div className="log-links">
                  <a className="btn solid sm" href={`#/c/${result.mint}`}>Open its page →</a>
                  <a className="btn sm" href={pumpCoin(result.mint)} target="_blank" rel="noreferrer">pump.fun ↗</a>
                  <a className="btn sm" href={solscanTx(result.sig)} target="_blank" rel="noreferrer">tx ↗</a>
                </div>
              </div>
            )}
            {phase < 0 && !fail && (
              <pre className="log-idle">{`$ selfmade launch
  waiting for input…

  what happens:
  · you send ${cost !== null && devBuy > 0 ? cost.toFixed(3) : '…'} SOL to a new treasury wallet
  · the server creates the coin on pump.fun
    with that treasury as the creator
  · creator fees flow to the treasury
  · the coin's page goes live here`}</pre>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
