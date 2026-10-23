// The flight canvas content: one camera, one monochrome light rig that flips to rim on black bands,
// the drone, and the page grain. Lights are lerped by store.dark every frame (no React state).
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import Drone from './Drone';
import Grain from './Grain';
import { store } from './flight-store';

function Rig() {
  const { gl, scene } = useThree();
  const key = useRef<THREE.DirectionalLight>(null!);
  const rim = useRef<THREE.DirectionalLight>(null!);
  const fill = useRef<THREE.HemisphereLight>(null!);
  const darkLerp = useRef(0);
  useEffect(() => {
    // a neutral studio environment for the plastic's sheen, built once on the GPU (no HDR download)
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
    return () => { env.dispose(); scene.environment = null; };
  }, [gl, scene]);
  useFrame((_, dt) => {
    const d = (darkLerp.current = THREE.MathUtils.damp(darkLerp.current, store.dark, 4, Math.min(dt, 0.05)));
    key.current.intensity = 2.4 * (1 - d) + 0.7 * d;
    rim.current.intensity = 0.8 * (1 - d) + 3.6 * d;
    fill.current.intensity = 1.1 * (1 - d) + 0.55 * d;
    scene.environmentIntensity = 0.55 * (1 - d) + 0.35 * d;
  });
  return (
    <>
      <hemisphereLight ref={fill} args={[0xffffff, 0x8a8a8a, 1.1]} />
      <directionalLight ref={key} position={[-4, 6, 7]} intensity={2.4} />
      <directionalLight ref={rim} position={[5, 3, -6]} intensity={0.8} />
    </>
  );
}

export default function FlightScene({ low, grain }: { low: boolean; grain: boolean }) {
  return (
    <>
      <Rig />
      <Drone low={low} />
      {grain && <Grain />}
    </>
  );
}
