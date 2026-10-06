import React, { useEffect, useRef, useState } from 'react';
import { useLive } from '../lib/live.jsx';
import { countTo, scramble } from '../lib/motion.js';
import { sol, int, ago, short, solscanTx } from '../lib/format.js';
import { CoinImage } from '../lib/sprite.jsx';

/* ---------------- small pieces ---------------- */
function Stat({ label, value, format }) {
  const ref = useRef(null);
  useEffect(() => { if (value !== undefined && value !== null) countTo(ref.current, value, { format }); }, [value]);
  return (
    <div className="stat">
      <div className="stat-k">{label}</div>
      <div className="stat-v" ref={ref}>{value === undefined || value === null ? '—' : format(0)}</div>
    </div>
  );
}

function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(t); }, [ms]);
}

function SectionHead({ id, eyebrow, title, right }) {
  return (
    <div className="sh" data-r>
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2 data-scramble>{title}</h2>
      </div>
      {right}
    </div>
  );
}

/* ---------------- hero ---------------- */
function Hero() {
  const { stats, error } = useLive();
  const h = useRef(null);
  useEffect(() => { setTimeout(() => scramble(h.current, 1100), 150); }, []);
  const solFmt = (v) => (v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(2));
  return (
    <section className="hero">
      <div className="wrap">
        <div className="eyebrow caret rise" style={{ "--d": "0s" }}>Self-funding coins · launched on pump.fun</div>
        <h1 className="hero-h">
          <span className="l1" ref={h}>Every coin</span>
          <span className="ol"><span className="wipe">pays its way</span><span className="fill" aria-hidden="true">pays its way</span><span className="block" aria-hidden="true" /></span>
        </h1>
        <p className="lede rise" style={{ "--d": "1.2s" }}>
          Every coin launched here is created on pump.fun with its own treasury wallet as the creator. Its creator fees
          go to that treasury, not to a dev, and the coin spends them on itself: its own website, buybacks and burns,
          and later its DEX listing, community and holder rewards.
        </p>
        <div className="cta rise" style={{ "--d": "1.35s" }}>
          <a className="btn solid lg mag" href="#/launch">Launch a coin <span className="arr">→</span></a>
          <a className="btn lg mag" href="#/coins">Explore {stats ? int(stats.coins) : "…"} coins</a>
        </div>
        <div className="stats rise" style={{ "--d": "1.5s" }}>
          <Stat label="Coins launched" value={stats?.coins} format={(v) => Math.round(v).toLocaleString("en-US")} />
          <Stat label="Volume (SOL)" value={stats?.volumeSol} format={solFmt} />
          <Stat label="Trades" value={stats?.trades} format={(v) => Math.round(v).toLocaleString("en-US")} />
          <Stat label="Fees collected (SOL)" value={stats?.collectedSol} format={solFmt} />
        </div>
        {error && <p className="banner">Can’t reach the SELFMADE server ({error}). Live numbers will appear once it’s running.</p>}
      </div>
    </section>
  );
}


/* ---------------- live activity ---------------- */
const LEDGER_LABEL = { launch: 'launched', collect: 'collected fees', buyback: 'bought back', burn: 'burned' };

