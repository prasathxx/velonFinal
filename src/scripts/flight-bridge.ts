// DOM → 3D bridge for the flight (PLAN-v2 §4, §9). Decides the tier before any 3D code downloads,
// mounts the canvas lazily, turns scroll into store.target, and reads the drone's screen position
// back in one gsap.ticker callback: wake reveals (Solutions), counters (Numbers), light pool (Process),
// the marquee shadow line and the HUD. No React, no per-frame layout reads (rects cached on refresh).
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { store, type Tier } from '../three/flight-store';
import { DESKTOP, LOW, PHONE, SECTIONS, sample, type Path } from '../three/flight';
import { site } from '../data/site';

const html = document.documentElement;
const q = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const qa = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll<T>(s));
type VelonDebug = { flightReady?: boolean; badgeReady?: boolean; tier?: Tier; store?: typeof store };
const dbg = ((window as unknown as { __velon?: VelonDebug }).__velon ??= {});
dbg.store = store;

export const DESK_MQ = '(min-width: 1025px) and (hover: hover) and (pointer: fine)';

/* ------------------------------------------------------------------ tier (decided before any import) */
function hasWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext(); // release the probe context at once
    return !!gl;
  } catch { return false; }
}
export function decideTier(): Tier {
  const qp = new URLSearchParams(location.search).get('tier');
  if (qp === 'rm' || qp === 'nogl' || qp === 'low' || qp === 'full') return qp;
  if (html.classList.contains('rm')) return 'rm';
  if (!hasWebGL2()) return 'nogl';
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const weak = (n.deviceMemory !== undefined && n.deviceMemory <= 4) || (n.hardwareConcurrency !== undefined && n.hardwareConcurrency <= 4) || !!n.connection?.saveData;
  if (weak || !matchMedia(DESK_MQ).matches) return 'low';
  return 'full';
}

/* ------------------------------------------------------------------ section ranges (centre-line ownership) */
interface Range { id: string; el: HTMLElement; start: number; end: number; dark: boolean; wp: number }
let ranges: Range[] = [];
let path: Path = DESKTOP;
let compact = false;

/* anchored keys: page-space rects of the elements the keys measure their y from */
const anchors = new Map<string, { top: number; h: number }>();
function cacheAnchors() {
  anchors.clear();
  Object.values(path).flat().forEach((key) => {
    if (!key.a || anchors.has(key.a.sel)) return;
    const el = q(key.a.sel);
    if (!el) return;
    const r = el.getBoundingClientRect();
    anchors.set(key.a.sel, { top: r.top + scrollY, h: r.height });
  });
}
const ys: number[] = [];
function resolveYs(keys: Path[string]) {
  const vh = innerHeight, y = scrollY;
  ys.length = keys.length;
  keys.forEach((key, i) => {
    const a = key.a && anchors.get(key.a.sel);
    ys[i] = a ? 1 - (2 * (a.top + key.a!.fy * a.h - y)) / vh + key.y : key.y;
  });
  return ys;
}

/* depth planes: [data-depth] elements sit above the canvas (z-index 6, .is-fore) while their plane is
   nearer than the drone. Candidates are filtered by their section's cached page span (pins included). */
interface Plane { el: HTMLElement; plane: number; fore: boolean; glass: boolean; top: number; bottom: number }
/** glass planes: while the drone sits behind one it defocuses (so whatever shows in the gutters matches the frost) */
const GLASS_PLANES = '.bento, .stat';
let planes: Plane[] = [];
function cachePlanes() {
  planes = qa('[data-depth]').map((el) => {
    const host = el.closest<HTMLElement>('section, footer') ?? el;
    const r = host.getBoundingClientRect();
    const old = planes.find((p) => p.el === el);
    return { el, plane: Number(el.dataset.depth) || 0, fore: old ? old.fore : el.classList.contains('is-fore'), glass: el.matches(GLASS_PLANES), top: r.top + scrollY, bottom: r.bottom + scrollY };
  });
}

function measure() {
  const vh = innerHeight;
  ranges = [];
  SECTIONS.forEach((id, i) => {
    const el = q<HTMLElement>(`[data-flight="${id}"]`);
    if (!el) return;
    const top = el.getBoundingClientRect().top + scrollY;
    const h = el.offsetHeight;
    ranges.push({ id, el, start: id === 'hero' ? 0 : top - vh / 2, end: top + h - vh / 2, dark: el.classList.contains('tone-dark'), wp: i + 1 });
  });
  cacheAnchors();
  cachePlanes();
  cacheRects();
  update();
}

