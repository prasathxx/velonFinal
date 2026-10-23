# Velon — v2: the 3D page ("Flight Plan")

Build tonight (Opus agent), deploy in the morning on Vercel. v1 (PLAN.md) was rejected as "too simple, like an HTML site". v2 keeps v1's typography, grid, copy file and motion module and adds a real 3D layer: a drone that flies the page, a physics ID badge, and a handful of custom components chosen to read as one idea. Port stays **3950**. All copy stays in `src/data/site.ts` (schema unchanged, three small additions in §8).

## 1. Concept and narrative

**Flight Plan.** Velon surveys your operation from above, then lands the system. The page is one flight with ten waypoints (the sections). A small white survey drone enters in the hero, flies left/right across the page as you scroll, banks into its turns, and *presents* the work: solution cards reveal in its wake, the process steps are lit by its underside lamp, the numbers tick as it makes a low pass, the showcase rail is escorted, and at the end it delivers your **access pass** — the 3D badge on a lanyard in the contact section. The mono labels v1 already uses (`01  Solutions`) become flight telemetry (`WP 01 / HERO · ALT 1.20 · HDG 092`), so the HUD voice and the 3D layer are the same system.

Why this holds together: one object, one camera, one material palette (white plastic, graphite, hairline chrome), one light rig, monochrome grain over everything. No gradients, no colour, no particle soup. The 3D never sits under body copy: the drone's path is choreographed through the empty columns the v1 layouts already have (right of the hero statement, the right column of Solutions, the gap beside the big step number, above the counters). Readability first: every section still works as flat HTML if the 3D never mounts.

## 2. Stack decision

**Stay on Astro 5, add React islands** (`@astrojs/react@^4.4.2`, the Astro-5/Vite-6 line; 5.x needs Vite 7 = Astro 6). Reasons: the v1 site, its GSAP/Lenis module, static output and the data file all stay; React is confined to two canvases; HTML sections ship zero React runtime; Vercel auto-detects Astro. Rebuilding in Next.js would make every section a React component for the sake of two `<Canvas>`es and cost the night. The badge code is plain r3f, framework-agnostic, so it ports as-is.

Pinned versions (checked on npm today): `three@0.186.1`, `@react-three/fiber@9.8.1` (peer react `>=19 <19.4`), `@react-three/drei@10.7.9`, `@react-three/rapier@2.2.0` (bundles `@dimforge/rapier3d-compat@0.21.0`), `meshline@3.3.1`, `react@19.3.0`, `react-dom@19.3.0`, `@types/react@19`, `@astrojs/react@4.4.2`, `gsap@3.15.0`, `lenis@1.3.26`, `astro@5.18.2` (unchanged). Dev: `@gltf-transform/cli@4.5.1`, `sharp` (already there), `lighthouse` (npx).

Measured sizes (gzip): `three.module.js` 131 kB; r3f + drei subset ≈ 55 kB; **rapier compat 1.17 MB** (wasm base64 in JS) — so the badge chunk is loaded only when the CTA approaches, never on first paint (§9).

Mounting model: no `client:*` directives. The existing `motion.ts` decides *if and when* to mount (§9), then `import('../three/mount-flight')` / `import('../three/mount-badge')`, each calling `createRoot(el).render(<Canvas …/>)` into a prepared div. Reduced motion, no WebGL and low-power tiers decide before any 3D code downloads.

```
src/three/
  mount-flight.tsx   createRoot + <Canvas> (fixed, full viewport, pointer-events none), tier props
  FlightScene.tsx    camera, lights (Lightformer env), Grain, Drone, ContactShadow, Telemetry bridge
  Drone.tsx          useGLTF(+meshopt), rotor re-pivot, material recolour, propellers, idle bob, bank/pitch from velocity
  flight.ts          choreography data: waypoints per section (viewport-normalised), §4
  flight-store.ts    tiny module store: target {x,y,z,yaw,scale}, current, screen xy, velocity, section id
  Grain.tsx          fullscreen ShaderMaterial quad (monochrome hash noise, 12 fps, alpha .035)
  mount-badge.tsx    createRoot + <Canvas> inside the CTA; dynamic import of @react-three/rapier
  Badge.tsx          Vercel-style band + card (port of band.tsx, §5)
  BadgeFace.tsx      RenderTexture: wordmark, "ACCESS PASS", name, mono id (from site.ts)
src/scripts/motion.ts  + flight bridge: section triggers → store, wake reveals, light pool, HUD
src/components/{TiltCard,Rail,Telemetry}.astro  + Cases rail markup, badge slot in Cta
public/models/drone.glb (meshopt, ≈ 68 kB)  public/badge/band.png
public/poster/hero-drone.webp (no-WebGL/RM fallback, rendered by scripts/poster.mjs)
```

