// Mounts the access-pass canvas into the fixed pass layer (top right of the viewport).
// Imported by flight-bridge.ts (desktop at idle once the statement lands, phones on first intent);
// the physics scene (and with it the rapier chunk) is a further lazy() import.
// The canvas never takes pointer events: r3f listens on <body> and maps client coordinates onto
// this canvas itself, and the DOM hit box (driven by Badge.tsx) is what the pointer actually lands on.
import './quiet';
import { lazy, Suspense, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { fontsReady } from './badge-textures';
import { store } from './flight-store';

const BadgeScene = lazy(async () => { await fontsReady(); return import('./Badge'); });

function Env() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.45;
    pmrem.dispose();
    invalidate();
    return () => { env.dispose(); scene.environment = null; };
  }, [gl, scene, invalidate]);
  return null;
}

interface Opts { low: boolean; hit: HTMLElement; onReady: () => void; onDrag: (on: boolean) => void }

function App({ low, hit, onReady, onDrag }: Opts) {
  return (
    <Canvas
      frameloop="demand"
      flat
      dpr={[1, low ? 1.5 : 1.75]}
      camera={{ position: [0, 0, 13], fov: 25, near: 0.5, far: 60 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance', stencil: false }}
      resize={{ scroll: false, debounce: 60 }}
      eventSource={document.body}
      eventPrefix="client"
      style={{ pointerEvents: 'none' }}
      onCreated={(state) => {
        state.gl.setClearColor(0x000000, 0);
        state.gl.toneMapping = THREE.NoToneMapping;
        state.gl.domElement.style.pointerEvents = 'none';
        // map page coordinates onto this (fixed, offset) canvas
        state.setEvents({
          compute: (event, s) => {
            const r = s.gl.domElement.getBoundingClientRect();
            s.pointer.set(((event.clientX - r.left) / Math.max(1, r.width)) * 2 - 1, -((event.clientY - r.top) / Math.max(1, r.height)) * 2 + 1);
            s.raycaster.setFromCamera(s.pointer, s.camera);
          },
        });
        store.pass.wake = () => state.invalidate();
      }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[-3, 4, 6]} intensity={1.6} />
      <directionalLight position={[4, -1, 3]} intensity={0.6} />
      <Env />
      <Suspense fallback={null}>
        <BadgeScene hit={hit} onReady={onReady} onDrag={onDrag} />
      </Suspense>
    </Canvas>
  );
}

let root: Root | null = null;
export function mountBadge(host: HTMLElement, opts: Opts) {
  root?.unmount();
  root = createRoot(host);
  root.render(<App {...opts} />);
  return () => { root?.unmount(); root = null; store.pass.wake = () => {}; };
}
