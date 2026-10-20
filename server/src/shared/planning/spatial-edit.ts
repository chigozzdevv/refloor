import { z } from 'zod';
import {
  assetFromCatalogue,
  findCataloguePlacement,
  placementProfile,
  placementRoom,
  requireMount,
  wallPlacementPoses,
} from '@refloor/catalogue';
import type { PlacementPose } from '@refloor/catalogue';
import { compileBuilding } from '@refloor/engine';
import type { Building, SceneCommand, SceneObject } from '@refloor/scene';
import type { LanguageEditRequest } from '@refloor/scene/chat';

export const spatialPlacementSchema = z.strictObject({
  relation: z.enum([
    'near',
    'left',
    'right',
    'front',
    'behind',
    'above',
    'on',
    'facing',
    'wall',
    'floor',
    'ceiling',
  ]),
  referenceId: z.string().nullable(),
  facingId: z.string().nullable(),
  gap: z.number().finite().min(0).max(3).nullable(),
});
type SpatialPlacement = z.infer<typeof spatialPlacementSchema>;
type SpatialAction = {
  action: 'add' | 'place';
  targetId: string;
  value: string | null;
  amount: number | null;
  placement?: SpatialPlacement | null | undefined;
};
type SpatialReference = Pick<
  SceneObject,
  'id' | 'floorId' | 'roomId' | 'position' | 'rotation' | 'dimensions' | 'placement'
> & { assetId?: string };

function facing(position: { x: number; z: number }, reference: Pick<SpatialReference, 'position'>) {
  if (Math.hypot(reference.position.x - position.x, reference.position.z - position.z) < 0.01)
    throw new Error('These items need different positions to face each other.');
  return Math.atan2(reference.position.x - position.x, reference.position.z - position.z);
}

function projectedRadius(
  object: Pick<SpatialReference, 'dimensions'>,
  rotation: number,
  x: number,
  z: number,
) {
  const right = { x: Math.cos(rotation), z: -Math.sin(rotation) },
    front = { x: Math.sin(rotation), z: Math.cos(rotation) };
  return (
    (Math.abs(x * right.x + z * right.z) * object.dimensions.width) / 2 +
    (Math.abs(x * front.x + z * front.z) * object.dimensions.depth) / 2
  );
}

function doorReference(
  building: Building,
  roomId: string,
  id: string | null,
  location: SceneObject['placement'],
): SpatialReference | undefined {
  for (const floor of building.floors) {
    const room = floor.rooms.find((room) => room.id === roomId);
    if (!room) continue;
    for (const wall of floor.walls) {
      const door = wall.openings.find((opening) => opening.kind === 'door' && opening.id === id);
      if (!door || !room.wallIds.includes(wall.id)) continue;
      const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z),
        x = wall.start.x + ((wall.end.x - wall.start.x) / length) * (door.offset + door.width / 2),
        z = wall.start.z + ((wall.end.z - wall.start.z) / length) * (door.offset + door.width / 2);
      if (
        x < room.footprint.x - 0.01 ||
        x > room.footprint.x + room.footprint.width + 0.01 ||
        z < room.footprint.z - 0.01 ||
        z > room.footprint.z + room.footprint.depth + 0.01
      )
        continue;
      let nx = -(wall.end.z - wall.start.z) / length,
        nz = (wall.end.x - wall.start.x) / length;
      const inward =
        (room.footprint.x + room.footprint.width / 2 - x) * nx +
        (room.footprint.z + room.footprint.depth / 2 - z) * nz;
      if (inward < 0 !== (location === 'exterior')) {
        nx *= -1;
        nz *= -1;
      }
      return {
        id: door.id,
        floorId: floor.id,
        roomId,
        position: { x, y: 0, z },
        rotation: Math.atan2(nx, nz),
        dimensions: { width: door.width, height: door.height, depth: wall.thickness },
        ...(location ? { placement: location } : {}),
      };
    }
  }
}

