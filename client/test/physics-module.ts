import RAPIER from '@dimforge/rapier3d-compat';

// Node tests use the same Rapier version with its embedded WebAssembly loader.
await RAPIER.init();
export default RAPIER;
