import type { Building, Footprint, Material, SceneObject } from '@refloor/scene';

export type Point2 = { x: number; z: number };
export type Point3 = Point2 & { y: number };
export type PartRole =
  | 'slab'
  | 'wall'
  | 'door'
  | 'window'
  | 'stair-tread'
  | 'stair-landing'
  | 'stair-railing'
  | 'roof'
  | 'furniture';
export type MeshData = { positions: number[]; normals: number[]; uvs: number[]; indices: number[] };
export type ColliderBase = {
  id: string;
  entityId: string;
  floorId: string;
  role: PartRole;
  position: Point3;
  rotation: number;
};
export type BoxCollider = ColliderBase & { shape: 'box'; size: Point3 };
export type MeshCollider = ColliderBase & { shape: 'mesh'; mesh: MeshData };
export type Collider = BoxCollider | MeshCollider;
export type MeshPart = {
  id: string;
  entityId: string;
  floorId: string;
  role: PartRole;
  material: Material;
  mesh: MeshData;
  exterior?: { side: 1 | -1; material: Material };
  collider: Collider;
};
export type WalkSurface = {
  id: string;
  entityId: string;
  floorId: string;
  footprint: Footprint;
  elevation: number;
  rotation: number;
};
export type Landing = { floorId: string; position: Point3; footprint: Footprint; rotation: number };
export type StairConnection = {
  id: string;
  lower: Landing;
  upper: Landing;
  path: Point3[];
  footprint: Footprint;
  heading: number;
  rise: number;
  riserHeight: number;
  treadDepth: number;
};
export type DoorPortal = {
  id: string;
  wallId: string;
  floorId: string;
  hinge: Point3;
  centre: Point3;
  rotation: number;
  openingAngle: number;
  width: number;
  height: number;
  open: boolean;
};
export type ObjectInstance = { object: SceneObject; collider: BoxCollider };
export type CompiledBuilding = {
  building: Building;
  parts: MeshPart[];
  colliders: Collider[];
  surfaces: WalkSurface[];
  stairs: StairConnection[];
  doors: DoorPortal[];
  instances: ObjectInstance[];
  options: EngineOptions;
};
export type EngineOptions = {
  radius: number;
  height: number;
  stepHeight: number;
  minTreadDepth: number;
  headroom: number;
  clearance: number;
  resolution: number;
  maxNodes: number;
  maxParts: number;
};
export type EngineIssue = { code: string; entityId: string; message: string };
export type NavigationPoint = { floorId: string; position: Point3 };
export type NavigationEdge = { to: number; cost: number; stairId?: string; path?: Point3[] };
export type NavigationNode = NavigationPoint & { edges: NavigationEdge[] };
export type Navigation = {
  compiled: CompiledBuilding;
  nodes: NavigationNode[];
  byFloor: Map<string, number[]>;
  grids: Map<string, Map<string, number>>;
  doorPolicy: 'openable' | 'current';
};
export type NavigationPath = {
  points: Point3[];
  doorIds: string[];
  stairIds: string[];
  length: number;
};