## 3. The drone: model, materials, behaviour

Asset: **A** (NateGazzard "Drone", §7) — verified tonight: 254 kB raw, no textures, 4,564 tris, and four separately named rotor meshes `Rotor_FL-Mesh / Rotor_FR-Mesh / Rotor_BL-Mesh / Rotor_BR-Mesh` plus `Body-Mesh` and `Cube.002-Mesh` (the gimbal). Pipeline (tested, keeps the nodes): `npx @gltf-transform/cli@4.5.1 optimize /tmp/drone-nate.glb public/models/drone.glb --compress meshopt --simplify false --join false --flatten false --instance false` → **68 kB** (`--join false` is essential: the default merges all meshes by material and the rotors vanish). Not Draco: its 330 kB decoder costs more than the model; meshopt's decoder is 25 kB and bundled (`useGLTF('/models/drone.glb', undefined, true)` wires `three/examples/jsm/libs/meshopt_decoder.module.js`). The file is `obj2gltf` output, so meshes sit in world space with identity node transforms: **re-pivot each rotor on load** (`geometry.computeBoundingBox(); c = bbox.getCenter(); geometry.translate(-c.x,-c.y,-c.z); mesh.position.copy(c)`) or spinning rotates them around the body origin. Orientation: body bbox x ±0.29, y −0.16…0.05, z −0.52…0.26, nose toward −Z (the gimbal end); normalise to 1.0 world unit on the long axis and keep the group's `yaw 0` = nose toward the camera's right (`rotation.y = π/2`), checked in the scratch page. Backup **B** (Little Drone, single mesh) only if A fails to load: fake props with two spinning discs.

Materials are **recoloured on load** to the brand palette regardless of what the asset ships: traverse meshes, replace with `MeshStandardMaterial`: body `#E8E8E8` roughness .55 metalness .08; arms/props/camera `#141414` roughness .4; any "metal"/"chrome" node `#9A9A9A` metalness .9 roughness .2. Textures dropped (bakes colour, keeps draw calls at ≤ 10). On black bands the key light flips to front-rim so the drone reads as a white silhouette; the switch is a lerp of light intensities driven by the section's `data-band="dark"`.

Behaviour (every frame, `useFrame`, dt-based):
- **Follow**: `current = damp(current, target, 6, dt)` on x/y/z/yaw/scale (drei `MathUtils.damp`): jumps in scroll never teleport the drone.
- **Bank/pitch from velocity**: `roll = clamp(-vx * 22°, ±28°)`, `pitch = clamp(-vy * 12°, ±12°)`, both damped (lambda 4). Turning *is* the banking; no keyframed roll.
- **Idle bob**: `y += 0.035 * sin(t * 2π / 2.4)`, `x += 0.012 * sin(t * 2π / 3.1)`, yaw noise `±1.5° * sin(t*0.7)+sin(t*1.9)`. Always on, also while flying.
- **Propellers**: rotate each prop node about its local up axis at `20 + |v| * 60 rad/s`; above 40 rad/s swap blade mesh visibility for a disc (`CircleGeometry`, `#111` opacity .35) so they never strobe.
- **Contact shadow** (drei `ContactShadows`, `opacity .35, blur 2.4, far 2, resolution 256`) on a plane that tracks the drone's x/z at a fixed y under it: ties it to the page on white bands; off on black bands and mobile.
- **Screen projection**: each frame, `project()` the drone's world position to CSS pixels → `store.screen = {x,y}`; `motion.ts` reads it for wake reveals, the light pool and the HUD.

Camera: `PerspectiveCamera fov 32, position [0,0,9]`, static; world half-height at z=0 is `2.58`, so a viewport-normalised waypoint `(nx, ny)` maps to `x = nx * 2.58 * aspect`, `y = ny * 2.58`. The only camera motion is a `±0.12` world pointer parallax (desktop, damped) and a `z 9 → 8.4` dolly across the hero scroll (scrub). Decision: drone moves, camera stays — text is HTML; a scrubbed camera over a static page looks detached, a flying object over it looks present.

Drone size: 1.0 world units ≈ 19 % of viewport height (≈ 175 px at 900 px). Mobile tier scale .55.

## 4. Section by section: layout + drone choreography + motion specs

