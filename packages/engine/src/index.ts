export { compileBuilding } from '@refloor/engine/compile';
export { compoundFootprint } from '@refloor/engine/site';
export { validateBuilding } from '@refloor/engine/validation/building';
export { validatePlacement } from '@refloor/engine/validation/placement';
export { isPlayerPositionValid } from '@refloor/engine/validation/player';
export {
  buildNavigation,
  nearestNode,
  reachableNodes,
} from '@refloor/engine/navigation/connectivity';
export { findPath } from '@refloor/engine/navigation/path';
export { isWalkable } from '@refloor/engine/navigation/surfaces';
export { entrancePoints, checkReachability } from '@refloor/engine/navigation/reachability';
export { checkClearance } from '@refloor/engine/validation/clearance';
export { checkEnclosure } from '@refloor/engine/validation/enclosure';
export { defaultOptions } from '@refloor/engine/options';
export { EngineError } from '@refloor/engine/errors';
export type {
  CompiledBuilding,
  EngineOptions,
  EngineIssue,
  MeshData,
  MeshPart,
  Collider,
  BoxCollider,
  MeshCollider,
  WalkSurface,
  StairConnection,
  DoorPortal,
  ObjectInstance,
  Navigation,
  NavigationPath,
  NavigationPoint,
  Point2,
  Point3,
} from '@refloor/engine/types';
