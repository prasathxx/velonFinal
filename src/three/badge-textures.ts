// Badge face, back and lanyard band drawn on 2D canvases from site.badge, in the page's own
// (already loaded) fonts: no extra font files, no image requests, and a copy change re-renders the pass.
import * as THREE from 'three';
import { site } from '../data/site';
import { LOGO_BOX, LOGO_PATH } from '../data/logo';

const JAKARTA = "'Plus Jakarta Sans Variable', 'Jakarta Fallback', system-ui, sans-serif";
const MONO = "'JetBrains Mono Variable', 'Mono Fallback', ui-monospace, monospace";

export async function fontsReady() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`700 120px ${JAKARTA}`),
        document.fonts.load(`500 40px ${MONO}`),
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch { /* fall back to whatever is loaded */ }
}

let logoPath: Path2D | null = null;
/** The Velon Labs logo (src/data/logo.ts) with its inked top-left at x, y, `height` px tall; returns its width. */
function logo(g: CanvasRenderingContext2D, x: number, y: number, height: number, mode: 'fill' | 'stroke') {
  const s = height / LOGO_BOX.h;
  logoPath ??= new Path2D(LOGO_PATH);
  g.save();
  g.translate(x - LOGO_BOX.x * s, y - LOGO_BOX.y * s);
  g.scale(s, s);
  // potrace's own transform (LOGO_TRANSFORM): y flipped, 1/10 units
  g.translate(0, 560);
  g.scale(0.1, -0.1);
  if (mode === 'fill') g.fill(logoPath);
  else { g.lineWidth = 2.2 / (s * 0.1); g.stroke(logoPath); }
  g.restore();
  return LOGO_BOX.w * s;
}

function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, track: number) {
  let cx = x;
  for (const ch of text) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + track; }
  return cx - x;
}

function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 1024 × 1440 front: graphite face, hairline frame, wordmark, ACCESS PASS, holder, id, barcode (white type). */
export function faceTexture() {
  const W = 1024, H = 1440;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const b = site.badge;
  const INK = '#ffffff', MUTE = 'rgba(255,255,255,.52)', LINE = 'rgba(255,255,255,.16)';
  g.fillStyle = '#0d0d0d'; g.fillRect(0, 0, W, H);
  // hairline frame
  g.strokeStyle = LINE; g.lineWidth = 2;
  g.strokeRect(48, 48, W - 96, H - 96);
  // clip slot
  g.fillStyle = '#262626';
  g.beginPath(); g.roundRect(W / 2 - 90, 86, 180, 34, 17); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 2; g.stroke();
  // header: wordmark left, kicker right
  g.fillStyle = INK;
  logo(g, 96, 188, 52, 'fill');
  g.textBaseline = 'middle';
  g.font = `500 24px ${MONO}`; g.fillStyle = MUTE;
  const kick = b.kicker.toUpperCase();
  const kw = [...kick].reduce((a, ch) => a + g.measureText(ch).width + 5, -5);
  spaced(g, kick, W - 96 - kw, 214, 5);
  g.fillStyle = LINE; g.fillRect(96, 292, W - 192, 2);
  // big holder name
  g.fillStyle = INK;
  g.textBaseline = 'alphabetic';
  let size = 168;
  g.font = `700 ${size}px ${JAKARTA}`;
  const words = b.holder.toUpperCase().split(' ');
  const maxW = W - 192;
  const wWidth = (w: string) => [...w].reduce((a, ch) => a + g.measureText(ch).width - size * 0.05, 0);
  while (size > 70 && Math.max(...words.map(wWidth)) > maxW) { size -= 6; g.font = `700 ${size}px ${JAKARTA}`; }
  const lh = size * 0.88;
  words.forEach((w, i) => spaced(g, w, 88, 300 + size + i * lh + 40, -size * 0.05));
  // role / event
  g.font = `500 28px ${MONO}`; g.fillStyle = MUTE;
  const yInfo = 300 + size + words.length * lh + 70;
  spaced(g, `${b.role.toUpperCase()}  ·  ${b.event.toUpperCase()}`, 96, yInfo, 5);
  // meta rows
  const rows: [string, string][] = [['ID', b.id], ['CONTACT', site.meta.email.toUpperCase()], ['ISSUED', '2026']];
  let y = H - 450;
  rows.forEach(([k, v]) => {
    g.fillStyle = LINE; g.fillRect(96, y - 48, W - 192, 2);
    g.font = `500 24px ${MONO}`; g.fillStyle = MUTE;
    spaced(g, k, 96, y, 5);
    g.font = `500 30px ${MONO}`; g.fillStyle = INK;
    const vw = [...v].reduce((a, ch) => a + g.measureText(ch).width + 2, -2);
    spaced(g, v, W - 96 - vw, y, 2);
    y += 86;
  });
  // barcode-like hairline strip
  let bx = 96;
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = INK;
  while (bx < W - 96) {
    const w = 2 + Math.floor(rnd() * 3) * 2;
    if (rnd() > 0.35) g.fillRect(bx, H - 196, Math.min(w, W - 96 - bx), 92);
    bx += w + 3 + Math.floor(rnd() * 5);
  }
  g.font = `500 20px ${MONO}`; g.fillStyle = MUTE;
  spaced(g, b.id.replace(/-/g, ' '), 96, H - 72, 9);
  return tex(c);
}

/** Back: white with the wordmark outlined. */
export function backTexture() {
  const W = 1024, H = 1440;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(10,10,10,.14)'; g.lineWidth = 2; g.strokeRect(48, 48, W - 96, H - 96);
  g.strokeStyle = 'rgba(10,10,10,.85)';
  const lh = 104;
  logo(g, (W - (LOGO_BOX.w * lh) / LOGO_BOX.h) / 2, H / 2 - 120, lh, 'stroke');
  g.fillStyle = 'rgba(10,10,10,.5)'; g.font = `500 24px ${MONO}`; g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(site.meta.tagline.toUpperCase(), W / 2, H / 2 + 200);
  return tex(c);
}

/** Lanyard: black strip, the white logo and a dot repeated (RepeatWrapping along the band). */
export function bandTexture() {
  const W = 1024, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffffff';
  // a whole number of logo + gap units across the width, so the wrap seam never shows
  const lh = 50;
  const lw = (LOGO_BOX.w * lh) / LOGO_BOX.h;
  const n = Math.max(1, Math.round(W / (lw + 110)));
  const unit = W / n;
  for (let i = 0; i < n; i++) {
    const x = i * unit;
    logo(g, x, (H - lh) / 2, lh, 'fill');
    g.beginPath(); g.arc(x + lw + (unit - lw) / 2, H / 2 + 4, 6, 0, Math.PI * 2); g.fill();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
