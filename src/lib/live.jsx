import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const LiveCtx = createContext(null);
export const useLive = () => useContext(LiveCtx);

async function getJSON(url) {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

// Everything on the page comes from the SELFMADE server, which reads Solana and
// PumpPortal directly. Nothing here is sample data.
export function LiveProvider({ children }) {
  const [stats, setStats] = useState(null);
  const [config, setConfig] = useState(null);
  const [coins, setCoins] = useState([]);
  const [activity, setActivity] = useState([]);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let es;
    let stop = false;
    Promise.all([getJSON(api('/api/stats')), getJSON(api('/api/config')), getJSON(api('/api/coins')), getJSON(api('/api/activity'))])
      .then(([s, c, list, act]) => { if (stop) return; setStats(s); setConfig(c); setCoins(list); setActivity(act); setError(null); })
      .catch((e) => setError(e.message));

    const open = () => {
      es = new EventSource(api('/api/stream'));
      es.onopen = () => { setOnline(true); setError(null); };
      es.onerror = () => setOnline(false);
      es.addEventListener('stats', (e) => setStats(JSON.parse(e.data)));
      es.addEventListener('coin', (e) => {
        const c = JSON.parse(e.data);
        setCoins((prev) => {
          const i = prev.findIndex((p) => p.mint === c.mint);
          const next = i === -1 ? [c, ...prev] : prev.map((p, j) => (j === i ? c : p));
          return next.sort((a, b) => b.stats.volumeSol - a.stats.volumeSol);
        });
      });
      const push = (kind) => (e) => setActivity((prev) => [{ kind, ...JSON.parse(e.data), _new: true }, ...prev].slice(0, 60));
      es.addEventListener('trade', push('trade'));
      es.addEventListener('ledger', push('ledger'));
    };
    open();
    return () => { stop = true; es?.close(); };
  }, []);

  const value = useMemo(() => ({ stats, config, coins, activity, online, error }), [stats, config, coins, activity, online, error]);
  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}

export { getJSON };
