import React, { useEffect, useMemo, useState } from 'react';
import { useLive, getJSON } from '../lib/live.jsx';
import { sol, int, ago, short, solscanTx, solscanAcct, pumpCoin } from '../lib/format.js';
import { api } from '../lib/api.js';
import { CoinImage } from '../lib/sprite.jsx';

const BUCKETS = [['ops', 'Website & DEX'], ['community', 'Community'], ['buyback', 'Buyback & burn'], ['holders', 'Holders']];
const LEDGER = { launch: 'Launched', collect: 'Collected creator fees', buyback: 'Bought back', burn: 'Burned' };

// Each coin's own website, generated from its metadata and live data.
export function CoinPage({ mint }) {
  const { coins, activity } = useLive();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    getJSON(api(`/api/coins/${mint}`)).then(setData).catch((e) => setErr(e.message));
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [mint]);

  const coin = coins.find((c) => c.mint === mint) || data?.coin;
  const trades = useMemo(() => {
    const live = activity.filter((a) => a.kind === 'trade' && a.mint === mint);
    const seen = new Set();
    return [...live, ...(data?.trades || [])].filter((t) => (seen.has(t.sig) ? false : seen.add(t.sig))).slice(0, 30);
  }, [activity, data, mint]);
  const ledger = useMemo(() => {
    const live = activity.filter((a) => a.kind === 'ledger' && a.mint === mint);
    const seen = new Set();
    return [...live, ...(data?.ledger || [])].filter((l) => (seen.has(l.id) ? false : seen.add(l.id))).slice(0, 30);
  }, [activity, data, mint]);

  if (err && !coin) {
    return (
      <section className="s"><div className="wrap">
        <div className="empty-big"><div><div className="eyebrow">Not found</div><h3>{err}</h3><p>Only coins launched through SELFMADE have a page here.</p></div><a className="btn lg" href="#/">Back home</a></div>
      </div></section>
    );
  }
  if (!coin) return <section className="s"><div className="wrap"><p className="muted-p">Loading…</p></div></section>;

  const copy = async () => {
    try { await navigator.clipboard.writeText(coin.mint); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
  };
  const t = coin.treasuryStats;
  const burned = coin.burnedRaw && coin.burnedRaw !== '0' ? Number(BigInt(coin.burnedRaw)) / 10 ** (coin.decimals ?? 6) : 0;
  const maxBucket = Math.max(0.000001, ...BUCKETS.map(([k]) => coin.buckets[k]));

  return (
    <>
      <section className="coin-hero">
        <div className="wrap coin-hero-grid">
          <div className="coin-art rise" data-tilt>
            <CoinImage coin={coin} />
            <span className="glare" aria-hidden="true" />
          </div>
          <div className="coin-intro">
            <div className="eyebrow rise">${coin.symbol} · launched {ago(coin.createdAt)} · self-funded on SELFMADE</div>
            <h1 className="coin-h rise" style={{ '--d': '.08s' }} data-scramble>{coin.name}</h1>
            {coin.description && <p className="lede rise" style={{ '--d': '.18s' }}>{coin.description}</p>}
            <div className="cta rise" style={{ '--d': '.28s' }}>
              <a className="btn solid lg mag" href={pumpCoin(coin.mint)} target="_blank" rel="noreferrer">Trade on pump.fun ↗</a>
              <button className="btn lg mag" type="button" onClick={copy}>{copied ? 'Copied' : `CA ${short(coin.mint)}`}</button>
            </div>
            <div className="links-row rise" style={{ '--d': '.36s' }}>
              {coin.website && <a href={coin.website} target="_blank" rel="noreferrer">website ↗</a>}
              {coin.twitter && <a href={coin.twitter} target="_blank" rel="noreferrer">x ↗</a>}
              {coin.telegram && <a href={coin.telegram} target="_blank" rel="noreferrer">telegram ↗</a>}
              <a href={solscanAcct(coin.mint)} target="_blank" rel="noreferrer">token ↗</a>
              <a href={solscanAcct(coin.treasury)} target="_blank" rel="noreferrer">treasury ↗</a>
            </div>
          </div>
        </div>
      </section>

      <section className="s tight">
        <div className="wrap">
          <div className="stats six" data-r>
            {[
              ['Market cap', sol(coin.stats.mcapSol)],
              ['Volume', sol(coin.stats.volumeSol)],
              ['Trades', `${int(coin.stats.trades)}`],
              ['Treasury', sol(t.balanceSol)],
              ['Uncollected fees', sol(t.unclaimedSol)],
              ['Fees collected', sol(t.collectedSol)],
            ].map(([k, v]) => <div className="stat" key={k}><div className="stat-k">{k}</div><div className="stat-v">{v}</div></div>)}
          </div>
          <p className="note small">Trades are counted from when the coin launched here. Balances refresh every minute{t.updatedAt ? `, last ${ago(t.updatedAt)}` : ''}.</p>
        </div>
      </section>

      <section className="s tight">
        <div className="wrap coin-cols">
          <div className="panel" data-r>
            <div className="panel-h"><span className="panel-t">Treasury buckets</span><span className="panel-r">split locked at launch</span></div>
            <div className="buckets">
              {BUCKETS.map(([k, label]) => (
                <div className="bucket" key={k}>
                  <div className="bucket-top"><span><i data-k={k} />{label}</span><span>{coin.split[k]}%</span></div>
                  <div className="bucket-bar"><span data-k={k} style={{ '--w': coin.buckets[k] / maxBucket }} /></div>
                  <div className="bucket-v">{sol(coin.buckets[k])} {k === 'buyback' ? 'waiting to spend' : 'reserved'}</div>
                </div>
              ))}
              <div className="bucket-note">Burned so far: <b>{burned ? int(Math.round(burned)) : 0}</b> tokens</div>
            </div>
          </div>

          <div className="panel" data-r style={{ '--d': '.08s' }}>
            <div className="panel-h"><span className="panel-t">Treasury ledger</span><span className="panel-r">on-chain</span></div>
            {ledger.length === 0 ? <div className="empty sm"><p>No treasury activity yet.</p></div> : (
              <ul className="rows">
                {ledger.map((l) => (
                  <li key={l.id}>
                    <span>{LEDGER[l.type] || l.type}</span>
                    <span className="num">{l.type === 'burn' ? `${int(Math.round(l.tokens))} tokens` : sol(l.sol)}</span>
                    <span className="dim">{ago(l.at)}</span>
                    {l.sig ? <a href={solscanTx(l.sig)} target="_blank" rel="noreferrer">tx ↗</a> : <span />}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="s tight">
        <div className="wrap">
          <div className="panel" data-r>
            <div className="panel-h"><span className="live-dot">LIVE</span><span className="panel-t">Trades</span><span className="panel-r">{int(coin.stats.buys)} buys · {int(coin.stats.sells)} sells</span></div>
            {trades.length === 0 ? <div className="empty sm"><p>No trades since this page started tracking. New trades appear here instantly.</p></div> : (
              <ul className="rows trades">
                {trades.map((tr) => (
                  <li key={tr.sig} data-new={tr._new ? '1' : '0'}>
                    <span className={tr.side === 'buy' ? 'up' : 'down'}>{tr.side}</span>
                    <span className="num">{sol(tr.sol)}</span>
                    <span className="dim">{short(tr.trader)}</span>
                    <span className="dim">{ago(tr.at)}</span>
                    <a href={solscanTx(tr.sig)} target="_blank" rel="noreferrer">tx ↗</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
