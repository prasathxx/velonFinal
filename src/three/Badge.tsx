// The access pass on a lanyard: a port of the Vercel Ship badge (band.tsx, MIT, via
// github.com/daffahaidar/interactive-3d-event-badge). Same joint chain, curve, damping and drag maths;
// our own card (shape + canvas faces from site.badge), clip, clamp and band texture.
// v3: the pass hangs from the top edge of a fixed layer at the viewport's top right. It drops in on
// mount (the kinematic anchor falls from above the edge and overshoots), tucks up past the hero
// (store.pass.tuck), and renders on demand: frames run only while something in the chain is awake.
// The canvas never takes pointer events; a DOM hit box tracks the card's projected bounds instead,
// so only the card itself blocks the page underneath.
import { useEffect, useMemo, useRef, useState } from 'react';
import { extend, useFrame, useThree, type ThreeElement } from '@react-three/fiber';
import {
  BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint, type RapierRigidBody,
} from '@react-three/rapier';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import * as THREE from 'three';
import { backTexture, bandTexture, faceTexture } from './badge-textures';
import { store } from './flight-store';

extend({ MeshLineGeometry, MeshLineMaterial });
declare module '@react-three/fiber' {
  interface ThreeElements {
    meshLineGeometry: ThreeElement<typeof MeshLineGeometry>;
    meshLineMaterial: Omit<ThreeElement<typeof MeshLineMaterial>, 'args'> & Record<string, unknown>;
  }
}

const W = 1.6, H = 2.25, D = 0.02, R = 0.08;
const SEG = 0.42; // rope segment length (three segments: the visible strap)
const DROP = 4.4; // the anchor starts this far above its rest (everything out of view)
const FOV = 25;
const TAN = Math.tan((FOV * Math.PI) / 360);
const segmentProps = { type: 'dynamic', canSleep: true, colliders: false, angularDamping: 2, linearDamping: 2 } as const;

type Bp = 'desk' | 'tab' | 'phone';
const bpOf = (w: number): Bp => (w < 641 ? 'phone' : w < 1025 ? 'tab' : 'desk');
/** px per world unit (card width = 1.6 × this), card centre from the layer's right edge, tuck lift */
const PPU: Record<Bp, number> = { desk: 80, tab: 64, phone: 44 };
const LANE: Record<Bp, number> = { desk: 84, tab: 66, phone: 44 };
// tucked, the card's lower edge sits in the nav band (≈ 60 px), so it never covers content below the nav
const TUCK: Record<Bp, number> = { desk: 2.9, tab: 2.75, phone: 2.55 };

function roundedShape() {
  const s = new THREE.Shape();
  const x = -W / 2, y = -H / 2;
  s.moveTo(x + R, y);
  s.lineTo(x + W - R, y); s.quadraticCurveTo(x + W, y, x + W, y + R);
  s.lineTo(x + W, y + H - R); s.quadraticCurveTo(x + W, y + H, x + W - R, y + H);
  s.lineTo(x + R, y + H); s.quadraticCurveTo(x, y + H, x, y + H - R);
  s.lineTo(x, y + R); s.quadraticCurveTo(x, y, x + R, y);
  return s;
}
function faceGeometry(shape: THREE.Shape) {
  const g = new THREE.ShapeGeometry(shape, 8);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + W / 2) / W, (pos.getY(i) + H / 2) / H);
  return g;
}
const backOut = (t: number) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

interface Props { onDrag: (on: boolean) => void; onReady: () => void; hit: HTMLElement }

