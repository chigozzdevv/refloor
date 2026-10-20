import type { Building, SceneCommand } from '@refloor/scene';
import { fail } from '@refloor/engine/errors';

export function checkStructuralAttachments(
  before: Building,
  after: Building,
  commands: SceneCommand[],
) {
  for (const command of commands) {
    if (command.type !== 'move-partition' || command.roomBounds) continue;
    const floor = before.floors.find((value) =>
        value.walls.some((wall) => wall.id === command.wallId),
      ),
      wall = floor?.walls.find((value) => value.id === command.wallId),
      nextWall = after.floors
        .flatMap((value) => value.walls)
        .find((value) => value.id === command.wallId);
    if (!floor || !wall || !nextWall) continue;
    const axis = wall.start.x === wall.end.x ? 'x' : 'z',
      span = axis === 'x' ? 'z' : 'x',
      from = Math.min(wall.start[span], wall.end[span]),
      to = Math.max(wall.start[span], wall.end[span]);
    if (Math.abs(wall.start[axis] - nextWall.start[axis]) < 1e-6) continue;
    for (const object of before.objects) {
      if (object.floorId !== floor.id || object.placement === 'exterior' || object.position.y < 0.5)
        continue;
      const cosine = Math.abs(Math.cos(object.rotation)),
        sine = Math.abs(Math.sin(object.rotation)),
        half =
          (axis === 'x'
            ? object.dimensions.width * cosine + object.dimensions.depth * sine
            : object.dimensions.depth * cosine + object.dimensions.width * sine) / 2,
        margin = wall.thickness / 2 + half + 0.08;
      if (
        object.position[span] < from ||
        object.position[span] > to ||
        Math.abs(object.position[axis] - wall.start[axis]) > margin
      )
        continue;
      const next = after.objects.find((value) => value.id === object.id);
      if (
        !next ||
        next.position.x !== object.position.x ||
        next.position.y !== object.position.y ||
        next.position.z !== object.position.z
      )
        continue;
      if (Math.abs(next.position[axis] - nextWall.start[axis]) > margin)
        fail(
          'WALL_ATTACHMENT',
          object.id,
          'Move this wall-mounted item with the partition in the same edit so it stays attached',
        );
    }
  }
}
