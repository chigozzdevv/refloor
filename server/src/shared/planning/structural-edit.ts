import { z } from 'zod';
import type { Building, SceneCommand, Wall } from '@refloor/scene';
import { movePartition } from '@refloor/scene/structural-command';

type MovementVector = { x: number; y: number; z: number };
export const openingEditSchema = z.strictObject({
  id: z.string(),
  offset: z.number().finite().nonnegative().nullable(),
  width: z.number().finite().positive().nullable(),
  height: z.number().finite().positive().nullable(),
  sill: z.number().finite().nonnegative().nullable(),
});
type Movement = {
  vector: MovementVector | null;
  relative: boolean | null;
  space: 'world' | 'view' | null;
};
export function partitionCapability(building: Building, wall: Wall) {
  const axis = Math.abs(wall.start.x - wall.end.x) < 1e-6 ? 'x' : 'z';
  try {
    movePartition(structuredClone(building), {
      type: 'move-partition',
      wallId: wall.id,
      position: wall.start[axis],
    });
    return { axis, position: wall.start[axis] };
  } catch {
    return null;
  }
}
export function movementDelta(
  view: { x: number; z: number },
  vector: MovementVector,
  space: Movement['space'],
) {
  if (space !== 'view') return vector;
  const length = Math.hypot(view.x, view.z);
  if (length < 0.5 || length > 1.5) throw new Error('The viewing direction changed. Try again.');
  const x = view.x / length,
    z = view.z / length;
  return { x: -z * vector.x + x * vector.z, y: vector.y, z: x * vector.x + z * vector.z };
}

export function partitionMoveCommand(
  wall: Wall,
  view: { x: number; z: number },
  action: Movement,
): SceneCommand {
  if (!action.vector) throw new Error('Choose how far to move this partition.');
  const vertical = Math.abs(wall.start.x - wall.end.x) < 1e-6,
    horizontal = Math.abs(wall.start.z - wall.end.z) < 1e-6;
  if (!vertical && !horizontal) throw new Error('Only straight axis-aligned partitions can move.');
  const delta = movementDelta(view, action.vector, action.space),
    axis = vertical ? 'x' : 'z',
    parallel = vertical ? 'z' : 'x';
  if (Math.abs(delta.y) > 1e-6 || (action.relative !== false && Math.abs(delta[parallel]) > 1e-6))
    throw new Error(
      'A partition slides perpendicular to itself; lifting or changing its span is unsupported.',
    );
  return {
    type: 'move-partition',
    wallId: wall.id,
    position: action.relative === false ? action.vector[axis] : wall.start[axis] + delta[axis],
  };
}

export function openingCommand(
  building: Building,
  targetId: string,
  view: { x: number; z: number },
  action: Movement & { opening?: z.infer<typeof openingEditSchema> | null | undefined },
): SceneCommand {
  if (!action.opening) throw new Error('Choose the door or window to adjust.');
  const wall = building.floors
      .flatMap((floor) => floor.walls)
      .find(
        (wall) =>
          (wall.id === targetId || wall.openings.some((opening) => opening.id === targetId)) &&
          wall.openings.some((opening) => opening.id === action.opening!.id),
      ),
    opening = wall?.openings.find((opening) => opening.id === action.opening!.id);
  if (!wall || !opening) throw new Error('Choose an existing opening on the selected wall.');
  if (targetId !== wall.id && targetId !== opening.id)
    throw new Error('This chat can only adjust the selected opening.');
  if (opening.kind === 'door' && action.opening.sill !== null)
    throw new Error('Only windows have a sill height.');
  if (action.vector && action.opening.offset !== null)
    throw new Error('Choose an opening offset or a movement, rather than both.');
  let offset = action.opening.offset ?? opening.offset;
  const width = action.opening.width ?? opening.width;
  if (action.vector) {
    const delta = movementDelta(view, action.vector, action.space),
      length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z),
      ux = (wall.end.x - wall.start.x) / length,
      uz = (wall.end.z - wall.start.z) / length;
    if (Math.abs(delta.y) > 1e-6)
      throw new Error('Use a window sill height to raise a window; doors remain on the floor.');
    if (action.relative !== false) {
      if (Math.abs(delta.x * -uz + delta.z * ux) > 1e-6)
        throw new Error('An opening moves along its supporting wall.');
      offset += delta.x * ux + delta.z * uz;
    } else
      offset =
        (action.vector.x - wall.start.x) * ux + (action.vector.z - wall.start.z) * uz - width / 2;
  }
  return {
    type: 'set-opening',
    wallId: wall.id,
    openingId: opening.id,
    offset,
    width,
    height: action.opening.height ?? opening.height,
    sill: opening.kind === 'window' ? (action.opening.sill ?? opening.sill) : null,
  };
}
