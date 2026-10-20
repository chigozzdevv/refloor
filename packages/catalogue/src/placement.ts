import { createFurniture } from '@refloor/catalogue/furniture';
import { placementProfile } from '@refloor/catalogue/placement-profile';
import type { MountingSurface } from '@refloor/catalogue/placement-profile';
import { applyCommands } from '@refloor/scene';
import type { Floor, Room, SceneCommand, SceneObject, Wall } from '@refloor/scene';
import {
  checkClearance,
  compileBuilding,
  compoundFootprint,
  validatePlacement,
} from '@refloor/engine';
import type { CompiledBuilding, NavigationPoint } from '@refloor/engine';
import { wallExteriorSide } from '@refloor/scene/wall-exterior';

export type PlacementPose = Pick<SceneObject, 'position' | 'rotation'>;
export type PlacementOptions = {
  player?: NavigationPoint | undefined;
  preferred?: PlacementPose[];
  object?: SceneObject;
  search?: boolean;
};

export function placementRoom(compiled: CompiledBuilding, roomId: string) {
  const floor = compiled.building.floors.find((value) =>
      value.rooms.some((room) => room.id === roomId),
    ),
    room = floor?.rooms.find((value) => value.id === roomId);
  if (!floor || !room) throw new Error('Choose an existing room for this item.');
  return { floor, room };
}

function wallSegment(wall: Wall, room: Room, exterior: boolean) {
  const dx = wall.end.x - wall.start.x,
    dz = wall.end.z - wall.start.z,
    length = Math.hypot(dx, dz),
    ux = dx / length,
    uz = dz / length;
  if (exterior) return { min: 0, max: length, ux, uz, length };
  const corners = [
      { x: room.footprint.x, z: room.footprint.z },
      { x: room.footprint.x + room.footprint.width, z: room.footprint.z },
      { x: room.footprint.x, z: room.footprint.z + room.footprint.depth },
      {
        x: room.footprint.x + room.footprint.width,
        z: room.footprint.z + room.footprint.depth,
      },
    ],
    projected = corners.map(
      (point) => (point.x - wall.start.x) * ux + (point.z - wall.start.z) * uz,
    );
  return {
    min: Math.max(0, Math.min(...projected)),
    max: Math.min(length, Math.max(...projected)),
    ux,
    uz,
    length,
  };
}

export function wallPlacementPoses(
  floor: Floor,
  room: Room,
  object: SceneObject,
  options: { near?: { x: number; z: number }; y?: number; wallId?: string } = {},
): PlacementPose[] {
  const exterior = object.placement === 'exterior',
    centre = exterior ? floor.footprint : room.footprint,
    poses: PlacementPose[] = [];
  for (const wall of floor.walls) {
    if (options.wallId && wall.id !== options.wallId) continue;
    if (exterior ? wallExteriorSide(floor, wall) === null : !room.wallIds.includes(wall.id))
      continue;
    const segment = wallSegment(wall, room, exterior);
    if (segment.max - segment.min < object.dimensions.width + 0.1) continue;
    let nx = -segment.uz,
      nz = segment.ux;
    const inward =
      (centre.x + centre.width / 2 - (wall.start.x + wall.end.x) / 2) * nx +
      (centre.z + centre.depth / 2 - (wall.start.z + wall.end.z) / 2) * nz;
    if (inward < 0 !== exterior) {
      nx *= -1;
      nz *= -1;
    }
    const inset = wall.thickness / 2 + object.dimensions.depth / 2 + 0.02,
      margin = object.dimensions.width / 2 + 0.08,
      min = segment.min + margin,
      max = segment.max - margin,
      near = options.near
        ? Math.max(
            min,
            Math.min(
              max,
              (options.near.x - wall.start.x) * segment.ux +
                (options.near.z - wall.start.z) * segment.uz,
            ),
          )
        : (min + max) / 2,
      offsets = [near];
    if (!options.near) for (let along = min; along <= max; along += 0.45) offsets.push(along);
    const y = options.y ?? Math.min(1.2, floor.height - object.dimensions.height - 0.08);
    if (y < 0.25 || y + object.dimensions.height > floor.height - 0.02) continue;
    for (const along of offsets) {
      const from = along - object.dimensions.width / 2,
        to = along + object.dimensions.width / 2;
      if (
        wall.openings.some(
          (opening) =>
            from < opening.offset + opening.width + 0.04 &&
            to > opening.offset - 0.04 &&
            y < (opening.kind === 'window' ? opening.sill : 0) + opening.height &&
            y + object.dimensions.height > (opening.kind === 'window' ? opening.sill : 0),
        )
      )
        continue;
      poses.push({
        position: {
          x: wall.start.x + segment.ux * along + nx * inset,
          y,
          z: wall.start.z + segment.uz * along + nz * inset,
        },
        rotation: Math.atan2(nx, nz),
      });
    }
  }
  if (options.near)
    poses.sort(
      (a, b) =>
        Math.hypot(a.position.x - options.near!.x, a.position.z - options.near!.z) -
        Math.hypot(b.position.x - options.near!.x, b.position.z - options.near!.z),
    );
  return poses;
}

