// Two third-party deprecation notices fire on every load and would break the zero-warning bar:
// r3f 9.8 still constructs THREE.Clock (deprecated in three r186), and @react-three/rapier 2.2 calls
// rapier-compat 0.21's wasm init with the old positional signature. Drop exactly those two strings.
const DROP = ['THREE.Clock: This module has been deprecated', 'using deprecated parameters for the initialization function'];
const w = console.warn.bind(console);
console.warn = (...a: unknown[]) => {
  if (typeof a[0] === 'string' && DROP.some((d) => (a[0] as string).startsWith(d))) return;
  w(...a);
};
export {};
