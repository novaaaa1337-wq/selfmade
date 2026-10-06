export const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');

export function sol(n, { unit = true } = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const v = n === 0 ? '0' : n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : n >= 1 ? n.toFixed(2) : n.toFixed(4);
  return unit ? `${v} SOL` : v;
}

export const int = (n) => (n ?? 0).toLocaleString('en-US');

export function ago(ts) {
  if (!ts) return '—';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const solscanTx = (sig) => `https://solscan.io/tx/${sig}`;
export const solscanAcct = (a) => `https://solscan.io/account/${a}`;
export const pumpCoin = (mint) => `https://pump.fun/coin/${mint}`;

export function ipfs(url) {
  if (!url) return null;
  return url.replace(/^ipfs:\/\//, 'https://ipfs.io/ipfs/');
}
