// The survey drone: NateGazzard "Drone" (CC BY 3.0), meshopt GLB, recoloured to the monochrome palette.
// Every frame (dt-based, no React state): damp toward store.target, bank/pitch from velocity, idle bob,
// propellers spun about their own centres (re-pivoted on load), screen projection back into the store.
import { useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { store } from './flight-store';

const DEG = Math.PI / 180;
const FOV = 32;
const CAM_Z = 9;
const TAN = Math.tan((FOV / 2) * DEG);
const damp = THREE.MathUtils.damp;
const clamp = THREE.MathUtils.clamp;

/** Monochrome version of the model's colour-palette texture: luminance, slightly lifted. */
function greyTexture(src: THREE.Texture | null): THREE.Texture | null {
  const img = src?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img || !img.width) return null;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255;
    // recolour to the brand palette (the model samples four swatches): the dark shell becomes white
    // plastic, black details graphite, light-grey legs/clamps hairline chrome, the cyan lens dark glass
    const v = l < 0.03 ? 0.085 : l < 0.3 ? 0.9 : l < 0.85 ? 0.56 : 0.1;
    p[i] = p[i + 1] = p[i + 2] = Math.round(clamp(v, 0, 1) * 255);
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = src!.flipY;
  t.magFilter = THREE.NearestFilter; // palette swatches: no bleeding between cells
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

interface Prop { mesh: THREE.Mesh; disc: THREE.Mesh; dir: number }

export default function Drone({ low = false }: { low?: boolean }) {
  const gltf = useLoader(GLTFLoader, '/models/drone.glb', (l) => {
    (l as GLTFLoader).setMeshoptDecoder(MeshoptDecoder);
  });
  const { camera, size, invalidate } = useThree();
  const group = useRef<THREE.Group>(null!);
  const tilt = useRef<THREE.Group>(null!);

  const { model, props, rotorMat, discMat } = useMemo(() => {
    const root = gltf.scene.clone(true);
    const props: Prop[] = [];
    let srcMap: THREE.Texture | null = null;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !srcMap) srcMap = ((m.material as THREE.MeshStandardMaterial).map ?? null);
    });
    const grey = greyTexture(srcMap);
    const body = new THREE.MeshStandardMaterial({ map: grey, color: grey ? 0xffffff : 0xe8e8e8, roughness: 0.5, metalness: 0.08 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.4, metalness: 0.1 });
    const rotorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.1, transparent: true });
    const discMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });

    // normalise: long axis = 1 world unit, centred on the origin
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const dim = box.getSize(new THREE.Vector3());
    const s = 1 / Math.max(dim.x, dim.y, dim.z);
    const centre = box.getCenter(new THREE.Vector3());
    const holder = new THREE.Group();
    holder.add(root);
    root.scale.setScalar(s);
    root.position.copy(centre).multiplyScalar(-s);

    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    meshes.forEach((mesh) => {
      const name = (mesh.name + ' ' + (mesh.parent?.name ?? '')).toLowerCase();
      const isRotor = name.includes('rotor');
      mesh.material = isRotor ? rotorMat : name.includes('cube.002') ? dark : body;
      mesh.castShadow = false; mesh.receiveShadow = false;
      if (!isRotor) return;
      // re-pivot: spin about the rotor's own centre, not the body origin
      mesh.geometry = mesh.geometry.clone();
      mesh.geometry.computeBoundingBox();
      const c = mesh.geometry.boundingBox!.getCenter(new THREE.Vector3());
      mesh.updateMatrix();
      const pc = c.clone().applyMatrix4(mesh.matrix);
      mesh.geometry.translate(-c.x, -c.y, -c.z);
      mesh.position.copy(pc);
      const bs = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
      const r = Math.max(bs.x, bs.z) * 0.5;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40), discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0;
      disc.renderOrder = 2;
      mesh.add(disc);
      props.push({ mesh, disc, dir: props.length % 2 ? 1 : -1 });
    });
    return { model: holder, props, rotorMat, discMat };
  }, [gltf]);

  // live state (plain objects, mutated per frame)
  const st = useMemo(() => ({
    cur: { ...store.entry }, prev: { x: store.entry.x, y: store.entry.y },
    roll: 0, pitch: 0, turn: 0, spin: 0, lastWake: 0, settled: false,
    v: new THREE.Vector3(), first: true,
  }), []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 10); // damp is stable at large steps: slow devices still catch up
    const t = state.clock.elapsedTime;
    const g = group.current;
    if (!g) return;

    // blend entry pose → flight target by the intro clock
    const T = store.target, E = store.entry, i = store.intro;
    const tx = E.x + (T.x - E.x) * i;
    const ty = E.y + (T.y - E.y) * i + store.dip + store.nudge;
    const tz = E.z + (T.z - E.z) * i;
    const tyaw = E.yaw + (T.yaw - E.yaw) * i;
    const tsc = E.scale + (T.scale - E.scale) * i;

    const c = st.cur;
    if (st.first) { st.first = false; c.x = tx; c.y = ty; c.z = tz; c.yaw = tyaw; c.scale = tsc; }
    const lam = 5.2;
    c.x = damp(c.x, tx, lam, dt);
    c.y = damp(c.y, ty, lam, dt);
    c.z = damp(c.z, tz, lam, dt);
    c.yaw = damp(c.yaw, tyaw, 3.6, dt);
    c.scale = damp(c.scale, tsc, 4, dt);

    // velocity in viewport units / s
    const vx = (c.x - st.prev.x) / Math.max(dt, 1e-4);
    const vy = (c.y - st.prev.y) / Math.max(dt, 1e-4);
    st.prev.x = c.x; st.prev.y = c.y;
    store.vel.x = vx; store.vel.y = vy;
    const sv = low ? clamp(store.scrollV / 2400, -1, 1) : 0; // phone: page scroll velocity tilts it
    st.roll = damp(st.roll, clamp(-vx * 20 * DEG, -28 * DEG, 28 * DEG) + sv * 6 * DEG, 4, dt);
    st.pitch = damp(st.pitch, clamp(-vy * 10 * DEG, -12 * DEG, 12 * DEG) - sv * 8 * DEG, 4, dt);
    st.turn = damp(st.turn, clamp(vx * 22 * DEG, -32 * DEG, 32 * DEG), 3, dt);

    // world placement (viewport-normalised → world at the drone's depth)
    const dist = CAM_Z - c.z;
    const halfH = TAN * dist;
    const aspect = size.width / Math.max(1, size.height);
    const bob = 0.035 * Math.sin((t * Math.PI * 2) / 2.4);
    const sway = 0.012 * Math.sin((t * Math.PI * 2) / 3.1);
    const tierScale = low ? (size.width < 700 ? 0.55 : 0.75) : 1;
    g.position.set(c.x * halfH * aspect + sway, c.y * halfH + bob, c.z);
    g.scale.setScalar(c.scale * tierScale * 1.18);
    const yawNoise = (1.5 * DEG) * (Math.sin(t * 0.7) + Math.sin(t * 1.9));
    g.rotation.set(0, 0, 0);
    tilt.current.rotation.set(0.32 + st.pitch, c.yaw * DEG + st.turn + yawNoise, st.roll, 'YXZ');

    // propellers: spool with speed; above 40 rad/s blades hide behind a soft disc so they never strobe
    const speed = Math.hypot(vx, vy);
    const spool = Math.min(1, t / 0.6);
    const w = (20 + speed * 60) * spool + 6;
    st.spin += w * dt;
    const blur = clamp((w - 30) / 14, 0, 1);
    props.forEach((p) => { p.mesh.rotation.y = st.spin * p.dir; });
    discMat.opacity = 0.3 * blur;
    rotorMat.opacity = 1 - 0.8 * blur;
    rotorMat.depthWrite = blur < 0.5;

    // project to CSS px for the DOM side (wake reveals, light pool, HUD)
    st.v.set(g.position.x, g.position.y, g.position.z).project(camera);
    const sx = (st.v.x * 0.5 + 0.5) * size.width;
    const sy = (-st.v.y * 0.5 + 0.5) * size.height;
    const pxPerUnit = size.height / (2 * halfH);
    const r = 0.55 * c.scale * tierScale * 1.18 * pxPerUnit;
    store.screen.x = sx; store.screen.y = sy; store.screen.r = r;
    store.screen.visible = sx > -r && sx < size.width + r && sy > -r && sy < size.height + r;
    store.z = c.z;
    store.alt = (c.y + 1) * 0.6;
    store.hdg = ((90 + c.yaw + st.turn / DEG) % 360 + 360) % 360;

    // frame scheduling (demand loop): continuous while moving, ~30 fps bob at rest, none off-screen
    const moving = Math.abs(c.x - tx) + Math.abs(c.y - ty) + Math.abs(c.yaw - tyaw) * 0.01 + Math.abs(st.roll) + Math.abs(c.scale - tsc) > 0.002 || t < 1;
    if (moving) state.invalidate();
    else if (store.screen.visible) {
      const now = performance.now();
      if (now - st.lastWake > 30) { st.lastWake = now; setTimeout(() => invalidate(), 33); }
    }
    st.settled = !moving;
    if (!store.ready) store.ready = true;
  });

  return (
    <>
      <group ref={group}>
        <group ref={tilt}>
          <primitive object={model} />
        </group>
      </group>
    </>
  );
}
