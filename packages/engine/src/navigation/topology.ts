import type { CompiledBuilding, Navigation } from '@refloor/engine/types';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}

export function topologyKey(compiled: CompiledBuilding): string {
  return JSON.stringify(
    canonical({
      options: compiled.options,
      floors: compiled.building.floors.map((floor) => ({
        id: floor.id,
        footprint: floor.footprint,
        elevation: floor.elevation,
        height: floor.height,
        voids: floor.voids,
      })),
      colliders: compiled.colliders.filter((collider) => collider.role !== 'door'),
      surfaces: compiled.surfaces,
      stairs: compiled.stairs,
      doors: compiled.doors.map((door) => ({
        id: door.id,
        wallId: door.wallId,
        floorId: door.floorId,
        hinge: door.hinge,
        centre: door.centre,
        rotation: door.rotation,
        openingAngle: door.openingAngle,
        width: door.width,
        height: door.height,
      })),
    }),
  );
}

type Topology = Pick<Navigation, 'nodes' | 'byFloor' | 'grids'>;

export function snapshotTopology(navigation: Navigation): Topology {
  for (const node of navigation.nodes) {
    node.position = Object.freeze({ ...node.position });
    for (const edge of node.edges) {
      if (edge.path) {
        edge.path = edge.path.map((point) => Object.freeze({ ...point }));
        Object.freeze(edge.path);
      }
      Object.freeze(edge);
    }
    Object.freeze(node.edges);
    Object.freeze(node);
  }
  Object.freeze(navigation.nodes);
  for (const indices of navigation.byFloor.values()) Object.freeze(indices);
  return {
    nodes: navigation.nodes,
    byFloor: new Map(navigation.byFloor),
    grids: new Map([...navigation.grids].map(([id, grid]) => [id, new Map(grid)])),
  };
}

export function restoreTopology(topology: Topology, compiled: CompiledBuilding): Navigation {
  return {
    compiled,
    doorPolicy: 'openable',
    nodes: topology.nodes,
    byFloor: new Map(topology.byFloor),
    grids: new Map([...topology.grids].map(([id, grid]) => [id, new Map(grid)])),
  };
}
