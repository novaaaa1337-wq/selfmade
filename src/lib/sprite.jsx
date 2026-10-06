import React, { useEffect, useRef, useState } from 'react';
import { ipfs } from './format.js';

// Seeded pixel creature, used when a coin's image can't load.
function rng(seed) {
  let s = 2166136261;
  for (const ch of seed) { s ^= ch.charCodeAt(0); s = Math.imul(s, 16777619) >>> 0; }
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const PALETTES = [
  ["#f2c14e", "#e2762b", "#1d130a", "#fff4d6"], ["#7ee08a", "#2f8f5b", "#0a1a11", "#e8ffe9"], ["#7fb2ff", "#3a5fd0", "#0a1128", "#e6efff"],
  ["#ff8a7a", "#c23b4b", "#22090e", "#ffe6e1"], ["#c8a2ff", "#7246d8", "#130926", "#f1e7ff"], ["#ece8dc", "#8b8a84", "#111111", "#ffffff"],
];

function draw(cv, seed) {
  const r = rng(seed), p = PALETTES[Math.floor(r() * PALETTES.length)];
  const g = 14;
  cv.width = g; cv.height = g;
  const c = cv.getContext('2d');
  c.fillStyle = p[2]; c.fillRect(0, 0, g, g);
  const ox = 3, oy = 2;
  for (let y = 0; y < 10; y++) for (let x = 0; x < 4; x++) {
    const edge = y === 0 || y === 9 ? 0.35 : 0.75;
    if (r() < edge - x * 0.05) {
      c.fillStyle = r() < 0.78 ? p[0] : p[1];
      c.fillRect(ox + x, oy + y, 1, 1);
      c.fillRect(ox + 7 - x, oy + y, 1, 1);
    }
  }
  const ey = oy + 2 + Math.floor(r() * 2);
  c.fillStyle = p[3]; c.fillRect(ox + 2, ey, 1, 1); c.fillRect(ox + 5, ey, 1, 1);
}

export function Sprite({ seed, className }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) draw(ref.current, seed || 'x'); }, [seed]);
  return <canvas ref={ref} className={`sprite ${className || ''}`} aria-hidden="true" />;
}

export function CoinImage({ coin, className }) {
  const [failed, setFailed] = useState(false);
  const src = ipfs(coin?.image);
  if (!src || failed) return <Sprite seed={coin?.mint || coin?.symbol} className={className} />;
  return <img className={className} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}