function relationPoses(
  building: Building,
  object: SceneObject,
  roomId: string,
  placement: SpatialPlacement,
): PlacementPose[] {
  const compiled = compileBuilding(building),
    { floor, room } = placementRoom(compiled, roomId),
    profile = placementProfile(object.assetId),
    reference: SpatialReference | undefined =
      building.objects.find((item) => item.id === placement.referenceId) ??
      doorReference(building, roomId, placement.referenceId, object.placement),
    face = building.objects.find((item) => item.id === placement.facingId);
  if (placement.facingId && !face) throw new Error('Choose an existing item to face.');
  if (reference?.id === object.id || face?.id === object.id)
    throw new Error('Choose a different item as the reference.');
  for (const item of [reference, face])
    if (item && (item.floorId !== floor.id || item.roomId !== roomId))
      throw new Error('Choose a reference in the same room.');
  if (placement.relation === 'facing') {
    if (!reference) throw new Error('Choose the item this furniture should face.');
    if (profile.mount !== 'floor')
      throw new Error('Wall and ceiling fixtures keep their mounting direction.');
    return [{ position: object.position, rotation: facing(object.position, reference) }];
  }
  if (placement.relation === 'wall') {
    requireMount(object.assetId, 'wall');
    if (placement.referenceId && !floor.walls.some((wall) => wall.id === placement.referenceId))
      throw new Error('Choose an existing wall in this room.');
    return wallPlacementPoses(floor, room, object, {
      ...(placement.referenceId ? { wallId: placement.referenceId } : {}),
      ...(object.position.y > 0.25 ? { y: object.position.y } : {}),
    });
  }
  if (placement.relation === 'floor' || placement.relation === 'ceiling') {
    requireMount(object.assetId, placement.relation);
    if (reference) throw new Error('Use near or above to position this item relative to another.');
    return [];
  }
  if (!reference) throw new Error('Choose an existing item to position this beside.');
  if ((reference.placement ?? 'interior') !== (object.placement ?? 'interior'))
    throw new Error('Indoor and outdoor items need references in their own area.');
  const gap = placement.gap ?? (placement.relation === 'above' ? 0.18 : 0.4);
  if (placement.relation === 'on') {
    requireMount(object.assetId, 'tabletop');
    if (!reference.assetId || !placementProfile(reference.assetId).supportsObjects)
      throw new Error('Choose a table, sideboard or another supported surface.');
    if (
      object.dimensions.width > reference.dimensions.width - 0.04 ||
      object.dimensions.depth > reference.dimensions.depth - 0.04
    )
      throw new Error('This item is too large for that surface.');
    return [
      {
        position: {
          x: reference.position.x,
          y: reference.position.y + reference.dimensions.height + 0.01,
          z: reference.position.z,
        },
        rotation: reference.rotation,
      },
    ];
  }
  if (profile.mount === 'wall') {
    if (!['above', 'near', 'left', 'right'].includes(placement.relation))
      throw new Error('Place this wall fixture above or beside an existing item.');
    const offset =
        placement.relation === 'left' || placement.relation === 'right'
          ? ((reference.dimensions.width + object.dimensions.width) / 2 + gap) *
            (placement.relation === 'left' ? -1 : 1)
          : 0,
      anchor = {
        x: reference.position.x + Math.cos(reference.rotation) * offset,
        z: reference.position.z - Math.sin(reference.rotation) * offset,
      },
      y =
        placement.relation === 'above'
          ? reference.position.y + reference.dimensions.height + gap
          : object.position.y > 0.25
            ? object.position.y
            : 1.2;
    return wallPlacementPoses(floor, room, object, { near: anchor, y }).filter(
      (pose) => Math.hypot(pose.position.x - anchor.x, pose.position.z - anchor.z) <= 0.65,
    );
  }
  if (profile.mount === 'ceiling') {
    return [
      {
        position: {
          x: reference.position.x,
          y: floor.height - object.dimensions.height - 0.02,
          z: reference.position.z,
        },
        rotation: object.rotation,
      },
    ];
  }
  if (placement.relation === 'above')
    throw new Error('This item needs floor or tabletop support; it cannot float above another.');
  requireMount(object.assetId, 'floor');
  const directions =
    placement.relation === 'near'
      ? [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [-1, 1],
          [1, -1],
          [-1, -1],
        ]
      : placement.relation === 'left'
        ? [[-1, 0]]
        : placement.relation === 'right'
          ? [[1, 0]]
          : placement.relation === 'front'
            ? [[0, 1]]
            : [[0, -1]];
  return directions.map(([right = 0, front = 0]) => {
    const length = Math.hypot(right, front),
      x = (right * Math.cos(reference.rotation) + front * Math.sin(reference.rotation)) / length,
      z = (-right * Math.sin(reference.rotation) + front * Math.cos(reference.rotation)) / length;
    let rotation =
      object.kind === 'chair' || object.kind === 'sofa' ? Math.atan2(-x, -z) : reference.rotation;
    let position = object.position;
    for (let step = 0; step < 2; step++) {
      const distance =
        projectedRadius(reference, reference.rotation, x, z) +
        projectedRadius(object, rotation, x, z) +
        gap;
      position = {
        x: reference.position.x + x * distance,
        y: 0,
        z: reference.position.z + z * distance,
      };
      if (face) rotation = facing(position, face);
    }
    return { position, rotation };
  });
}

export function spatialCommands(
  input: LanguageEditRequest,
  building: Building,
  action: SpatialAction,
): SceneCommand[] {
  const adding = action.action === 'add',
    existing = building.objects.find((object) => object.id === action.targetId);
  if (!adding && !existing) throw new Error('Choose an existing item to arrange.');
  if (adding && !action.value) throw new Error('Choose an item from the furniture catalogue.');
  const roomId = adding ? action.targetId : existing!.roomId,
    compiled = compileBuilding(building),
    { floor } = placementRoom(compiled, roomId),
    assetId = adding ? action.value! : existing!.assetId,
    template: SceneObject = existing ?? {
      ...assetFromCatalogue(assetId),
      id: crypto.randomUUID(),
      floorId: floor.id,
      roomId,
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      ...(placementProfile(assetId).location === 'exterior' ? { placement: 'exterior' } : {}),
    };
  if (adding && action.placement?.relation === 'facing')
    throw new Error('Choose where to add this item and use facingId for its viewing direction.');
  if (!adding && !action.placement) throw new Error('Choose where this item should be placed.');
  if (adding && action.placement?.facingId && !action.placement.referenceId)
    throw new Error('Choose an item to place this beside as well as its facing direction.');
  const poses = action.placement ? relationPoses(building, template, roomId, action.placement) : [];
  if (
    action.placement &&
    !['floor', 'ceiling'].includes(action.placement.relation) &&
    !poses.length
  )
    throw new Error('There is no supported placement there. Choose another wall or reference.');
  const placed = findCataloguePlacement(compiled, assetId, roomId, {
    ...(existing ? { object: existing } : {}),
    preferred: poses,
    search: !action.placement || ['floor', 'ceiling'].includes(action.placement.relation),
    player: input.player ?? undefined,
  });
  return [
    adding
      ? { type: 'add-object', object: placed }
      : {
          type: 'move-object',
          objectId: placed.id,
          roomId: placed.roomId,
          position: placed.position,
          rotation: placed.rotation,
        },
  ];
}
