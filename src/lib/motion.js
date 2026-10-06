import Lenis from 'lenis';

// Page-wide motion: smooth scroll, a fee-flow particle field that reacts to the
// cursor and scroll speed, scroll reveals, text scrambles, magnetic buttons and
// tilt cards. Everything is delegated so React can re-render freely.
// State lives in data-* attributes, which React never overwrites.

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const lerp = (a, b, t) => a + (b - a) * t;
const ptr = { x: innerWidth / 2, y: innerHeight / 3, sx: innerWidth / 2, sy: innerHeight / 3, active: false, power: 0 };
let lenis = null;
let vel = 0;

export function scrollToId(id) {
  const el = id === 'top' ? 0 : document.getElementById(id);
  if (el === null) return;
  if (lenis) lenis.scrollTo(el, { offset: -76, duration: 1.5 });
  else if (el === 0) scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
}

export function scrollTop() {
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
  else scrollTo(0, 0);
}

/* ---------- text effects ---------- */
const GLYPHS = '01$#%&*+=<>/\\[]{}░▒▓';
export function scramble(el, dur = 900) {
  if (reduce || !el) return;
  const final = el.dataset.text || (el.dataset.text = el.textContent);
  const start = performance.now();
  const order = [...final].map(() => Math.random() * 0.6);
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur);
    el.textContent = [...final].map((ch, i) => (ch === ' ' || p >= order[i] + 0.4 * (1 - order[i]) ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('');
    if (p < 1) requestAnimationFrame(step); else el.textContent = final;
  };
  requestAnimationFrame(step);
}

export function countTo(el, to, { dur = 1400, format = (v) => Math.round(v).toLocaleString('en-US') } = {}) {
  if (!el) return;
  const from = Number(el.dataset.v || 0);
  el.dataset.v = to;
  if (reduce || from === to) { el.textContent = format(to); return; }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 4);
    el.textContent = format(lerp(from, to, e));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- reveals ---------- */
function setupReveals() {
  const reveal = (el) => {
    el.dataset.rv = 'in';
    el.querySelectorAll('[data-scramble]').forEach((h) => scramble(h, 1000));
    if (el.matches('[data-scramble]')) scramble(el, 1000);
  };
  if (reduce || !('IntersectionObserver' in window)) {
    const all = () => document.querySelectorAll('[data-r]:not([data-rv])').forEach((el) => (el.dataset.rv = 'in'));
    all(); new MutationObserver(all).observe(document.body, { childList: true, subtree: true });
    return;
  }
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); }
  }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  const scan = () => {
    document.querySelectorAll('[data-r]:not([data-rv])').forEach((el) => {
      if (el.getBoundingClientRect().top < innerHeight * 0.92) reveal(el);
      else { el.dataset.rv = 'pre'; io.observe(el); }
    });
  };
  scan();
  new MutationObserver(() => requestAnimationFrame(scan)).observe(document.body, { childList: true, subtree: true });
  // Failsafe: anything on screen is never left hidden.
  setInterval(() => document.querySelectorAll('[data-rv="pre"]').forEach((el) => {
    if (el.getBoundingClientRect().top < innerHeight) reveal(el);
  }), 1500);
}

/* ---------- magnetic + tilt (delegated) ---------- */
function setupPointerFx() {
  if (!fine || reduce) return;
  let magEl = null, tiltEl = null;
  document.addEventListener('pointermove', (e) => {
    const m = e.target.closest?.('.mag');
    if (magEl && magEl !== m) { magEl.style.transform = ''; magEl = null; }
    if (m) {
      magEl = m;
      const r = m.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
      m.style.transform = `translate(${x * 0.2}px, ${y * 0.28}px)`;
    }
    const t = e.target.closest?.('[data-tilt]');
    if (tiltEl && tiltEl !== t) { tiltEl.style.transform = ''; tiltEl.dataset.hover = '0'; tiltEl = null; }
    if (t) {
      tiltEl = t;
      t.dataset.hover = '1';
      const r = t.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      t.style.transform = `perspective(1000px) rotateX(${(0.5 - y) * 6}deg) rotateY(${(x - 0.5) * 8}deg)`;
      t.style.setProperty('--gx', `${x * 100}%`);
      t.style.setProperty('--gy', `${y * 100}%`);
    }
  }, { passive: true });
  document.addEventListener('pointerleave', () => {
    if (magEl) magEl.style.transform = '';
    if (tiltEl) { tiltEl.style.transform = ''; tiltEl.dataset.hover = '0'; }
  });
}