const pose = { x: 0, y: 0, z: 0, yaw: 0, scale: 1 };
let activeP = 0;
function update() {
  if (!ranges.length) return;
  const y = scrollY;
  let r = ranges.find((x) => y >= x.start && y < x.end) ?? (y < ranges[0].start ? ranges[0] : ranges[ranges.length - 1]);
  const p = Math.min(1, Math.max(0, (y - r.start) / Math.max(1, r.end - r.start)));
  activeP = p;
  const keys = path[r.id];
  sample(keys, p, pose, resolveYs(keys));
  Object.assign(store.target, pose);
  store.section = r.id;
  store.wp = r.wp;
  // the cases rail ends on a black card: treat its tail as a dark band
  store.dark = r.dark ? 1 : 0;
  store.wake();
}

/* ------------------------------------------------------------------ DOM readers: cached rects */
interface Card { el: HTMLElement; x: number; y: number; w: number; h: number; done: boolean }
let wakeCards: Card[] = [];
let tiles: { el: HTMLElement; cx: number; cy: number; start: () => void; done: boolean }[] = [];
const counterStarters = new Map<HTMLElement, () => void>();
export function registerCounter(el: HTMLElement, start: () => void) { counterStarters.set(el, start); }

function cacheRects() {
  wakeCards.forEach((c) => {
    const r = c.el.getBoundingClientRect();
    c.x = r.left; c.y = r.top + scrollY; c.w = r.width; c.h = r.height;
  });
  tiles.forEach((t) => {
    const r = t.el.getBoundingClientRect();
    t.cx = r.left + r.width / 2; t.cy = r.top + scrollY + r.height / 2;
  });
}

