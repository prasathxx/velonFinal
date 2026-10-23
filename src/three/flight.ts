// Choreography: one polyline of waypoints across the page, one list per section.
// `at` is the progress through the section measured on the viewport's centre line
// (0 = section top at mid-screen, 1 = section bottom at mid-screen), so exactly one section
// owns the drone at any scroll position and each list's last key equals the next list's first.
// x/y are viewport-normalised (−1 … +1), z in world units toward the camera, yaw in degrees
// (0 = nose to the camera, + turns the nose to screen right), scale 1 ≈ 19 % of the viewport height.
//
// v3 depth: z is also the drone's depth against the page. Elements marked data-depth="<plane>" sit
// in front of the drone while plane > z and behind it otherwise (flight-bridge.ts swaps their z-index,
// never while they overlap the drone, so the order never pops). Keys with an anchor `a` measure y from
// an element instead of the viewport: y = that element's screen line at fraction fy, plus the key's y.
import type { Pose } from './flight-store';

export interface Anchor { sel: string; fy: number }
export interface Key extends Pose { at: number; a?: Anchor }
export type Path = Record<string, Key[]>;

const k = (at: number, x: number, y: number, z = 0, yaw = 0, scale = 1, a?: Anchor): Key => ({ at, x, y, z, yaw, scale, a });
const on = (sel: string, fy: number): Anchor => ({ sel, fy });

/** Desktop (≥1025, fine pointer). */
export const DESKTOP: Path = {
  // hero scale (≈ 42 % of a 1440 viewport): parked behind "THE SYSTEMS", in front of "YOU RUN ON.",
  // then it backs off and shrinks as the statement scrolls away
  hero: [
    k(0, 0.36, 0, 0, 28, 2.9, on('#hero-title .ln--2', 0.62)),
    k(0.55, 0.55, -0.08, -0.2, 18, 2.0),
    k(1, 0.6, -0.18, -0.4, 0, 1.35),
  ],
  logos: [k(0, 0.6, -0.18, -0.4, 0, 1.35), k(1, 0.45, 0.05, 0.1, -40, 1.35)],
  // in front of the heading (right → left), then it drops behind the glass grid and crosses the open
  // upper band of each row (never parked in a gutter): the thin card glass frosts it into a silhouette
  solutions: [
    k(0, 0.45, 0.05, 0.1, -40, 1.35),
    k(0.1, 0.25, 0, 0.1, -70, 1.35, on('#solutions-title', 0.5)),
    k(0.22, -0.35, 0, 0.1, -80, 1.3, on('#solutions-title', 0.6)),
    k(0.32, -0.62, 0, -0.6, 70, 1.25, on('.bento', 0.17)),
    k(0.56, 0.62, 0, -0.6, 80, 1.25, on('.bento', 0.17)),
    k(0.66, 0.6, 0, -0.6, -70, 1.25, on('.bento', 0.67)),
    k(0.86, -0.6, 0, -0.6, -80, 1.25, on('.bento', 0.67)),
    k(1, 0.4, -0.2, 0.2, 20, 1),
  ],
  // pinned: between the big step number and the step copy; yaw sweeps the lamp across the steps
  process: [
    k(0, 0.4, -0.2, 0.2, 20, 1),
    k(0.12, -0.2, 0.12, 0.4, -25, 1.1),
    k(0.3, -0.2, 0.1, 0.4, -10, 1.1),
    k(0.5, -0.2, 0.08, 0.4, 5, 1.1),
    k(0.7, -0.2, 0.06, 0.4, 25, 1.1),
    k(0.9, -0.2, 0.06, 0.4, 25, 1.1),
    k(1, -0.6, 0.0, 0.4, 70, 1),
  ],
  // the low pass, locked to the stat row: behind tiles 1 + 3 (glass frosts it), in front of 2 + 4
  numbers: [
    k(0, -0.6, 0.0, 0.4, 70, 1),
    k(0.14, -1.3, 0, 0, 85, 1.25, on('.stats', 0.42)),
    k(0.84, 1.3, 0, 0, 85, 1.25, on('.stats', 0.42)),
    k(1, 0.5, 0.5, 0.2, -12, 1),
  ],
  // escort beside the heading while the glass rail slides under it (the rail is a front plane)
  work: [k(0, 0.5, 0.5, 0.2, -12, 1), k(1, 0.5, 0.5, 0.2, -18, 1)],
  // right → left behind the quote (white type over the rim-lit drone)
  quote: [
    k(0, 0.5, 0.5, 0.2, -18, 1),
    k(0.3, 0.86, 0, -0.6, -60, 1.45, on('.quote__stack', 0.3)),
    k(0.72, -0.15, 0, -0.6, -80, 1.45, on('.quote__stack', 0.62)),
    k(1, -0.55, 0.3, 0, -40, 1.1),
  ],
  // contact: drops in behind the outline line (seen through the hollow letters), in front of the
  // solid one, turns to face the visitor and pirouettes as the page runs out
  contact: [
    k(0, -0.55, 0.3, 0, -40, 1.1),
    k(0.3, 0.42, 0, 0, -10, 1.9, on('#cta-title', 0.68)),
    k(0.55, 0.46, 0, 0, 0, 1.85, on('#cta-title', 0.62)),
    k(0.85, 0.46, 0.05, 0, 180, 1.6, on('#cta-title', 0.62)),
    k(1, 0.3, 0.55, 0.2, 260, 1.1),
  ],
  // exits up through the empty strip between the wordmark and the links (never the nav button)
  footer: [k(0, 0.3, 0.55, 0.2, 260, 1.1), k(0.5, -0.25, 1.4, 0, 320, 0.95), k(1, -0.25, 1.4, 0, 320, 0.95)],
};