Waypoints live in `src/data/flight.ts` as `{ section, at: 0..1 (progress within section), x, y, z, yaw, scale }` arrays; each section creates one `ScrollTrigger` (`start 'top bottom', end 'bottom top', scrub 0.8`) that interpolates its keyframes (`gsap.utils.interpolate`, ease `none`) into `store.target`. Reveal vocabulary from v1 stays (`lines/words/fade/stagger/rule`, `expo.out`). `nx`: −1 left edge … +1 right edge; `ny`: −1 bottom … +1 top. Desktop values; §10 has the phone tier.

1. **Nav** — unchanged from v1. The HUD lives bottom-left: `Telemetry.astro`, fixed, mono 10 px, `WP 02 / SOLUTIONS · ALT 0.84 · HDG 114`, values from the store, digits scramble `.35s` on change (kpr `useScramble`, charset `0-9A-F/`). Desktop only.
2. **Hero** (white, 100svh) — v1 layout. Grain shader fades in with the preloader. Drone **entry**: starts off-screen `(1.3, 1.2, z −1, yaw −40°)`, 1.4 s `expo.out` to its hover `(0.62, 0.30, z 0, yaw 20°)` right of the first statement line (empty column at 1440), landing 0.2 s after the statement lines finish; propellers spool up over the first 0.6 s. Hero scroll (0→1): `y .30 → .95`, `x .62 → .40`, it climbs out as the statement parallaxes. Contact shadow on the white ground. Poster fallback: the same hover pose as a `webp`.
3. **Logos marquee** — drone passes above the band `(0.40,1.05) → (−0.55, 1.05)`, i.e. out of view at the top edge; a 1 px shadow line crosses the marquee (CSS, driven by `store.screen.x`). Marquee itself unchanged.
4. **Solutions** (white, 3 × 2 bento) — the cards become **TiltCard**s: pointer tilt `rotateX/Y ±6°` (`perspective 1200px`), `.5s power3.out` return, a monochrome specular sheen `radial-gradient(rgba(0,0,0,.05))` following the pointer; hover still inverts. Drone **wake reveal**: path is an S over the grid `(−0.75, 0.55) → (0.75, 0.25) → (−0.75, −0.15) → (0.75, −0.45)` across the section's scroll; each card starts `opacity 0, y 24` and plays `.9s expo.out` the first time the drone's screen x/y enters the card's rect ± 40 px (rects cached on `refresh`). Safety: the section's `onLeave`/`onEnterBack` reveals everything; reduced motion reveals on enter. The contact shadow sweeps across the hairline grid under it.
5. **Process** (black, pinned, 4 steps) — layout as v1. Drone hovers at `(0.18, 0.05, z 0.4, scale 1.15)`, between the big number and the step copy, key light flipped to rim. Its **lamp**: a DOM light pool (`.pool`, 640 px, `radial-gradient(circle, rgba(255,255,255,.11), transparent 46%)`, `mix-blend-mode: screen`) that follows `store.screen` (lerp .12) and is aimed at the active step's text block — the drone yaws `−25° → +25°` as the steps snap, and the pool slides with the yaw so the lit step is the current one. Step change: drone dips `y −0.08` and back (`.6s power2.inOut`), props spool.
6. **Numbers** (white) — **low pass**: `(−1.2, −0.05, z 0.6) → (1.2, −0.05)` across the section's scroll at tile height, `yaw 90°` (side-on), the fastest move on the page, hard bank on exit. Each counter starts when `store.screen.x` passes its tile's centre (fallback `top 70%` as v1). Contact shadow runs along the tiles' hairline.
7. **Cases** (white → black) — desktop becomes a **horizontal rail**: section pinned for `+= (N−1) × 60 vw`, track `x: 0 → −(trackWidth − vw)` `scrub 0.6`, `snap` to cards (`labelsDirectional`, `.2/.6`); cards `56 vw × 64 vh`, greyscale CSS-pattern placeholder, client, outcome (h3), year/sector mono, arrow; the last card is black. Drone **escorts** at `(0.70, 0.62, z 0.2, yaw −12°)`, holding screen position while the cards slide under it (it appears to fly over the row); bob only. Phone/tablet/RM: the v1 editorial list, no rail.
8. **Testimonial** (black) — the drone **climbs out** `(0.70, 0.62) → (0.2, 1.3)` over the first 30 % of the section and is gone: the quote is read alone (v1 scrubbed line brightening stays).
9. **CTA** (white) — two columns at ≥ 1025: left the v1 statement + lead + button + email; right a `min-height 70vh` **badge slot** (§5). Drone **delivery**: enters from the top `(0.55, 1.3)` and descends to hover above the badge clip `(0.55, 0.72, yaw 10°)` as the section comes in (`.0 → .45` of the section scroll), then stays, bob only. Stretch: dragging the badge nudges the drone `+0.05 y` (store shared).
10. **Footer** (black) — no drone. Giant wordmark as v1. The HUD shows `WP 10 / FOOTER · LANDED`.

