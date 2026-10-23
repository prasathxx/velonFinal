// Mounts the fixed, full-viewport flight canvas (pointer-events none) into #flight.
// Imported lazily by motion.ts once the tier allows WebGL; nothing here is on the critical path.
import './quiet';
import { Suspense, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import FlightScene from './FlightScene';
import { store } from './flight-store';


function dprFor(low: boolean) {
  // pixel budget (limo-juice Scene.tsx): ≈3.2 Mpx of drawing buffer, capped 1.75 desktop / 1.5 mobile
  const cap = low ? 1.5 : 1.75;
  const fit = Math.sqrt(3.2e6 / Math.max(1, innerWidth * innerHeight));
  return Math.max(1, Math.min(cap, devicePixelRatio || 1, fit));
}

function App({ low, compact }: { low: boolean; compact: boolean }) {
  const [dpr, setDpr] = useState(() => dprFor(low));
  useEffect(() => {
    const on = () => setDpr(dprFor(low));
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, [low]);
  return (
    <Canvas
      frameloop="demand"
      flat
      dpr={dpr}
      camera={{ fov: 32, position: [0, 0, 9], near: 0.5, far: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', stencil: false, premultipliedAlpha: true }}
      resize={{ scroll: false, debounce: 60 }}
      style={{ pointerEvents: 'none' }}
      onCreated={({ gl, invalidate }) => {
        gl.setClearColor(0x000000, 0);
        gl.toneMapping = THREE.NoToneMapping;
        store.wake = () => invalidate();
      }}
    >
      <Suspense fallback={null}>
        <FlightScene low={compact} grain={!low && !compact} />
      </Suspense>
    </Canvas>
  );
}

let root: Root | null = null;
export function mountFlight(el: HTMLElement, low: boolean, compact: boolean) {
  root?.unmount();
  root = createRoot(el);
  root.render(<App low={low} compact={compact} />);
  return () => { root?.unmount(); root = null; store.ready = false; store.wake = () => {}; };
}
