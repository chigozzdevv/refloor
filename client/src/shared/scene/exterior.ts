import type { CompiledBuilding, Point3 } from '@refloor/engine';
import { compoundFootprint } from '@refloor/engine';
import type { Floor, Wall } from '@refloor/scene';
import { entryPose } from '@/shared/navigation/entry';
import { Vector3 } from 'three';

export function exteriorNormal(wall: Wall, floor: Floor) {
  const { x, z, width, depth } = floor.footprint;
  if (Math.abs(wall.start.z - wall.end.z) < 0.001) {
    if (Math.abs(wall.start.z - z) < 0.001) return { x: 0, z: -1 };
    if (Math.abs(wall.start.z - z - depth) < 0.001) return { x: 0, z: 1 };
  } else if (Math.abs(wall.start.x - wall.end.x) < 0.001) {
    if (Math.abs(wall.start.x - x) < 0.001) return { x: -1, z: 0 };
    if (Math.abs(wall.start.x - x - width) < 0.001) return { x: 1, z: 0 };
  }
  return null;
}

export function exteriorPlinth(floor: Floor) {
  return floor.walls.flatMap((wall) => {
    if (!exteriorNormal(wall, floor)) return [];
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z),
      dx = (wall.end.x - wall.start.x) / length,
      dz = (wall.end.z - wall.start.z) / length,
      doors = wall.openings.filter((opening) => opening.kind === 'door'),
      cuts = [0, length, ...doors.flatMap((door) => [door.offset, door.offset + door.width])].sort(
        (a, b) => a - b,
      );
    return cuts.slice(1).flatMap((end, index) => {
      const start = cuts[index]!,
        centre = (start + end) / 2;
      if (
        end - start < 0.001 ||
        doors.some((door) => centre > door.offset && centre < door.offset + door.width)
      )
        return [];
      return [
        {
          id: `${wall.id}:plinth:${index}`,
          wallId: wall.id,
          start,
          end,
          position: {
            x: wall.start.x + dx * centre,
            y: floor.elevation - 0.071,
            z: wall.start.z + dz * centre,
          },
          width: end - start,
          height: 0.13,
          depth: Math.max(0.16, wall.thickness + 0.025),
          rotation: Math.atan2(-dz, dx),
        },
      ];
    });
  });
}

export function exteriorLayout(compiled: CompiledBuilding) {
  const floors = compiled.building.floors;
  const ground = floors.reduce((a, b) => (a.elevation < b.elevation ? a : b));
  const top = floors.reduce((a, b) => (a.elevation > b.elevation ? a : b));
  const minX = Math.min(...floors.map((floor) => floor.footprint.x));
  const minZ = Math.min(...floors.map((floor) => floor.footprint.z));
  const maxX = Math.max(...floors.map((floor) => floor.footprint.x + floor.footprint.width));
  const maxZ = Math.max(...floors.map((floor) => floor.footprint.z + floor.footprint.depth));
  const centre = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  const entry = entryPose(compiled),
    door = compiled.doors.find((value) => value.id === entry.doorId)!;
  const outward = { x: -entry.normal.x, z: -entry.normal.z };
  const tangent = { x: entry.normal.z, z: -entry.normal.x };
  const entrancePoint = (side: number, distance: number, y: number): Point3 => ({
    x: door.centre.x + tangent.x * side + outward.x * distance,
    y: ground.elevation + y,
    z: door.centre.z + tangent.z * side + outward.z * distance,
  });
  const eaves = top.elevation + top.height;
  const height =
    eaves +
    (compiled.building.roof.kind === 'gable'
      ? (Math.tan(compiled.building.roof.pitch) *
          (top.footprint.width + compiled.building.roof.overhang * 2)) /
        2
      : top.slabThickness + 0.28);
  const thresholds = ground.walls.flatMap((wall) => {
    const normal = exteriorNormal(wall, ground);
    if (!normal) return [];
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z),
      dx = (wall.end.x - wall.start.x) / length,
      dz = (wall.end.z - wall.start.z) / length,
      depth = wall.thickness / 2 + 0.12;
    return wall.openings.flatMap((opening) => {
      if (opening.kind !== 'door') return [];
      const centre = opening.offset + opening.width / 2;
      return [
        {
          id: `${opening.id}:threshold`,
          position: {
            x: wall.start.x + dx * centre + normal.x * (depth / 2 + 0.002),
            y: ground.elevation - 0.0515,
            z: wall.start.z + dz * centre + normal.z * (depth / 2 + 0.002),
          },
          width: Math.max(0.1, opening.width - 0.06),
          depth,
          height: 0.087,
          rotation: Math.atan2(-dz, dx),
        },
      ];
    });
  });
  return {
    ground,
    top,
    centre,
    width: maxX - minX,
    depth: maxZ - minZ,
    eaves,
    height,
    outward,
    tangent,
    door,
    entrancePoint,
    plinth: floors.flatMap(exteriorPlinth),
    rotation: Math.atan2(outward.x, outward.z),
    compound: compoundFootprint(compiled.building),
    paving: [
      {
        id: 'foundation-paving',
        position: { ...centre, y: ground.elevation - 0.145 },
        width: maxX - minX + 1.6,
        depth: maxZ - minZ + 1.6,
        height: 0.1,
        rotation: 0,
      },
      ...thresholds,
    ],
  };
}