Transitions between waypoints: the ScrollTriggers hand over continuously (each section's first keyframe equals the previous section's last), so the path is one polyline; the per-frame `damp` rounds the corners and the velocity-driven bank sells each turn. Nothing uses `elastic`/`bounce`.

## 5. The badge (Vercel Ship lanyard) spec

Source to port: `components/band.tsx` from `github.com/daffahaidar/interactive-3d-event-badge` (MIT, Next 16 / r3f 9.6 / drei 10.7 / rapier 2.2 / meshline 3.3 — the same majors we pin; it is the Vercel blog implementation written out in full). Keep its structure verbatim: `fixed → j1 → j2 → j3` `RigidBody`s with `useRopeJoint(…, 1)` ×3, `useSphericalJoint(j3, card, [[0,0,0],[0,1.45,0]])`, `segmentProps {angularDamping 2, linearDamping 2, canSleep}`, `CatmullRomCurve3` (`chordal`) through `j3, j2(lerped), j1(lerped), fixed` → `MeshLineGeometry.setPoints(curve.getPoints(32))`, lerp speeds `minSpeed 10 / maxSpeed 50`, card `kinematicPosition` while dragged (pointer unprojected at the camera distance), angular damping `ang.y − rot.y * 0.25`, `Physics interpolate gravity [0,−40,0] timeStep 1/60`. Cursor `grab/grabbing`.

Velon version (do **not** reuse their `card.glb`/texture — build ours):
- Card: drei `RoundedBox args [1.6, 2.25, 0.02] radius .06` + `MeshPhysicalMaterial clearcoat 1, clearcoatRoughness .15, roughness .3, metalness .5`, `map` from a `RenderTexture` (`BadgeFace.tsx`, 1024 × 1440): white face, hairline frame, `Wordmark` SVG at top, mono `ACCESS PASS`, big Jakarta `site.badge.holder` ("Your name"), mono `site.badge.id` and `site.meta.email`, a barcode-like hairline strip; back face graphite with the wordmark outlined. Clip and clamp: a `Torus`/`Box` pair in `#B0B0B0 metalness .9` at the top (positions from the reference: clip at `y 1.45` of the card).
- Band: `public/badge/band.png` 1024 × 128 generated by `scripts/band.mjs` (sharp): black strip, white `VELON` + `·` repeated in Jakarta 700, `RepeatWrapping`, `repeat (−3, 1)`, `lineWidth 1`, `depthTest false`, `resolution` = canvas size (update on resize).
- Scene: `Canvas camera {position [0,0,13], fov 25}`, `dpr [1, 1.75]`, `gl {alpha true, antialias true}`, transparent background on the white band; light rig = `ambientLight .55` + `Environment blur .75` with four `Lightformer`s (as the Vercel scene: intensity 2 / 3 / 3 / 10, positions `[0,-1,5]`, `[-1,-1,1]`, `[1,1,1]`, `[-10,0,14]` rotated `π/3`) so the clearcoat reads in monochrome.
- Mount: `mount-badge.tsx` is imported when the CTA is within 1.5 viewports (`ScrollTrigger start 'top 150%' once`); it `await import('@react-three/rapier')` inside, so the 1.17 MB chunk never joins the critical path. Until mounted the slot shows a flat SVG of the card (no layout shift: fixed `aspect-ratio` box).
- Touch: works on phone (rapier runs fine); `touch-action: none` on the canvas only while a drag is active so page scroll is not stolen. Reduced motion: static SVG card, no physics. Low-power tier: static SVG.
- Copy for the face comes from `site.badge` (§8).

## 6. Custom components (the coherent set, nothing else)