/* ---------- halftone field ---------- */
// A drifting dot field; dots swell around the cursor and speed up with scroll.
function setupField() {
  const cv = document.createElement("canvas");
  cv.id = "field";
  cv.setAttribute("aria-hidden", "true");
  document.body.prepend(cv);
  const cx = cv.getContext("2d");
  const cell = 7;
  let W = 0, H = 0, t = Math.random() * 100;
  let colA = [], colB = [], rowA = [], rowB = [];
  const resize = () => {
    const d = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * d; cv.height = H * d;
    cx.setTransform(d, 0, 0, d, 0, 0);
  };
  const draw = (scrollY) => {
    cx.clearRect(0, 0, W, H);
    const cols = Math.ceil(W / cell), rows = Math.ceil(H / cell), sy = scrollY * 0.25;
    for (let i = 0; i < cols; i++) { const x = i * cell; colA[i] = Math.sin(x * 0.011 + t * 0.7); colB[i] = Math.sin(x * 0.0045 - t * 0.25); }
    for (let j = 0; j < rows; j++) { const y = j * cell + sy; rowA[j] = Math.sin(y * 0.015 - t * 0.5); rowB[j] = Math.cos(y * 0.006 + t * 0.35); }
    const px = ptr.sx, py = ptr.sy, pw = ptr.power, R = 220;
    cx.fillStyle = "#a29e92";
    for (let j = 0; j < rows; j++) {
      const y = j * cell, ra = rowA[j], rb = rowB[j];
      for (let i = 0; i < cols; i++) {
        let n = (colA[i] + ra + colB[i] * rb * 2) * 0.25 + 0.5;
        let r = n * n * n * 2.4;
        const dx = i * cell - px, dy = y - py;
        if (pw > 0.01 && dx > -R && dx < R && dy > -R && dy < R) {
          const k = Math.exp(-(dx * dx + dy * dy) / (2 * 80 * 80)) * pw;
          r += k * 3.2; n += k * 0.5;
        }
        if (r > 0.35) { cx.globalAlpha = Math.min(1, 0.3 + n * 0.45); cx.fillRect(i * cell, y, r, r); }
      }
    }
    cx.globalAlpha = 1;
  };
  resize();
  addEventListener("resize", () => { resize(); draw(scrollY); });
  draw(scrollY);
  return (scrollY) => {
    if (reduce) return;
    t += 0.02 + Math.min(0.08, Math.abs(vel) * 0.004);
    draw(scrollY);
  };
}

/* ---------- cursor ---------- */
function setupCursor() {
  if (!fine || reduce) return null;
  const ring = document.createElement('div'); ring.className = 'cursor';
  const dot = document.createElement('div'); dot.className = 'cursor-dot';
  document.body.append(ring, dot);
  const HOVER = 'a, button, input, select, textarea, label, [data-tilt], .wallet-adapter-button';
  document.addEventListener('pointerover', (e) => { if (e.target.closest?.(HOVER)) ring.dataset.hover = '1'; });
  document.addEventListener('pointerout', (e) => { if (e.target.closest?.(HOVER)) ring.dataset.hover = '0'; });
  document.addEventListener('pointerdown', () => (ring.dataset.down = '1'));
  document.addEventListener('pointerup', () => (ring.dataset.down = '0'));
  let rx = ptr.x, ry = ptr.y, dx = ptr.x, dy = ptr.y;
  return () => {
    dx = lerp(dx, ptr.x, 0.55); dy = lerp(dy, ptr.y, 0.55);
    rx = lerp(rx, ptr.x, 0.17); ry = lerp(ry, ptr.y, 0.17);
    dot.style.transform = `translate3d(${dx}px,${dy}px,0)`;
    ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
    ring.dataset.on = dot.dataset.on = ptr.active ? '1' : '0';
  };
}

/* ---------- boot ---------- */
let booted = false;
export function initMotion() {
  if (booted) return;
  booted = true;
  addEventListener('pointermove', (e) => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.active = true; }, { passive: true });
  document.addEventListener('pointerleave', () => (ptr.active = false));

  if (!reduce) {
    lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
  }
  setupReveals();
  setupPointerFx();
  const drawField = setupField();
  const drawCursor = setupCursor();

  let lastY = scrollY, lastField = 0;
  const frame = (ts) => {
    if (lenis) lenis.raf(ts);
    const y = lenis ? lenis.scroll : scrollY;
    const dy = y - lastY; lastY = y;
    vel = lerp(vel, dy, 0.12);
    document.documentElement.style.setProperty('--vel', vel.toFixed(2));
    const max = document.documentElement.scrollHeight - innerHeight;
    document.documentElement.style.setProperty('--progress', max > 0 ? (y / max).toFixed(4) : 0);
    const nav = document.querySelector('.nav');
    if (nav && Math.abs(dy) > 2) nav.dataset.hide = dy > 0 && y > 320 ? '1' : '0';
    ptr.sx = lerp(ptr.sx, ptr.x, 0.1); ptr.sy = lerp(ptr.sy, ptr.y, 0.1);
    ptr.power = lerp(ptr.power, ptr.active && fine ? 1 : 0, 0.05);
    if (ts - lastField > 33) { drawField(y); lastField = ts; }
    if (drawCursor) drawCursor();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export { reduce as prefersReducedMotion };