function Activity() {
  const { activity, coins } = useLive();
  useTick(1000);
  const img = (mint) => coins.find((c) => c.mint === mint);
  return (
    <div className="wrap">
      <div className="panel" data-r>
        <div className="panel-h">
          <span className="live-dot">LIVE</span>
          <span className="panel-t">Treasury &amp; trade activity</span>
          <span className="panel-r">{activity.length ? `${activity.length} recent events` : 'waiting for the first event'}</span>
        </div>
        {activity.length === 0 ? (
          <div className="empty">
            <pre aria-hidden="true">{`   .-----.
  ( o   o )   no coins have
   \\  ~  /    launched yet
    '---'`}</pre>
            <p>Trades, fee collections, buybacks and burns appear here the moment they happen on-chain.</p>
          </div>
        ) : (
          <ul className="feed">
            {activity.slice(0, 12).map((a) => (
              <li key={(a.sig || a.id) + a.kind} data-new={a._new ? '1' : '0'}>
                <a className="feed-av" href={`#/c/${a.mint}`}><CoinImage coin={img(a.mint) || { mint: a.mint }} /></a>
                <div className="feed-body">
                  <div className="feed-meta">
                    <a href={`#/c/${a.mint}`}><b>${a.symbol}</b></a>{' '}
                    {a.kind === 'trade'
                      ? <span className={a.side === 'buy' ? 'up' : 'down'}>{a.side}</span>
                      : <span className="acc">{LEDGER_LABEL[a.type] || a.type}</span>}
                    {' · '}{ago(a.at)}
                  </div>
                  <div className="feed-txt">
                    {a.kind === 'trade'
                      ? <>{sol(a.sol)} by {short(a.trader)}{a.mcapSol ? <> · mcap {sol(a.mcapSol)}</> : null}</>
                      : a.type === 'burn' ? <>{int(Math.round(a.tokens))} tokens removed from supply</>
                      : <>{sol(a.sol)}</>}
                    {a.sig && <> · <a className="tx" href={solscanTx(a.sig)} target="_blank" rel="noreferrer">tx ↗</a></>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------------- coins ---------------- */
function Coins() {
  const { coins } = useLive();
  useTick(5000);
  return (
    <section className="s" id="coins">
      <div className="wrap">
        <SectionHead eyebrow="Live board" title="Coins on SELFMADE" right={<span className="note">{coins.length} launched · sorted by volume</span>} />
        {coins.length === 0 ? (
          <div className="empty-big" data-r>
            <div>
              <div className="eyebrow">Nothing here yet</div>
              <h3>No coins have launched yet.</h3>
              <p>The first coin launched here shows up on this board straight away, with its trades, treasury and fees updating live.</p>
            </div>
            <a className="btn solid lg mag" href="#/launch">Launch the first one <span className="arr">→</span></a>
          </div>
        ) : (
          <div className="coin-grid">
            {coins.map((c, i) => (
              <a key={c.mint} className="coin-card" href={`#/c/${c.mint}`} data-r data-tilt style={{ '--d': `${(i % 3) * 0.08}s` }}>
                <div className="coin-img"><CoinImage coin={c} /><span className="rank">#{String(i + 1).padStart(2, '0')}</span></div>
                <div className="coin-name"><b>{c.name}</b><span>${c.symbol}</span></div>
                <dl className="kv">
                  <div><dt>MCAP</dt><dd>{sol(c.stats.mcapSol)}</dd></div>
                  <div><dt>VOLUME</dt><dd>{sol(c.stats.volumeSol)}</dd></div>
                  <div><dt>TREASURY</dt><dd>{sol(c.treasuryStats.balanceSol)}</dd></div>
                </dl>
                <div className="coin-foot"><span>{int(c.stats.trades)} trades</span><span>{c.stats.lastTradeAt ? `last ${ago(c.stats.lastTradeAt)}` : `launched ${ago(c.createdAt)}`}</span></div>
                <span className="glare" aria-hidden="true" />
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------- how it works ---------------- */
function How() {
  const { config } = useLive();
  const engine = config?.engineEnabled;
  const steps = [
    ['Launch', 'You fill in the coin and sign one SOL transfer. The server creates it on pump.fun with a fresh treasury wallet as the creator.', 'live', `  you ──▶ [ dev buy + gas ]
             │
             ▼
        pump.fun create`],
    ['Website', 'The coin gets its own page here from minute one, built from its name, image, lore and live data.', 'live', `  .-------------.
  | ▓▓  $COIN   |
  | ░░░░░ ░░ ▒▒ |
  '-------------'`],
    ['Track', 'Every trade streams in live from PumpPortal. Balances and uncollected fees are read from Solana every minute.', 'live', `   ┌─┐   ┌─┐
   │▲│┌─┐│▲│ ┌─┐
   │ ││▼││ │ │▲│
  ─┴─┴┴─┴┴─┴─┴─┴─`],
    ['Collect', "pump.fun creator fees build up for the treasury wallet. The engine collects them and splits them into buckets.", engine ? 'live' : 'off', `  fees ··▶ [ vault ]
              │ collect
              ▼
         [ TREASURY ]`],
    ['Buyback & burn', 'The buyback bucket buys the coin on the market, then burns exactly what it bought.', engine ? 'live' : 'off', `  SOL ──▶ buy ──▶ $COIN
                   │
                   ▼
                 burn ▲▲`],
    ['DEX listing', 'The ops bucket reserves funds for an enhanced DEX profile. The payment integration is not built yet.', 'planned', `  [ logo ] [ banner ]
  [ links ] [ about  ]
     reserved ···`],
    ['Community', 'The community bucket reserves funds for a Telegram and X presence run by a mod agent. Not built yet.', 'planned', `   o   o   o
  /|\\ /|\\ /|\\
     ( chat )`],
    ['Holder rewards', 'The holders bucket reserves SOL for payouts to holders. The payout job is not built yet.', 'planned', `  [ TREASURY ]
     │  │  │
     ◆  ◆  ◆  holders`],
  ];
  const label = { live: 'LIVE', off: 'OFF ON THIS SERVER', planned: 'PLANNED' };
  return (
    <section className="s" id="how">
      <div className="wrap">
        <SectionHead eyebrow="How it works" title="One loop, paid for by volume" right={<span className="note">status reflects this server, right now</span>} />
        <div className="loop">
          {steps.map(([h, p, st, art], i) => (
            <div className="step" key={h} data-r style={{ '--d': `${(i % 4) * 0.07}s` }}>
              <div className="step-top"><span>{String(i + 1).padStart(2, '0')}</span><span className="chip" data-state={st}>{label[st]}</span></div>
              <pre className="ascii" aria-hidden="true">{art}</pre>
              <h3>{h}</h3>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- treasury split ---------------- */
function Treasury() {
  const rows = [
    ['ops', 'Website & DEX listing', 'Reserved for listing fees and hosting upgrades.', 30],
    ['community', 'Community', 'Reserved for community tooling and promotion.', 25],
    ['buyback', 'Buyback & burn', 'Spent automatically when the engine is on.', 25],
    ['holders', 'Holder rewards', 'Reserved for holder payouts.', 20],
  ];
  return (
    <section className="s" id="treasury">
      <div className="wrap treasury">
        <div data-r>
          <div className="eyebrow">Treasury</div>
          <h2 className="h2" data-scramble>Where the fees go</h2>
          <p className="muted-p">
            Each coin's split is chosen at launch and stored with the coin. Collected fees are divided into four buckets,
            and every collection, buyback and burn is recorded with its on-chain transaction on the coin's page.
          </p>
          <p className="muted-p">These are the default percentages. You can change them when you launch.</p>
        </div>
        <div className="split" data-r>
          <div className="split-bar" aria-hidden="true">
            {rows.map(([k, , , v]) => <span key={k} data-k={k} style={{ flexGrow: v }} />)}
          </div>
          {rows.map(([k, name, desc, v]) => (
            <div className="split-row" key={k}>
              <i data-k={k} />
              <div><b>{name}</b><p>{desc}</p></div>
              <span className="pct">{v}%</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- FAQ ---------------- */
function Faq() {
  const qs = [
    ['Who holds the treasury wallet?', "This server does. Each coin gets a new wallet whose key is encrypted and stored by the server, and only the server can sign for it. That's what lets the coin pay for things on its own, but it also means you're trusting whoever runs this server."],
    ['What do I pay to launch?', 'Your dev buy plus a small buffer for pump.fun\'s creation cost and network fees, sent in one transfer you approve in your wallet. The dev buy tokens and any leftover SOL stay in the coin\'s treasury.'],
    ['What if the launch fails?', 'If pump.fun creation fails after you pay, the server sends the treasury balance back to your wallet automatically, minus the network fee.'],
    ['Which wallets work?', 'Phantom, Solflare, Backpack and any other Solana wallet that supports the Wallet Standard.'],
    ['Is everything on this site real?', "Yes. Every number comes from the server's live PumpPortal stream or from Solana. When nothing has happened yet, the site shows zero. Steps marked PLANNED aren't built yet."],
    ['Is this financial advice?', 'No. Memecoins are extremely risky and most go to zero. A coin paying for itself doesn\'t make it worth more.'],
  ];
  return (
    <section className="s" id="faq">
      <div className="wrap">
        <SectionHead eyebrow="FAQ" title="Straight answers" />
        <div className="faq">
          {qs.map(([q, a], i) => (
            <details key={q} data-r style={{ '--d': `${(i % 2) * 0.06}s` }} open={i === 0}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- marquee of real recent trades ---------------- */
function Marquee() {
  const { activity } = useLive();
  const items = activity.slice(0, 16);
  const text = items.length
    ? items.map((a) => (a.kind === 'trade' ? `$${a.symbol} ${a.side} ${sol(a.sol)}` : `$${a.symbol} ${LEDGER_LABEL[a.type] || a.type}${a.sol ? ' ' + sol(a.sol) : ''}`))
    : ['awaiting first launch', 'creator fees → coin treasury', 'every number on this page is live', 'launch on pump.fun', 'no dev wallet'];
  const row = [...text, ...text, ...text];
  return (
    <div className="marquee" aria-hidden="true">
      <div className="track">{row.map((t, i) => <span key={i}>{t}</span>)}</div>
    </div>
  );
}

export function HomePage() {
  return (
    <>
      <Hero />
      <Activity />
      <Marquee />
      <TabGrid />
    </>
  );
}

// Entry points to every other tab, so each page stays focused on one thing.
function TabGrid() {
  const { stats, config } = useLive();
  const tabs = [
    ["#/coins", "Coins", stats ? `${int(stats.coins)} launched` : "live board"],
    ["#/how", "How it works", "the treasury loop, step by step"],
    ["#/treasury", "Treasury", "where creator fees go"],
    ["#/launch", "Launch", config ? (config.launchesEnabled ? "open now" : "closed on this server") : "launch on pump.fun"],
    ["#/faq", "FAQ", "custody, costs, refunds"],
  ];
  return (
    <section className="s">
      <div className="wrap">
        <div className="tab-grid">
          {tabs.map(([href, name, sub], i) => (
            <a key={href} className="tab-card" href={href} data-r data-tilt style={{ "--d": `${i * 0.06}s` }}>
              <span className="tab-n">{String(i + 1).padStart(2, "0")}</span>
              <span className="tab-name">{name}</span>
              <span className="tab-sub">{sub}</span>
              <span className="tab-arr" aria-hidden="true">→</span>
              <span className="glare" aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export { Coins as CoinsPage, How as HowPage, Treasury as TreasuryPage, Faq as FaqPage };