| Component | What | Spec |
|---|---|---|
| `Grain` | monochrome film grain over the whole page, inside the flight canvas | fullscreen quad, `hash(uv*res + floor(t*12))` luminance ±1, alpha `.035` (`.05` on black bands), `depthTest false`, drawn last; off on mobile tier |
| `TiltCard` | Solutions cells | pointer tilt ±6°, `perspective 1200`, sheen gradient, `.5s power3.out` return, `transform-style: preserve-3d`, fine pointer only |
| `Rail` | Cases on desktop | pinned horizontal scroll, `scrub .6`, directional snap, cards 56 vw, progress hairline under the rail |
| `Telemetry` | fixed HUD bottom-left | waypoint/alt/heading from the store, scramble on change, desktop only |
| Light pool | Process | DOM radial light following the drone (§4.5) |
| Scramble | mono labels (`t-kicker`) and HUD only | `.35s`, charset `0-9A-F/·`, once on reveal; **not** on headings |
| Cursor, char-roll links, directional button fill, magnetic CTA | kept from v1 | cursor label `Drag` over the badge, `Fly` over the drone's screen rect |

Not doing: particles, bloom, colour, blur filters, scroll-jacked camera, WebGL text, video.

## 7. Assets (URLs, licences, sizes)

All URLs checked with `curl -sIL` tonight (HTTP 200, sizes exact); the files are also sitting in `/tmp/drone-*.glb` for the build agent. No CC0 drone exists on Poly Pizza, Kenney or Quaternius (Kenney/Quaternius have no drone at all; the three.js examples and glTF-Sample-Assets repos have none; Sketchfab's CC0 ones need a login), so the pick is CC-BY 3.0 with a one-line credit in the footer legal row (`site.footer.credits`, §8).

| # | Model | Page | Direct GLB | Licence / author | Tris | Raw | Props | Verdict |
|---|---|---|---|---|---|---|---|---|
| **A** | Drone (quadcopter, gimbal) | https://poly.pizza/m/DNbUoMtG3H | https://static.poly.pizza/4eb88feb-cb2d-46c3-980d-3e704868361c.glb | CC-BY 3.0, NateGazzard | 4,564 | 259,676 B (`gltf-binary`) → 68 kB meshopt | **4 named rotor meshes** | **Use** |
| B | Little Drone | https://poly.pizza/m/dJ9mjQQqDQJ | https://static.poly.pizza/17b4649d-839e-4984-b337-785dde5484cf.glb | CC-BY 3.0, Nick Olson | 2,690 | 188,576 B | single mesh | backup |
| C | Camera Drone | https://poly.pizza/m/fyB_cRYLcUY | https://static.poly.pizza/60a90488-942e-4638-b1ed-61bc962c8a12.glb | CC-BY 3.0, Christopher Burgess | 1,830 | 147,980 B | 21 unnamed parts | no |

Credit line (CC-BY 3.0 requires it): `Drone model by NateGazzard (poly.pizza/m/DNbUoMtG3H), CC BY 3.0, recoloured.`

Also: meshopt decoder (bundled from `three/examples/jsm/libs/meshopt_decoder.module.js`, MIT, ≈ 25 kB), `band.png` and `hero-drone.webp` generated locally, no external HDRs (Lightformers only), no CDN fonts in the badge (drei `Text` with the local Jakarta `woff2` via `font=` URL from the fontsource import). Badge reference code: `github.com/daffahaidar/interactive-3d-event-badge` `components/band.tsx` (MIT) — code only, none of its assets.

## 8. Data file additions (`src/data/site.ts`)

Schema and existing tabs unchanged. Add:
- `badge: { kicker: 'Access pass', holder: 'Your name', role: 'Guest', id: 'VLN-2026-0001', note: 'Drag the pass' }`
- `telemetry: { labels: { waypoint: 'WP', altitude: 'ALT', heading: 'HDG', landed: 'LANDED' } }`
- `cases.items[].image?: string` (optional, rail placeholder pattern when absent)
- `footer.credits: string` (the CC-BY line above, rendered next to `legal`)
Choreography numbers live in `src/data/flight.ts`, not the sheet.

## 9. Performance plan (Lighthouse mobile ≥ 80)

- **Critical path unchanged from v1**: HTML, inline CSS, two font preloads, `motion.ts` (gsap + lenis ≈ 55 kB gz). The hero's LCP is text; the poster (`hero-drone.webp` ≈ 35 kB, 900 px wide, `fetchpriority=low`, `aspect-ratio` reserved) is only `display:block` in the no-WebGL/RM tiers — otherwise the canvas paints into that reserved box, CLS 0.
- **Flight chunk** (three + r3f + drei ≈ 215 kB gz + `drone.glb` 68 kB + meshopt decoder 25 kB ≈ **310 kB gz total**): desktop mounts on `requestIdleCallback` after `load` (fallback 1.5 s); mobile tier mounts on the first `scroll`/`touchstart`/`pointerdown` or after 4 s, whichever first. `preload` hint for the GLB only after the decision to mount. Separate Vite chunk by the dynamic import; `three` externals deduped (`vite.resolve.dedupe: ['three']`).
- **Badge chunk** (rapier 1.17 MB gz + meshline): only when the CTA is within 1.5 viewports; never on first paint; `Cache-Control immutable` via `/_astro/*` rule already in `vercel.json`. Add a `/models/*`, `/badge/*`, `/poster/*` rule (`max-age=604800, stale-while-revalidate=86400`, as applikation's `vercel.json` does for `/models|draco|holo/`).
- **Render budget**: `dpr` capped `[1, 1.75]` desktop, `[1, 1.5]` mobile; `frameloop="always"` only while `store` is moving or the badge is awake, else `invalidate()` on demand (`frameloop="demand"` + `invalidate` from the scroll bridge and the bob tick at 30 fps when idle); `powerPreference 'high-performance'`; shadows off except `ContactShadows` (256²); ≤ 12 draw calls in the flight scene; the grain quad is the only full-screen fragment work; no postprocessing package.
- **Tiers**, decided in `motion.ts` before any import: `rm` (prefers-reduced-motion or `?motion=off`) → poster + static SVG badge; `nogl` (`!canvas.getContext('webgl2')`) → same; `low` (`deviceMemory ≤ 4 || hardwareConcurrency ≤ 4 || connection.saveData || width < 1025`) → mobile tier (§10); `full`. A `?tier=low|rm|full` override for testing.
- **Scroll smoothness**: the store is written by ScrollTriggers (`scrub .8`) and read in `useFrame`; no React state on scroll; no `setState` per frame anywhere; `motion.ts` reads `store.screen` in a single `gsap.ticker` callback and writes CSS vars (`--px/--py`) with `quickSetter`.
- Budget check: v1 scored ≥ 90; the 3D adds nothing Lighthouse mobile will execute (it does not scroll or interact), and the desktop run mounts at idle after `load` — accept a desktop perf dip, measure both, record in `screenshots/report.json`.

## 10. Phone layout (375) and tablet (834)

Phone still feels premium: the drone is a **companion**, not a tour. Tier `low`: scale .55, hovers top-right of the hero above the statement (`(0.55, 0.62)`), bob + yaw noise + bank from scroll velocity (`−vy` of the page, so fast scrolling tilts it), props on; one planned move: it drifts down the right margin across Solutions (`(0.72, 0.9) → (0.72, −0.9)`) revealing cards in its wake (cards are 1-col, so the wake is a vertical sweep), then holds top-right through Process/Numbers/Cases, climbs out at the quote, and descends to the badge in the CTA. No grain, no contact shadow, no light pool, no HUD, no rail, no tilt. Badge: full physics with touch drag (DPR 1.5), static SVG under `rm`/`nogl`. Tablet (834) = phone choreography with scale .75 and the light pool on.

## 11. Build order (tonight) and verification

Order (keep the page shippable at every step; v1 is the floor):
1. Deps + `@astrojs/react` + `tsconfig jsx: react-jsx` + `vite.resolve.dedupe`; run the meshopt command on `/tmp/drone-nate.glb` (re-download from the §7 URL if `/tmp` was cleared), render one bare `<Canvas>` with the GLB in a scratch page (`/_flight` dev-only, deleted before build) and confirm rotor re-pivot, orientation, size, draw calls. (≈ 30 min)
2. `FlightScene` + `Drone`: materials, lights, bob, props, contact shadow, DPR, `mount-flight`, tiers, poster script. Hero entry. (≈ 60)
3. `flight.ts` + the `motion.ts` bridge: per-section triggers → store, `damp`, bank/pitch, projection, wake reveals (Solutions, Numbers), light pool (Process), HUD. (≈ 75)
4. Badge: port `band.tsx`, `BadgeFace` RenderTexture, `band.mjs`, lazy rapier, CTA two-column layout, touch + RM/SVG fallback. (≈ 60)
5. `TiltCard`, `Rail` (desktop Cases), `Telemetry`, label scramble, `Grain`. (≈ 45)
6. Phone/tablet tier, RM/nogl tiers, resize re-init (breakpoint change → `ctx.revert()` + remount with new tier). (≈ 30)
7. Verification below; fix; `git add` (no push). (≈ 45)

Verification checklist (headless Chrome 155, no Playwright; extend `scripts/shots.mjs`):
- [ ] `npm run build`, `npx astro check` clean; `dist/_astro/` shows separate `flight-*.js`, `badge-*.js`, `rapier-*.js` chunks; initial HTML references none of them.
- [ ] Chrome flags for WebGL in headless: `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`; the script waits for `window.__velon.flightReady` (set after the first rendered frame) and `__velon.badgeReady` when the CTA is in view.
- [ ] Screenshots at **375 / 834 / 1440**: per-section viewport shots plus **five mid-flight frames** on desktop (hero hover, Solutions mid-S, Process step 2 lit, Numbers low pass, CTA badge), stitched full strips, `?tier=rm` and `?tier=low` sets, `?debug=flight` once (draws the waypoint polyline + HUD) to check the path never crosses body copy.
- [ ] Console: 0 errors/warnings in every set (watch for `EXT_meshopt_compression` "decoder not set", meshline `extend` types, rapier init twice, `THREE.WebGLRenderer: Context Lost`).
- [ ] Lighthouse: `npx lighthouse http://localhost:3950 --preset=desktop` and mobile (default) — **mobile perf ≥ 80**, CLS 0, a11y/best-practices/SEO ≥ 90; record scores in `screenshots/report.json`.
- [ ] Frame time: DevTools performance trace while scrolling Solutions → Numbers at 1440: no frame > 20 ms after mount; badge drag ≥ 55 fps.
- [ ] Scroll jump test: drag the scrollbar from hero to footer in one move — drone damps, no NaN, all cards revealed (onLeave safety), counters final.
- [ ] Resize 1440 ↔ 834 during Process pin and during the rail: no stuck pin, drone remounts once, no duplicate canvases.
- [ ] Keyboard: unchanged tab order; canvases `aria-hidden`, badge slot has a text alternative (`site.badge` copy in a visually-hidden `p`).
- [ ] Copy swap: change three strings and `badge.holder` in `site.ts`, the badge face re-renders.
- [ ] No push; morning: owner says go → `vercel` deploy, verify production at 375/1440, confirm `/models/drone.glb` and the rapier chunk are `immutable`.

Risks and the answer tonight: rapier chunk weight → lazy only (done above); rotors spinning around the wrong pivot → the re-pivot step in §3, verified in the scratch page before anything else; `mix-blend-mode: difference` nav over a transparent canvas → nav stays above the canvas in the same stacking context (`z-index 50` vs canvas `5`); Lenis + pin + horizontal rail → already proven in adeptus/applikation code (§12); r3f 9 under Astro's Vite 6 → `@astrojs/react@4.4.2` + `jsx: react-jsx`, nothing else.

## 12. What to lift from our own work (exact files)

Everything below was read tonight; the line numbers are current.

**limo-juice** (Next 16 + r3f 9.8.1 / drei 10.7.9 / three 0.186.1 — the same stack, so these port 1:1)
- `/Users/sarvs/work/limo-juice/src/scene/Scene.tsx` L1-103 — the `<Canvas>` recipe: DPR budget `clamp(1, 1.75, dpr, sqrt(3.6e6/(w*h)))`, `gl {antialias, powerPreference 'high-performance', alpha:false, stencil:false}`, `NeutralToneMapping` exposure 1.05, `Environment` + `Lightformer` rig (no HDR download). Copy for `FlightScene`, with `alpha:true` and `flat` tone mapping (monochrome).
- `src/scene/Director.tsx` L1-609 — the scroll-cinematic rig pattern: `useFrame` reads a plain `loop.p` progress and interpolates poses with inline eases; **no React state per frame**. `flight-store.ts` + `Drone.tsx` follow this exactly.
- `src/home/HomeLoop.tsx` L1-320 — `ScrollTrigger.create({ onUpdate: s => loop.p = s.progress })` DOM→3D bridge, idle "journey" clock on `gsap.ticker` when `p≈0` (our hero hover), reduced-motion static branch; `src/lib/loop.ts` beat map = our `flight.ts` shape.
- `src/components/Providers.tsx` L1-38 — Lenis `{lerp .1, smoothWheel, syncTouch:false, autoRaf:false}` on `gsap.ticker` (v1 already does this).
- `src/scene/chameleon.ts` L1-363 — `GLTFLoader` load + traverse + material replacement (`onBeforeCompile` not needed here); the material-recolour traversal in §3 is this file's shape. `src/scene/Background.tsx` L1-189 — fullscreen `ShaderMaterial` quad drawn first with `gl_Position.z = 0.9999`: `Grain.tsx` is the same quad drawn last with `depthTest false`.

**adeptus** (Next 16 + r3f + `@react-three/rapier ^2.2.0` already in use)
- `/Users/sarvs/work/adeptus/src/three/shared/SceneCanvas.tsx` L1-113 — **the canvas wrapper to lift verbatim**: IntersectionObserver + visibility + reduced-motion gated `frameloop 'always'|'demand'`, `dpr [1, dprMax]`, `flat`, `resize {scroll:false, debounce 60}`, `NoToneMapping`, `FrameProbe` frame-interval stats (use it for the ≤ 20 ms check).
- `src/three/shared/useLenisClock.ts` L1-75 — one Lenis scroll clock (`scroll/velocity/progress/direction`) handed into `useFrame` via ref, native-scroll fallback: the phone tier's "bank from scroll velocity".
- `src/sites/_shared/useLiteScene.ts` L1-34 — coarse-pointer/phone detection that swaps the heavy scene for a lite one: our tier switch.
- `src/three/crate/CrateHero.tsx` L159 (`scrub .8` pinned 3D hero) and `src/three/film/{Rail.tsx,FilmScene.tsx,timeline.ts}` — a pinned horizontal rail with a 3D escort; `Rail.tsx` is the model for `Rail.astro`'s pin/snap maths. `src/sections/HowWeWork.tsx` L44-80 — pinned steps strip + `labelsDirectional` snap (v1 already uses it; the drone's yaw snaps on the same labels).
- `src/kit/components/HoloCard.tsx` L1-265 + `holo.css` — pointer-tilt card (`preserve-3d`, `maxTilt 12°`, page-light CSS vars): `TiltCard` = this at `6°`, monochrome sheen, no foil.
- `src/kit/motion/Cursor.tsx` L1-80 — cursor states via `data-state` and shared `--light-px/--light-py` pointer vars: reuse the var writer for the Process light pool.
- `src/kit/motion/useScramble.tsx` L1-150 — scramble for the HUD/labels (charset override).

**applikation-website** (Astro + raw three — the lazy-boot and loader discipline)
- `/Users/sarvs/work/applikation-website/src/scripts/hero/boot.ts` L1-45 — paint HTML first, start model downloads after the title is painted and fonted, code-split 3D via dynamic `import()`, phones start at `load`, low priority, reduced-motion/`?still` skips the rig: the mount policy in §9 is this file.
- `src/scripts/shared/gltf.ts` L1-48 and `model-fetch.ts` L1-27 — shared loader with decoder disposal 4 s after the last decode and raw-byte cache; adapt for meshopt (`setMeshoptDecoder`).
- `src/scripts/hero/scroll.ts` L1-33 — CSS `position: sticky` stage instead of a ScrollTrigger pin (no DOM move under the title) + `scrub 0.6` progress tween: use for the CTA badge slot.
- `src/scripts/hero/world.ts` L94-117 — renderer flags, DPR budget 3.2 Mpx, `PCFSoftShadowMap` sizes 2048/1024 (we only use ContactShadows, but keep the DPR budget).
- `src/scripts/motion/core.ts` L1-69, `reveal.ts` L1-127 (`sliced()` 8-item split batches), `frame-loop.ts` L1-66 (`driveLenis()`/`napTicker()`: zero rAF at rest) — v1 already ported the first two; port `napTicker` now that a canvas rides the ticker.
- `vercel.json` — the `/(models|draco|images|holo|uploads)/` cache rule.

**six-yards** — `src/scripts/app.ts` L31-36 Lenis wiring, L474 pinned hero `scrub .5, anticipatePin 1` (already in v1); nothing WebGL.
**kpr-kit** — `src/kit/motion/{useScramble.tsx (147), useMarquee.ts (91), useCounter.tsx (86), Cursor.tsx (140)}`: the originals adeptus trimmed; no WebGL there.
**animejs-kit-site** — `kit/three/scene.js` L1-971: one shared WebGL context with scissor-rect views and `park()` for off-screen views (`MAX_PIXEL_RATIO = 2` L112). Not needed tonight (two canvases are under Chrome's limit), but it is the answer if a third view ever appears. `kit/three/environment.js` — CC0 HDRI list if the badge ever wants a real HDR.
**GitHub UCHIHA-OBITO003** — `Threejs` (two rotating-mesh Vite scaffolds, r3f 8) and `cssonly3d` (CSS `preserve-3d` ring carousel): reviewed, not lifted; `cssonly3d` is the zero-WebGL rail fallback idea if ever needed.
**Badge reference** — `github.com/daffahaidar/interactive-3d-event-badge/components/band.tsx` (MIT): the joints, curve, drag and damping numbers in §5 are read from this file.
