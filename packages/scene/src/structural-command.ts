import { z } from 'zod';
import type { Building } from '@refloor/scene/building';
import type { SceneCommand } from '@refloor/scene/command';
import type { Room } from '@refloor/scene/room';
import type { Floor, Wall } from '@refloor/scene/floor';
import { SceneError } from '@refloor/scene/errors';
import { footprintSchema, idSchema } from '@refloor/scene/primitives';
import { wallExteriorSide } from '@refloor/scene/wall-exterior';

const epsilon = 1e-6;
export const partitionBoundsSchema = z
  .array(z.strictObject({ roomId: idSchema, footprint: footprintSchema }))
  .length(2);

type OpeningCommand = Extract<SceneCommand, { type: 'set-opening' }>;
type PartitionCommand = Extract<SceneCommand, { type: 'move-partition' }>;

function openingHitsJunction(
  floor: Floor,
  wall: Wall,
  opening: {
    offset: number;
    width: number;
    height: number;
    sill: number | null;
  },
) {
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z),
    ux = (wall.end.x - wall.start.x) / length,
    uz = (wall.end.z - wall.start.z) / length;
  return floor.walls.some((other) => {
    if (other.id === wall.id || (opening.sill ?? 0) >= other.height) return false;
    const vx = other.end.x - other.start.x,
      vz = other.end.z - other.start.z,
      denominator = ux * vz - uz * vx;
    if (Math.abs(denominator) < epsilon) return false;
    const dx = other.start.x - wall.start.x,
      dz = other.start.z - wall.start.z,
      offset = (dx * vz - dz * vx) / denominator,
      fraction = (dx * uz - dz * ux) / denominator,
      margin = other.thickness / 2 + 0.02;
    return (
      fraction >= -epsilon &&
      fraction <= 1 + epsilon &&
      offset > opening.offset - margin &&
      offset < opening.offset + opening.width + margin
    );
  });
}

export function setOpening(building: Building, command: OpeningCommand): OpeningCommand {
  const floor = building.floors.find((value) =>
      value.walls.some((wall) => wall.id === command.wallId),
    ),
    wall = floor?.walls.find((value) => value.id === command.wallId),
    opening = wall?.openings.find((value) => value.id === command.openingId);
  if (!floor || !wall || !opening)
    throw new SceneError('NOT_FOUND', 'The opening does not exist on this wall');
  if ((opening.kind === 'door') !== (command.sill === null))
    throw new SceneError('UNSUPPORTED_ACTION', 'Only windows have a sill height');
  const inverse: OpeningCommand = {
    type: 'set-opening',
    wallId: wall.id,
    openingId: opening.id,
    offset: opening.offset,
    width: opening.width,
    height: opening.height,
    sill: opening.kind === 'window' ? opening.sill : null,
  };
  if (openingHitsJunction(floor, wall, inverse))
    throw new SceneError('UNSUPPORTED_ACTION', 'The existing opening crosses a wall junction');
  if (openingHitsJunction(floor, wall, command))
    throw new SceneError(
      'INVALID_TARGET',
      'The opening would cross an adjoining wall or partition',
    );
  opening.offset = command.offset;
  opening.width = command.width;
  opening.height = command.height;
  if (opening.kind === 'window' && command.sill !== null) opening.sill = command.sill;
  return inverse;
}

const near = (a: number, b: number) => Math.abs(a - b) <= epsilon;
const overlaps = (a: Room['footprint'], b: Room['footprint']) =>
  a.x < b.x + b.width - epsilon &&
  b.x < a.x + a.width - epsilon &&
  a.z < b.z + b.depth - epsilon &&
  b.z < a.z + a.depth - epsilon;