/** Phone (scale .55) and tablet (.75): hero-scale in the statement, then a companion at the right edge. */
export const LOW: Path = {
  hero: [k(0, 0.3, 0, 0, 25, 2.25, on('#hero-title .ln--2', 0.6)), k(1, 0.66, 0.5, -0.3, 15, 1)],
  logos: [k(0, 0.66, 0.5, -0.3, 15, 1), k(1, 0.7, 0.55, -0.6, 10, 1.1)],
  solutions: [
    k(0, 0.7, 0.55, -0.6, 10, 1.1),
    // inside the card column (never straddling the card edge): the thin glass frosts it whole
    k(0.15, 0.36, 0, -0.6, 30, 1.15, on('.bento', 0.08)),
    k(0.9, 0.36, 0, -0.6, 30, 1.15, on('.bento', 0.9)),
    k(1, 0.66, 0.45, 0, 15, 1),
  ],
  process: [k(0, 0.66, 0.45, 0, 15, 1), k(1, 0.66, 0.45, 0, -15, 1)],
  numbers: [k(0, 0.66, 0.45, 0, -15, 1), k(1, 0.66, 0.45, 0, 15, 1)],
  work: [k(0, 0.66, 0.45, 0, 15, 1), k(1, 0.66, 0.45, 0, -10, 1)],
  quote: [k(0, 0.66, 0.45, 0, -10, 1), k(0.5, 0.55, 0.1, -0.6, -20, 1.3), k(1, 0.6, 0.45, 0, 0, 1)],
  contact: [
    k(0, 0.6, 0.45, 0, 0, 1),
    k(0.35, 0.4, 0, 0, -10, 1.6, on('#cta-title', 0.74)),
    k(0.7, 0.42, 0, 0, 120, 1.5, on('#cta-title', 0.6)),
    k(1, 0.6, 0.45, 0, 200, 1),
  ],
  footer: [k(0, 0.6, 0.45, 0, 200, 1), k(0.5, 0.1, 1.45, 0, 260, 1), k(1, 0.1, 1.45, 0, 260, 1)],
};

/** Phone: the statement is full-width, so the drone parks on the seam of lines 2 / 3 at the right:
 *  its canopy tucked behind "THE SYSTEMS", the legs hanging in front of "YOU RUN ON." into the gap. */
export const PHONE: Path = {
  ...LOW,
  hero: [k(0, 0.48, 0, 0, 30, 2.35, on('#hero-title .ln--3', 0.55)), k(1, 0.66, 0.5, -0.3, 15, 1)],
};

export const SECTIONS = ['hero', 'logos', 'solutions', 'process', 'numbers', 'work', 'quote', 'contact', 'footer'] as const;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Interpolate a section's keys at progress p into `out` (smoothstep between keys: soft corners).
 *  `ys` holds each key's resolved y (anchors already applied by the caller). */
export function sample(keys: Key[], p: number, out: Pose, ys?: number[]): Pose {
  const Y = (i: number) => (ys ? ys[i] : keys[i].y);
  const put = (i: number) => { const s = keys[i]; out.x = s.x; out.y = Y(i); out.z = s.z; out.yaw = s.yaw; out.scale = s.scale; return out; };
  if (p <= keys[0].at) return put(0);
  const n = keys.length - 1;
  if (p >= keys[n].at) return put(n);
  let i = 0;
  while (i < n - 1 && p > keys[i + 1].at) i++;
  const a = keys[i], b = keys[i + 1];
  const t = smooth((p - a.at) / (b.at - a.at || 1));
  out.x = a.x + (b.x - a.x) * t;
  out.y = Y(i) + (Y(i + 1) - Y(i)) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.yaw = a.yaw + (b.yaw - a.yaw) * t;
  out.scale = a.scale + (b.scale - a.scale) * t;
  return out;
}