function revealCard(c: Card) {
  if (c.done) return;
  c.done = true;
  gsap.to(c.el, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', clearProps: 'transform,opacity' });
}

/** Solutions: cards reveal in the drone's wake; safety nets keep them from ever staying hidden. */
export function armWake(withFlight: boolean) {
  const cells = qa('[data-wake] .card');
  if (!cells.length) return;
  wakeCards = cells.map((el) => ({ el, x: 0, y: 0, w: 0, h: 0, done: false }));
  gsap.set(cells, { opacity: 0, y: 24 });
  q('[data-wake]')!.style.visibility = 'visible';
  wakeCards.forEach((c, i) => {
    ScrollTrigger.create({
      trigger: c.el, start: 'top 82%', once: true,
      onEnter: () => {
        if (!withFlight || !store.ready) gsap.delayedCall(0.08 * (i % 3), () => revealCard(c));
        else gsap.delayedCall(1.3, () => revealCard(c)); // the drone usually gets there first
      },
    });
  });
  ScrollTrigger.create({ trigger: q('[data-flight="solutions"]'), start: 'bottom 60%', once: true, onEnter: () => wakeCards.forEach(revealCard) });
  cacheRects();
}

/** Numbers: each counter starts as the low pass crosses its tile (fallback in motion.ts). */
export function armTiles() {
  tiles = [];
  qa('.stat').forEach((el) => {
    const num = q<HTMLElement>('[data-count]', el);
    const start = num ? counterStarters.get(num) : undefined;
    if (start) tiles.push({ el, cx: 0, cy: 0, start, done: false });
  });
  cacheRects();
}

/* ------------------------------------------------------------------ HUD + scramble */
const CHARSET = '0123456789ABCDEF/·';
export function scramble(el: HTMLElement, text: string, dur = 0.35) {
  const o = { p: 0 };
  gsap.to(o, {
    p: 1, duration: dur, ease: 'none',
    onUpdate: () => {
      const n = Math.floor(o.p * text.length);
      let s = text.slice(0, n);
      for (let i = n; i < text.length; i++) s += text[i] === ' ' ? ' ' : CHARSET[(Math.random() * CHARSET.length) | 0];
      el.textContent = s;
    },
    onComplete: () => { el.textContent = text; },
  });
}

let hud: { root: HTMLElement; wp: HTMLElement; sec: HTMLElement; alt: HTMLElement; hdg: HTMLElement } | null = null;
let hudSection = '';
let hudT = 0;
/* The readout never sits on content: while its chip intersects a card, a text block or a control it
   fades out (and comes back once the strip below is clear). Checked at the HUD's 110 ms cadence. */
const HUD_AVOID = 'main h1, main h2, main h3, main h4, main p, main dt, main dd, main blockquote, main figure, main img, main a, main button, '
  + 'main .card, main .stat, main .case__row, main .steps, main .process__index li, footer a, footer p, footer button, footer .footer__giant .g';
let hudAvoid: HTMLElement[] | null = null;
function hudCovers(el: HTMLElement) {
  hudAvoid ??= Array.from(document.querySelectorAll<HTMLElement>(HUD_AVOID));
  const h = el.getBoundingClientRect();
  const l = h.left - 6, r = h.right + 6, t = h.top - 6, b = h.bottom + 6;
  for (const n of hudAvoid) {
    const c = n.getBoundingClientRect();
    if (c.bottom > t && c.top < b && c.right > l && c.left < r && c.width > 0 && c.height > 0) return true;
  }
  return false;
}
function updateHud(now: number) {
  if (!hud) return;
  const landed = store.section === 'footer';
  hud.root.classList.toggle('is-on', store.ready && store.section !== 'hero');
  if (store.section !== hudSection) {
    hudSection = store.section;
    const label = (q(`[data-flight="${store.section}"]`)?.getAttribute('data-flight-label') || store.section).toUpperCase();
    scramble(hud.wp, String(store.wp).padStart(2, '0'));
    scramble(hud.sec, landed ? `${label} · ${site.telemetry.labels.landed}` : label);
  }
  if (now - hudT < 110) return;
  hudT = now;
  hud.root.classList.toggle('is-yield', hud.root.classList.contains('is-on') && hudCovers(hud.root));
  hud.alt.textContent = landed ? '0.00' : Math.max(0, store.alt).toFixed(2);
  hud.hdg.textContent = String(Math.round(store.hdg)).padStart(3, '0');
}

/* ------------------------------------------------------------------ the ticker: screen → DOM */
let pool: HTMLElement | null = null;
let poolOn = false;
const poolPos = { x: 0, y: 0 };
let shadowLine: HTMLElement | null = null;
let castShadow: HTMLElement | null = null;
let blurOn = false;
let lastBlur = -1, lastShadow = -1, blurNow = 0, behindGlass = false;

/** z-order the planes against the drone; a swap waits until the plane and the drone no longer overlap */
function orderPlanes() {
  const s = store.screen, z = store.z;
  const live = store.ready && s.visible;
  const y0 = scrollY - 200, y1 = scrollY + innerHeight + 200;
  const rx = s.r * 0.95, ry = s.r * 0.6;
  behindGlass = false;
  for (const p of planes) {
    if (p.bottom < y0 || p.top > y1) continue;
    if (live && blurOn && p.glass && p.fore && p.plane > z && !behindGlass) {
      const g = p.el.getBoundingClientRect(); // centre within the glass (gutters included)
      behindGlass = s.x > g.left - 24 && s.x < g.right + 24 && s.y > g.top - 24 && s.y < g.bottom + 24;
    }
    const want = p.fore ? p.plane > z - 0.04 : p.plane > z + 0.04;
    if (want === p.fore) continue;
    if (live) {
      const b = p.el.getBoundingClientRect();
      const nx = Math.max(b.left, Math.min(s.x, b.right)), ny = Math.max(b.top, Math.min(s.y, b.bottom));
      const dx = (s.x - nx) / rx, dy = (s.y - ny) / ry;
      if (dx * dx + dy * dy < 1) continue; // overlapping: hold the current order
    }
    p.fore = want;
    p.el.classList.toggle('is-fore', want);
  }
}

/** depth cues: a touch of defocus when the drone is set back, a soft cast shadow when it hovers near the page */
function depthCues() {
  const s = store.screen, z = store.z;
  const el = flightEl();
  if (el && blurOn) {
    // defocus with depth (≈ 1.6 px set well back) and whenever it flies behind a glass plane; eased, never popped
    const want = Math.max(Math.min(1.8, Math.max(0, (-z - 0.15) * 3.6)), behindGlass ? 1.8 : 0);
    blurNow += (want - blurNow) * 0.18;
    if (Math.abs(want - blurNow) < 0.05) blurNow = want;
    const b = Math.round(blurNow * 10) / 10;
    if (b !== lastBlur) { lastBlur = b; el.style.filter = b > 0 ? `blur(${b}px)` : ''; }
  }
  if (castShadow) {
    const on = store.ready && s.visible && !store.dark && store.section !== 'process';
    const k = on ? Math.min(1, Math.max(0, (z + 0.45) / 0.6)) : 0;
    const o = Math.round(k * 0.5 * 100) / 100;
    if (o !== lastShadow) { lastShadow = o; castShadow.style.opacity = String(o); }
    if (o > 0) {
      const lift = 0.35 + Math.max(0, z) * 0.5; // further from the page: further down, wider, softer
      const w = s.r * (1.5 + lift * 0.4);
      castShadow.style.transform = `translate3d(${s.x - w / 2 + s.r * 0.18}px, ${s.y + s.r * lift}px, 0) scale(${w / 200}, ${w / 200})`;
    }
  }
}
let stepEl: () => HTMLElement | null = () => null;
export function setActiveStepGetter(fn: () => HTMLElement | null) { stepEl = fn; }

function tick() {
  const s = store.screen;
  const now = performance.now();
  if (store.ready && s.visible) {
    // wake reveals
    const pageY = s.y + scrollY;
    for (const c of wakeCards) {
      if (c.done) continue;
      if (s.x > c.x - 40 && s.x < c.x + c.w + 40 && pageY > c.y - 40 && pageY < c.y + c.h + 40) revealCard(c);
    }
    // counters on the low pass
    if (store.section === 'numbers') {
      for (const t of tiles) {
        if (t.done) continue;
        if (s.x > t.cx - 20 && Math.abs(pageY - t.cy) < innerHeight * 0.45) { t.done = true; t.start(); }
      }
    }
  }
  // light pool (Process): follows the drone, aimed at the active step
  if (pool) {
    const on = store.ready && store.section === 'process' && activeP > 0.06 && activeP < 0.92;
    if (on !== poolOn) { poolOn = on; gsap.to(pool, { opacity: on ? 1 : 0, duration: 0.6, ease: 'power2.out', overwrite: true }); }
    if (on) {
      const st = stepEl();
      let ax = s.x, ay = s.y;
      if (st) { const r = st.getBoundingClientRect(); ax = r.left + r.width * 0.4; ay = r.top + r.height * 0.45; }
      const gx = s.x + (ax - s.x) * 0.62, gy = s.y + (ay - s.y) * 0.62;
      const k = 1 - Math.pow(1 - 0.12, gsap.ticker.deltaRatio());
      poolPos.x += (gx - poolPos.x) * k; poolPos.y += (gy - poolPos.y) * k;
      pool.style.transform = `translate3d(${poolPos.x}px, ${poolPos.y}px, 0)`;
    } else { poolPos.x = s.x; poolPos.y = s.y; }
  }
  // marquee: a hairline shadow crossing the band under the drone
  if (shadowLine) {
    const on = store.ready && store.section === 'logos' || (store.section === 'hero' && activeP > 0.8);
    shadowLine.style.opacity = on ? '1' : '0';
    if (on) shadowLine.style.transform = `translate3d(${s.x}px, 0, 0)`;
  }
  if (planes.length) orderPlanes();
  depthCues();
  updateHud(now);
}

/* ------------------------------------------------------------------ mount */
let unmount: (() => void) | null = null;
let mounting = false;
let introPlayed = false;
const flightEl = () => q<HTMLElement>('#flight');

async function mount(tier: Tier) {
  if (mounting || unmount) return;
  mounting = true;
  const el = flightEl();
  if (!el) return;
  // preload the model alongside the chunk (only now that we decided to mount)
  const link = document.createElement('link');
  link.rel = 'preload'; link.as = 'fetch'; link.href = '/models/drone.glb'; link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
  // ?poster: dev-only still for the reduced-motion / no-WebGL poster (scripts/poster.mjs)
  const posterMode = new URLSearchParams(location.search).has('poster');
  if (posterMode) html.classList.add('poster-mode');
  const { mountFlight } = await import('../three/mount-flight');
  unmount = mountFlight(el, tier === 'low' || posterMode, compact);
  mounting = false;
  html.classList.add('flight-on');
  // entry: fly in from the top right if the hero is on screen, else just be there
  const waitReady = () => new Promise<void>((r) => { const f = () => (store.ready ? r() : requestAnimationFrame(f)); f(); });
  await waitReady();
  el.classList.add('is-ready');
  dbg.flightReady = true;
  if (!introPlayed && !posterMode && scrollY < innerHeight * 0.4) {
    introPlayed = true;
    gsap.fromTo(store, { intro: 0 }, { intro: 1, duration: 1.4, ease: 'expo.out', onUpdate: () => store.wake() });
  } else store.intro = 1;
}

/** Called by motion.ts once; returns a cleanup. `heroDone` resolves when the statement lines land. */
export function startFlight(tier: Tier, heroDone: Promise<unknown>) {
  store.tier = tier;
  dbg.tier = tier;
  html.dataset.tier = tier;
  if (tier === 'rm' || tier === 'nogl') return () => {};
  compact = !matchMedia(DESK_MQ).matches;
  path = compact ? (innerWidth < 641 ? PHONE : LOW) : DESKTOP;

  pool = compact && innerWidth < 700 ? null : q('[data-pool]');
  shadowLine = compact ? null : q('[data-marquee-shadow]');
  castShadow = q('[data-cast-shadow]');
  blurOn = tier === 'full' && !compact;
  const hudRoot = compact ? null : q('[data-hud]');
  hud = hudRoot ? { root: hudRoot, wp: q('[data-hud-wp]', hudRoot)!, sec: q('[data-hud-sec]', hudRoot)!, alt: q('[data-hud-alt]', hudRoot)!, hdg: q('[data-hud-hdg]', hudRoot)! } : null;

  const st = ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: (self) => { store.scrollV = self.getVelocity(); update(); },
  });
  ScrollTrigger.addEventListener('refresh', measure);
  measure();
  gsap.ticker.add(tick);

  // mount policy (applikation boot.ts): desktop at idle after load; phones on first intent or after 4 s
  let timer = 0;
  const go = () => { cleanupIntent(); clearTimeout(timer); void heroDone.then(() => mount(tier)); };
  const intents = ['scroll', 'touchstart', 'pointerdown', 'keydown', 'wheel'] as const;
  const cleanupIntent = () => intents.forEach((e) => removeEventListener(e, go, { capture: true }));
  if (tier === 'full') {
    const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(() => go(), { timeout: 1500 }) : setTimeout(go, 1500));
    if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
  } else {
    intents.forEach((e) => addEventListener(e, go, { passive: true, capture: true, once: true }));
    timer = window.setTimeout(go, 4000);
  }

  return () => {
    cleanupIntent(); clearTimeout(timer);
    st.kill();
    ScrollTrigger.removeEventListener('refresh', measure);
    gsap.ticker.remove(tick);
    unmount?.(); unmount = null;
    html.classList.remove('flight-on');
    flightEl()?.classList.remove('is-ready');
    if (pool) pool.style.opacity = '0';
    if (shadowLine) shadowLine.style.opacity = '0';
    if (castShadow) castShadow.style.opacity = '0';
    const f = flightEl(); if (f) f.style.filter = '';
    lastBlur = -1; lastShadow = -1;
  };
}