function Band({ onDrag, onReady, hit }: Props) {
  const band = useRef<THREE.Mesh<MeshLineGeometry, MeshLineMaterial>>(null!);
  const fixed = useRef<RapierRigidBody>(null!);
  const j1 = useRef<RapierRigidBody>(null!);
  const j2 = useRef<RapierRigidBody>(null!);
  const j3 = useRef<RapierRigidBody>(null!);
  const card = useRef<RapierRigidBody>(null!);
  const cardObj = useRef<THREE.Group>(null!);
  const { size, camera, invalidate } = useThree();
  const [dragged, drag] = useState<THREE.Vector3 | false>(false);
  const tmp = useMemo(() => ({
    vec: new THREE.Vector3(), ang: new THREE.Vector3(), rot: new THREE.Vector3(), dir: new THREE.Vector3(), corner: new THREE.Vector3(),
    lerped: new Map<string, THREE.Vector3>(), readyFired: false, t0: -1, tuck: 0, ax: 0, ay: 0, hitKey: '',
  }), []);
  const [curve] = useState(() => new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]));
  curve.curveType = 'chordal';

  // layout: camera distance from the target px/unit, anchor just above the top edge, `LANE` px from the right
  const geo = useMemo(() => {
    const bp = bpOf(innerWidth);
    const ppu = PPU[bp];
    const hh = size.height / (2 * ppu), hw = size.width / (2 * ppu);
    return { bp, ppu, hh, hw, ax: hw - LANE[bp] / ppu, ay: hh + 0.12, tuck: TUCK[bp], camZ: hh / TAN };
  }, [size.width, size.height]);
  useEffect(() => {
    camera.position.set(0, 0, geo.camZ);
    camera.updateProjectionMatrix();
    store.pass.wake();
  }, [camera, geo]);
  // initial chain (only read on mount): hanging below the raised anchor, nudged right so it swings
  const [init] = useState(() => {
    const x = geo.ax, y = geo.ay + DROP;
    return { a: [x, y, 0], j1: [x + 0.14, y - SEG, 0], j2: [x + 0.28, y - 2 * SEG, 0], j3: [x + 0.42, y - 3 * SEG, 0], c: [x + 0.5, y - 3 * SEG - 1.45, 0] } as Record<string, [number, number, number]>;
  });

  const parts = useMemo(() => {
    const shape = roundedShape();
    const face = faceGeometry(shape);
    const back = faceGeometry(shape);
    const edge = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false, curveSegments: 8 });
    edge.translate(0, 0, -D / 2);
    const faceMat = new THREE.MeshPhysicalMaterial({ map: faceTexture(), clearcoat: 0.6, clearcoatRoughness: 0.2, roughness: 0.42, metalness: 0.15 });
    const backMat = new THREE.MeshPhysicalMaterial({ map: backTexture(), clearcoat: 1, clearcoatRoughness: 0.15, roughness: 0.35, metalness: 0.05 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.3 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, metalness: 0.9, roughness: 0.25 });
    const bandMap = bandTexture();
    return { face, back, edge, faceMat, backMat, edgeMat, metal, bandMap };
  }, []);
  useEffect(() => () => {
    Object.values(parts).forEach((p) => (p as { dispose?: () => void }).dispose?.());
  }, [parts]);

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], SEG]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], SEG]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], SEG]);
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.45, 0]]);

  useEffect(() => {
    onDrag(!!dragged);
    store.pass.wake();
    if (!dragged) return;
    // a release anywhere (also outside the window) ends the drag
    const up = () => drag(false);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    return () => { removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
  }, [dragged, onDrag]);

  useFrame((state, delta) => {
    if (!fixed.current || !j1.current || !j2.current || !j3.current || !card.current || !band.current) return;
    const { vec, dir, ang, rot, lerped } = tmp;
    const dt = Math.min(delta, 1 / 30);
    const now = state.clock.elapsedTime;
    if (tmp.t0 < 0) tmp.t0 = now + 0.15;
    const chain = [card, j1, j2, j3];

    // anchor: drop (back-eased overshoot), then tuck/untuck
    const dp = Math.min(1, Math.max(0, (now - tmp.t0) / 0.9));
    const wantTuck = store.pass.tuck && !store.pass.hover && !dragged ? 1 : 0;
    tmp.tuck = THREE.MathUtils.damp(tmp.tuck, wantTuck, 4.5, dt);
    if (Math.abs(tmp.tuck - wantTuck) < 1e-3) tmp.tuck = wantTuck;
    const ax = geo.ax, ay = geo.ay + DROP * (1 - backOut(dp)) + tmp.tuck * geo.tuck;
    const moved = Math.abs(ax - tmp.ax) + Math.abs(ay - tmp.ay) > 1e-4;
    if (moved) {
      tmp.ax = ax; tmp.ay = ay;
      fixed.current.setNextKinematicTranslation({ x: ax, y: ay, z: 0 });
      chain.forEach((r) => r.current?.wakeUp());
    }

    if (dragged) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position).normalize();
      vec.add(dir.multiplyScalar(state.camera.position.length()));
      chain.forEach((r) => r.current?.wakeUp());
      // keep the pass inside the layer: clamp to the visible half-extent at z 0
      const x = THREE.MathUtils.clamp(vec.x - dragged.x, -geo.hw + W / 2 + 0.1, geo.hw - W / 2 - 0.1);
      const y = THREE.MathUtils.clamp(vec.y - dragged.y, -geo.hh + H / 2 + 0.1, geo.hh - H / 2);
      card.current.setNextKinematicTranslation({ x, y, z: vec.z - dragged.z });
    }
    // smooth the two middle joints so the band never jitters (Vercel: minSpeed 10, maxSpeed 50)
    const pts = ([['j1', j1], ['j2', j2]] as const).map(([k, r]) => {
      const t = r.current.translation();
      let l = lerped.get(k);
      if (!l) { l = new THREE.Vector3(t.x, t.y, t.z); lerped.set(k, l); }
      const d = Math.max(0.1, Math.min(1, l.distanceTo(t as THREE.Vector3)));
      return l.lerp(t as THREE.Vector3, Math.min(1, dt * (10 + d * 40)));
    });
    curve.points[0].copy(j3.current.translation() as THREE.Vector3);
    curve.points[1].copy(pts[1]);
    curve.points[2].copy(pts[0]);
    curve.points[3].copy(fixed.current.translation() as THREE.Vector3);
    band.current.geometry.setPoints(curve.getPoints(32));
    ang.copy(card.current.angvel() as THREE.Vector3);
    rot.copy(card.current.rotation() as unknown as THREE.Vector3);
    card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z }, false);

    // DOM hit box = the card's projected bounds (layer px)
    const o = cardObj.current;
    if (o) {
      o.updateWorldMatrix(true, false);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        tmp.corner.set((cx * W) / 2, (cy * H) / 2 + (cy > 0 ? 0.3 : 0), 0).applyMatrix4(o.matrixWorld).project(state.camera);
        const px = (tmp.corner.x * 0.5 + 0.5) * size.width, py = (-tmp.corner.y * 0.5 + 0.5) * size.height;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      x0 = Math.max(0, x0); y0 = Math.max(0, y0);
      const key = `${x0 | 0},${y0 | 0},${(x1 - x0) | 0},${(y1 - y0) | 0}`;
      if (key !== tmp.hitKey) {
        tmp.hitKey = key;
        hit.style.transform = `translate3d(${x0}px, ${y0}px, 0)`;
        hit.style.width = `${Math.max(0, x1 - x0)}px`;
        hit.style.height = `${Math.max(0, y1 - y0)}px`;
      }
    }

    // demand loop: keep rendering while the drop, a tuck, a drag or any swing is still going
    const awake = !!dragged || dp < 1 || moved || chain.some((r) => r.current && !r.current.isSleeping());
    if (awake) invalidate();
    if (!tmp.readyFired && dp > 0.05) { tmp.readyFired = true; onReady(); }
  });

  const res = useMemo(() => new THREE.Vector2(size.width, size.height), [size.width, size.height]);

  return (
    <>
      <RigidBody ref={fixed} {...segmentProps} type="kinematicPosition" position={init.a} />
      <RigidBody position={init.j1} ref={j1} {...segmentProps}><BallCollider args={[0.1]} /></RigidBody>
      <RigidBody position={init.j2} ref={j2} {...segmentProps}><BallCollider args={[0.1]} /></RigidBody>
      <RigidBody position={init.j3} ref={j3} {...segmentProps}><BallCollider args={[0.1]} /></RigidBody>
      <RigidBody position={init.c} ref={card} {...segmentProps} type={dragged ? 'kinematicPosition' : 'dynamic'}>
        <CuboidCollider args={[W / 2, H / 2, 0.01]} />
        <group
          ref={cardObj}
          onPointerDown={(e) => {
            e.stopPropagation();
            drag(new THREE.Vector3().copy(e.point).sub(tmp.vec.copy(card.current.translation() as THREE.Vector3)));
            invalidate();
          }}
        >
          <mesh geometry={parts.edge} material={parts.edgeMat} />
          <mesh geometry={parts.face} material={parts.faceMat} position={[0, 0, D / 2 + 0.0005]} />
          <mesh geometry={parts.back} material={parts.backMat} position={[0, 0, -D / 2 - 0.0005]} rotation={[0, Math.PI, 0]} />
          {/* clamp + ring (clip), positions from the reference: joint at y 1.45 of the card */}
          <mesh material={parts.metal} position={[0, H / 2 + 0.02, 0]}>
            <boxGeometry args={[0.3, 0.14, 0.06]} />
          </mesh>
          <mesh material={parts.metal} position={[0, H / 2 + 0.2, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.1, 0.022, 10, 28]} />
          </mesh>
        </group>
      </RigidBody>
      <mesh ref={band}>
        <meshLineGeometry />
        <meshLineMaterial
          color="white"
          depthTest={false}
          resolution={res}
          useMap={1}
          map={parts.bandMap}
          repeat={new THREE.Vector2(-1.4, 1)}
          lineWidth={0.7}
        />
      </mesh>
    </>
  );
}

export default function BadgeScene(props: Props) {
  return (
    <Physics interpolate gravity={[0, -40, 0]} timeStep={1 / 60}>
      <Band {...props} />
    </Physics>
  );
}