export function movePartition(building: Building, command: PartitionCommand): PartitionCommand {
  const floor = building.floors.find((value) =>
      value.walls.some((wall) => wall.id === command.wallId),
    ),
    wall = floor?.walls.find((value) => value.id === command.wallId);
  if (!floor || !wall) throw new SceneError('NOT_FOUND', 'The partition does not exist');
  if (wallExteriorSide(floor, wall))
    throw new SceneError('UNSUPPORTED_ACTION', 'Exterior walls cannot be moved');
  const horizontal = wall.start.z === wall.end.z,
    vertical = wall.start.x === wall.end.x;
  if (!horizontal && !vertical)
    throw new SceneError(
      'UNSUPPORTED_ACTION',
      'Partition moves require a straight axis-aligned wall',
    );
  const axis = horizontal ? 'z' : 'x',
    span = horizontal ? 'x' : 'z',
    size = horizontal ? 'depth' : 'width',
    spanSize = horizontal ? 'width' : 'depth',
    position = wall.start[axis],
    from = Math.min(wall.start[span], wall.end[span]),
    to = Math.max(wall.start[span], wall.end[span]),
    rooms = floor.rooms.filter((room) => room.wallIds.includes(wall.id)),
    before = rooms.find((room) => near(room.footprint[axis] + room.footprint[size], position)),
    after = rooms.find((room) => near(room.footprint[axis], position));
  if (
    rooms.length !== 2 ||
    !before ||
    !after ||
    before.id === after.id ||
    rooms.some(
      (room) =>
        ['corridor', 'stairwell'].includes(room.kind) ||
        !near(room.footprint[span], from) ||
        !near(room.footprint[span] + room.footprint[spanSize], to),
    )
  )
    throw new SceneError(
      'UNSUPPORTED_ACTION',
      'Move a divider shared by two rectangular rooms with the same span; circulation walls are fixed',
    );
  if (
    rooms.some((room) => floor.voids.some((hole) => overlaps(room.footprint, hole.footprint))) ||
    rooms.some((room) =>
      building.stairs.some(
        (stair) =>
          (stair.lowerFloorId === floor.id || stair.upperFloorId === floor.id) &&
          overlaps(room.footprint, stair.footprint),
      ),
    )
  )
    throw new SceneError(
      'UNSUPPORTED_ACTION',
      'Rooms containing a staircase or floor opening are fixed',
    );
  const start = before.footprint[axis],
    end = after.footprint[axis] + after.footprint[size];
  if (command.position - start < 1.5 || end - command.position < 1.5)
    throw new SceneError(
      'INVALID_TARGET',
      'Both rooms must retain at least 1.5 metres of depth or width',
    );
  for (const boundary of [from, to]) {
    const enclosing = floor.walls.find(
      (value) =>
        value.id !== wall.id &&
        before.wallIds.includes(value.id) &&
        after.wallIds.includes(value.id) &&
        near(value.start[span], boundary) &&
        near(value.end[span], boundary) &&
        Math.min(value.start[axis], value.end[axis]) <= start + epsilon &&
        Math.max(value.start[axis], value.end[axis]) >= end - epsilon,
    );
    if (!enclosing)
      throw new SceneError(
        'UNSUPPORTED_ACTION',
        'Partition endpoints must slide along continuous enclosing walls; segmented joins are unsupported',
      );
    const direction = Math.sign(enclosing.end[axis] - enclosing.start[axis]),
      offset = (command.position - enclosing.start[axis]) * direction,
      originalOffset = (position - enclosing.start[axis]) * direction,
      margin = wall.thickness / 2 + 0.02;
    if (
      enclosing.openings.some(
        (opening) =>
          originalOffset > opening.offset - margin &&
          originalOffset < opening.offset + opening.width + margin,
      )
    )
      throw new SceneError('UNSUPPORTED_ACTION', 'The existing partition meets a door or window');
    if (
      enclosing.openings.some(
        (opening) =>
          offset > opening.offset - margin && offset < opening.offset + opening.width + margin,
      )
    )
      throw new SceneError(
        'INVALID_TARGET',
        'The moved partition would intersect a door or window',
      );
  }
  const inverse: PartitionCommand = {
    type: 'move-partition',
    wallId: wall.id,
    position,
    roomBounds: rooms.map((room) => ({
      roomId: room.id,
      footprint: structuredClone(room.footprint),
    })),
  };
  const next = new Map(
    [
      { roomId: before.id, footprint: { ...before.footprint, [size]: command.position - start } },
      {
        roomId: after.id,
        footprint: { ...after.footprint, [axis]: command.position, [size]: end - command.position },
      },
    ].map((value) => [value.roomId, value.footprint]),
  );
  // Inverse bounds preserve exact coordinates across serialized undo and redo.
  if (command.roomBounds) {
    const ids = new Set(command.roomBounds.map((value) => value.roomId));
    if (ids.size !== 2 || [...ids].some((id) => !next.has(id)))
      throw new SceneError('INVALID_TARGET', 'Restored room bounds do not match this partition');
    for (const bounds of command.roomBounds) {
      const expected = next.get(bounds.roomId)!;
      if (
        (['x', 'z', 'width', 'depth'] as const).some(
          (key) => !near(bounds.footprint[key], expected[key]),
        )
      )
        throw new SceneError(
          'INVALID_TARGET',
          'Restored room bounds must match the partition move',
        );
      next.set(bounds.roomId, structuredClone(bounds.footprint));
    }
  }
  for (const room of rooms) room.footprint = next.get(room.id)!;
  wall.start[axis] = command.position;
  wall.end[axis] = command.position;
  return inverse;
}