/* ------------------------------------------------------------------ access pass identity (bug 5)
   The pass shows "VISITOR / VELON LABS" until a name is known. B's contact form writes the visitor's
   name to sessionStorage on a successful submit and dispatches 'velon:visitor'; we also read the
   key directly in case the form was filled earlier in this session. The session ID is generated once
   per browser session (VLN-<year>-<4 digits>) and kept in sessionStorage so it's stable on reload. */
const PASS_NAME_KEY = 'velon-visitor-name';
const PASS_ID_KEY = 'velon-pass-id';
const genPassId = () => `VLN-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
function sessionPassId(): string {
  try {
    const existing = sessionStorage.getItem(PASS_ID_KEY);
    if (existing) return existing;
    const id = genPassId();
    sessionStorage.setItem(PASS_ID_KEY, id);
    return id;
  } catch { return genPassId(); }
}
function readVisitorName(): string | null {
  try { return sessionStorage.getItem(PASS_NAME_KEY); } catch { return null; }
}
/** Mutates `site.badge` and updates the always-present static SVG text (the 3D badge, if already
 * mounted, is refreshed separately since its face is a canvas texture baked at mount time). */
function applyPassIdentity(name: string | null) {
  site.badge.id = sessionPassId();
  if (name && name.trim()) site.badge.holder = name.trim();
  const holderEl = q('[data-pass-holder]');
  if (holderEl) holderEl.textContent = site.badge.holder.toUpperCase();
  const idEl = q('[data-pass-id]');
  if (idEl) idEl.textContent = site.badge.id;
}
let refreshBadgeFace: (() => void) | null = null;
/** Runs on every page (independent of tier/RM): the static SVG pass must show the right name even
 * with no WebGL or motion. Call once from motion.ts's boot(), before startPass(). */
export function initPassIdentity() {
  applyPassIdentity(readVisitorName());
  window.addEventListener('velon:visitor', (e) => {
    const detail = (e as CustomEvent<{ name?: string }>).detail;
    applyPassIdentity(detail?.name ?? readVisitorName());
    refreshBadgeFace?.();
  });
}

/* ------------------------------------------------------------------ the access pass (fixed, top right)
   Hangs from the top edge of the viewport on every page position. The physics chunk (rapier) is lazy:
   desktop mounts it at idle once the statement has landed, phones on first intent or after 3.5 s.
   Scrolled past the hero it tucks up (shorter strap); hovering a tucked pass lowers it again. */
export function startPass(tier: Tier, heroDone: Promise<unknown>) {
  const found = q<HTMLElement>('[data-pass]');
  if (!found || tier === 'rm' || tier === 'nogl') return () => {};
  const layer: HTMLElement = found;
  const host = q<HTMLElement>('[data-pass-canvas]', layer)!;
  const hit = q<HTMLElement>('[data-pass-hit]', layer)!;
  let off: (() => void) | null = null, dead = false, timer = 0, hintT = 0;
  const intents = ['scroll', 'touchstart', 'pointerdown', 'keydown', 'wheel'] as const;
  const clearIntents = () => intents.forEach((e) => removeEventListener(e, go, { capture: true }));
  async function go() {
    clearIntents(); clearTimeout(timer);
    if (dead || off) return;
    const { mountBadge } = await import('../three/mount-badge');
    if (dead || off) return;
    off = mountBadge(host, {
      hit,
      low: tier === 'low',
      onReady: () => {
        layer.classList.add('is-live'); dbg.badgeReady = true;
        hintT = window.setTimeout(() => layer.classList.add('hint-done'), 7000);
      },
      onDrag: (on: boolean) => {
        gsap.to(store, { nudge: on ? 0.05 : 0, duration: 0.6, ease: 'power2.out' });
        layer.classList.toggle('is-dragging', on);
        if (on) layer.classList.add('hint-done');
      },
    });
  }
  // a visitor name arriving after the 3D card is already mounted: remount so the face texture
  // (baked once from site.badge at mount time) re-bakes with the new name
  refreshBadgeFace = () => { if (dead) return; const prev = off; off = null; prev?.(); void go(); };
  if (tier === 'full') {
    const idle = () => void heroDone.then(() => ('requestIdleCallback' in window ? requestIdleCallback(() => go(), { timeout: 1200 }) : setTimeout(go, 600)));
    if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
  } else {
    intents.forEach((e) => addEventListener(e, go, { passive: true, capture: true, once: true }));
    timer = window.setTimeout(go, 3500);
  }
  // tuck past the hero; a hover (fine pointer) lowers it again
  const tuck = ScrollTrigger.create({
    start: () => innerHeight * 0.5, end: () => ScrollTrigger.maxScroll(window) + 1e5, // never 'max': at the very bottom it would untuck over the footer
    onToggle: (self) => { store.pass.tuck = self.isActive ? 1 : 0; layer.classList.toggle('is-tucked', self.isActive); store.pass.wake(); },
  });
  const enter = () => { store.pass.hover = true; store.pass.wake(); };
  const leave = () => { store.pass.hover = false; store.pass.wake(); };
  hit.addEventListener('pointerenter', enter);
  hit.addEventListener('pointerleave', leave);
  return () => {
    dead = true; clearIntents(); clearTimeout(timer); clearTimeout(hintT);
    tuck.kill(); off?.(); off = null; refreshBadgeFace = null;
    hit.removeEventListener('pointerenter', enter);
    hit.removeEventListener('pointerleave', leave);
    layer.classList.remove('is-live', 'is-tucked', 'is-dragging');
  };
}