export function compoundTiles(site: ReturnType<typeof exteriorLayout>) {
  const pad = site.paving[0]!,
    points: { x: number; z: number; shade: number }[] = [];
  for (let row = 0; row < Math.floor(site.compound.depth / 0.22); row++)
    for (let column = 0; column < Math.floor(site.compound.width / 0.44) - 1; column++) {
      const x = site.compound.x + 0.44 + column * 0.44 + (row % 2) * 0.22,
        z = site.compound.z + 0.22 + row * 0.22;
      if (
        Math.abs(x - pad.position.x) < pad.width / 2 + 0.22 &&
        Math.abs(z - pad.position.z) < pad.depth / 2 + 0.11
      )
        continue;
      points.push({ x, z, shade: Math.sin(row * 19.7 + column * 37.3) * 0.025 });
    }
  return points;
}

export function exteriorCamera(compiled: CompiledBuilding, aspect = 1.6) {
  const site = exteriorLayout(compiled),
    span = Math.max(site.width, site.depth, site.height * 1.2);
  const target = {
    x: site.centre.x + site.outward.x * 0.7,
    y: site.ground.elevation + site.height * 0.43,
    z: site.centre.z + site.outward.z * 0.7,
  };
  const direction = {
    x: site.outward.x * 1.05 + site.tangent.x * 0.85,
    y: 0.72,
    z: site.outward.z * 1.05 + site.tangent.z * 0.85,
  };
  const length = Math.hypot(direction.x, direction.y, direction.z);
  const halfFov = Math.min(Math.PI / 8, Math.atan(Math.tan(Math.PI / 8) * aspect));
  const radius = Math.hypot(site.compound.width, site.height, site.compound.depth) / 2;
  const distance = (radius / Math.sin(halfFov)) * 1.08;
  return {
    target,
    position: {
      x: target.x + (direction.x / length) * distance,
      y: target.y + (direction.y / length) * distance,
      z: target.z + (direction.z / length) * distance,
    },
    span,
    distance,
  };
}

export function housePreviewCamera(compiled: CompiledBuilding, aspect: number) {
  const site = exteriorLayout(compiled),
    view = exteriorCamera(compiled, aspect),
    target = new Vector3(view.target.x, (site.ground.elevation + site.height) / 2, view.target.z),
    direction = new Vector3(view.position.x, view.position.y, view.position.z)
      .sub(new Vector3(view.target.x, view.target.y, view.target.z))
      .normalize(),
    right = new Vector3(0, 1, 0).cross(direction).normalize(),
    up = direction.clone().cross(right),
    tangent = Math.tan(Math.PI / 8);
  let distance = 0;
  for (const x of [-1, 1])
    for (const y of [site.ground.elevation - 0.2, site.height])
      for (const z of [-1, 1]) {
        const corner = new Vector3(
          site.centre.x + x * (site.width / 2 + 0.8),
          y,
          site.centre.z + z * (site.depth / 2 + 0.8),
        ).sub(target);
        distance = Math.max(
          distance,
          corner.dot(direction) +
            Math.max(
              Math.abs(corner.dot(right)) / (tangent * aspect),
              Math.abs(corner.dot(up)) / tangent,
            ),
        );
      }
  const position = direction.multiplyScalar(distance * 1.12).add(target);
  return { target, position };
}
