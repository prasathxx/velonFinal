// Tiny module store shared by the DOM side (motion.ts / flight-bridge.ts) and the WebGL side (Drone.tsx).
// Plain mutable object: written by scroll, read in useFrame and in one gsap.ticker callback.
// No React state anywhere on this path (limo-juice Director pattern).

export type Tier = 'full' | 'low' | 'rm' | 'nogl';

/** Viewport-normalised pose: x −1 (left edge) … +1 (right edge), y −1 (bottom) … +1 (top). */
export interface Pose { x: number; y: number; z: number; yaw: number; scale: number }

export const store = {
  tier: 'full' as Tier,
  /** where the scroll wants the drone (written by the bridge) */
  target: { x: 1.6, y: 0.1, z: 0, yaw: -60, scale: 2 } as Pose,
  /** entry off-screen pose (screen right, mid-height: never through the nav or the pass), blended out by `intro` 0 → 1 */
  entry: { x: 1.75, y: 0.15, z: 0, yaw: -70, scale: 2.2 } as Pose,
  intro: 0,
  /** 0 on white bands, 1 on black ones (lights flip to rim) */
  dark: 0,
  /** short vertical dips (process step change), badge drag nudge */
  dip: 0,
  nudge: 0,
  /** section id + waypoint number for the HUD */
  section: 'hero',
  wp: 1,
  /** written by the Drone each frame */
  screen: { x: -9999, y: -9999, r: 0, visible: false },
  vel: { x: 0, y: 0 },
  alt: 0,
  /** the drone's current (damped) depth, read by the bridge to order the data-depth planes */
  z: 0,
  hdg: 90,
  ready: false,
  /** requests WebGL frames (set by the canvas when mounted) */
  wake: () => {},
  /** the access pass: 1 = tucked up (scrolled past the hero), hover lowers it; wake() requests physics frames */
  pass: { tuck: 0, hover: false, wake: () => {} },
  /** phone tier: page scroll velocity (px/s), banks the drone */
  scrollV: 0,
};

export type FlightStore = typeof store;
