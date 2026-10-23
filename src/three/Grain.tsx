// Monochrome film grain over the whole page: one fullscreen quad, drawn last, no depth test.
// Hash noise re-seeded at 12 fps (only when the canvas renders: at rest the grain holds still).
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { store } from './flight-store';

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const frag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uSeed;
uniform float uAlpha;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32 + uSeed); return fract(p.x * p.y); }
void main() {
  float n = hash(floor(vUv * uRes) + uSeed);
  // luminance ±1 around mid-grey: darkens white bands, lifts black ones
  gl_FragColor = vec4(vec3(n), uAlpha);
}`;

export default function Grain() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false,
    uniforms: { uRes: { value: new THREE.Vector2(1, 1) }, uSeed: { value: 0 }, uAlpha: { value: 0.035 } },
  }), []);
  useFrame((state) => {
    const { width, height } = state.size;
    const dpr = state.viewport.dpr;
    mat.uniforms.uRes.value.set(width * dpr, height * dpr);
    mat.uniforms.uSeed.value = Math.floor(state.clock.elapsedTime * 12) % 97;
    mat.uniforms.uAlpha.value = 0.028 + 0.02 * store.dark;
  });
  return (
    <mesh frustumCulled={false} renderOrder={999} material={mat}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