function defaultPoses(compiled: CompiledBuilding, roomId: string, object: SceneObject) {
  const { floor, room } = placementRoom(compiled, roomId),
    profile = placementProfile(object.assetId);
  if (profile.mount === 'wall') return wallPlacementPoses(floor, room, object);
  const exterior = object.placement === 'exterior',
    footprint = exterior ? compoundFootprint(compiled.building) : room.footprint,
    poses: PlacementPose[] = [];
  if (exterior && floor.elevation !== Math.min(...compiled.building.floors.map((f) => f.elevation)))
    throw new Error('Outdoor items need a location on the ground floor.');
  for (const rotation of [0, Math.PI / 2]) {
    const width = rotation === 0 ? object.dimensions.width : object.dimensions.depth,
      depth = rotation === 0 ? object.dimensions.depth : object.dimensions.width,
      marginX = width / 2 + 0.15,
      marginZ = depth / 2 + 0.15;
    for (let x = footprint.x + marginX; x <= footprint.x + footprint.width - marginX; x += 0.5)
      for (let z = footprint.z + marginZ; z <= footprint.z + footprint.depth - marginZ; z += 0.5) {
        if (
          exterior &&
          x > floor.footprint.x - marginX &&
          x < floor.footprint.x + floor.footprint.width + marginX &&
          z > floor.footprint.z - marginZ &&
          z < floor.footprint.z + floor.footprint.depth + marginZ
        )
          continue;
        poses.push({
          position: {
            x,
            z,
            y: profile.mount === 'ceiling' ? floor.height - object.dimensions.height - 0.02 : 0,
          },
          rotation,
        });
      }
  }
  const cx = room.footprint.x + room.footprint.width / 2,
    cz = room.footprint.z + room.footprint.depth / 2;
  poses.sort(
    (a, b) =>
      Math.hypot(a.position.x - cx, a.position.z - cz) -
      Math.hypot(b.position.x - cx, b.position.z - cz),
  );
  return poses;
}

export function requireMount(assetId: string, mount: MountingSurface) {
  if (!placementProfile(assetId).supports.includes(mount))
    throw new Error(`This item needs ${placementProfile(assetId).mount} support.`);
}

function supportedPose(compiled: CompiledBuilding, object: SceneObject, pose: PlacementPose) {
  const profile = placementProfile(object.assetId),
    { floor, room } = placementRoom(compiled, object.roomId);
  if (profile.mount === 'wall')
    return wallPlacementPoses(floor, room, object, {
      near: pose.position,
      y: pose.position.y,
    }).some(
      (mounted) =>
        Math.hypot(mounted.position.x - pose.position.x, mounted.position.z - pose.position.z) <
          0.03 && Math.abs(Math.sin((mounted.rotation - pose.rotation) / 2)) < 0.01,
    );
  if (profile.mount === 'ceiling')
    return Math.abs(pose.position.y + object.dimensions.height - (floor.height - 0.02)) < 0.03;
  if (Math.abs(pose.position.y) < 0.02) return true;
  if (!profile.supports.includes('tabletop')) return false;
  return compiled.building.objects.some((support) => {
    if (
      support.id === object.id ||
      support.roomId !== object.roomId ||
      !placementProfile(support.assetId).supportsObjects ||
      Math.abs(pose.position.y - support.position.y - support.dimensions.height - 0.01) > 0.02
    )
      return false;
    const dx = pose.position.x - support.position.x,
      dz = pose.position.z - support.position.z,
      x = dx * Math.cos(support.rotation) - dz * Math.sin(support.rotation),
      z = dx * Math.sin(support.rotation) + dz * Math.cos(support.rotation),
      rotation = pose.rotation - support.rotation,
      width =
        Math.abs(Math.cos(rotation)) * object.dimensions.width +
        Math.abs(Math.sin(rotation)) * object.dimensions.depth,
      depth =
        Math.abs(Math.sin(rotation)) * object.dimensions.width +
        Math.abs(Math.cos(rotation)) * object.dimensions.depth;
    return (
      Math.abs(x) + width / 2 <= support.dimensions.width / 2 - 0.02 &&
      Math.abs(z) + depth / 2 <= support.dimensions.depth / 2 - 0.02
    );
  });
}

export function findCataloguePlacement(
  compiled: CompiledBuilding,
  assetId: string,
  roomId: string,
  options: PlacementOptions = {},
): SceneObject {
  const { floor } = placementRoom(compiled, roomId),
    profile = placementProfile(assetId),
    object = options.object
      ? { ...structuredClone(options.object), floorId: floor.id, roomId }
      : createFurniture(assetId, {
          id: crypto.randomUUID(),
          floorId: floor.id,
          roomId,
          position: { x: 0, y: 0, z: 0 },
          rotation: 0,
        });
  if (profile.location === 'exterior') object.placement = 'exterior';
  const poses = [
    ...(options.preferred ?? []),
    ...(options.search === false ? [] : defaultPoses(compiled, roomId, object)),
  ];
  let completeChecks = 0;
  for (const pose of poses.slice(0, 240)) {
    if (!supportedPose(compiled, object, pose)) continue;
    const candidate = { ...object, ...pose },
      command: SceneCommand = options.object
        ? {
            type: 'move-object',
            objectId: object.id,
            roomId,
            position: pose.position,
            rotation: pose.rotation,
          }
        : { type: 'add-object', object: candidate },
      edit = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        expectedRevision: compiled.building.revision,
        commands: [command],
      };
    try {
      const placed = applyCommands(compiled.building, edit),
        result = compileBuilding(placed.building, compiled.options);
      if (checkClearance(result).length) continue;
      if (++completeChecks > 12) break;
      validatePlacement(compiled.building, edit, compiled.options, options.player);
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error(
    'There is no safe placement there. Choose more space or move an item, keeping doors and walkways clear.',
  );
}
