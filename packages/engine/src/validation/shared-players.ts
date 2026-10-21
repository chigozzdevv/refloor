import type { CompiledBuilding, NavigationPoint } from '@refloor/engine/types';
import { distanceToBox, rotate } from '@refloor/engine/math';
import { isPlayerPositionValid } from '@refloor/engine/validation/player';

export function canSwingAroundPlayers(
  compiled: CompiledBuilding,
  id: string,
  open: boolean,
  players: NavigationPoint[],
) {
  const portal = compiled.doors.find((door) => door.id === id),
    source = compiled.colliders.find((collider) => collider.id === `${id}:leaf`);
  if (!portal || !source || source.shape !== 'box') return true;
  const local = rotate(
    { x: source.position.x - portal.hinge.x, z: source.position.z - portal.hinge.z },
    -source.rotation,
  );
  for (let step = 0; step <= 40; step++) {
    const fraction = Number(portal.open) + ((Number(open) - Number(portal.open)) * step) / 40;
    const angle = portal.rotation + portal.openingAngle * fraction,
      offset = rotate({ x: local.x, z: 0 }, angle);
    const pose = {
      ...source,
      rotation: angle,
      position: {
        x: portal.hinge.x + offset.x,
        y: source.position.y,
        z: portal.hinge.z + offset.z,
      },
    };
    if (
      players.some(
        ({ position }) =>
          pose.position.y + pose.size.y / 2 > position.y + 0.1 &&
          pose.position.y - pose.size.y / 2 < position.y + compiled.options.height &&
          distanceToBox(position, pose) <
            compiled.options.radius + compiled.options.clearance + 0.005,
      )
    )
      return false;
  }
  return true;
}
export function sharedPlayersClear(
  before: CompiledBuilding,
  after: CompiledBuilding,
  players: NavigationPoint[],
) {
  return (
    players.every((player) => isPlayerPositionValid(after, player)) &&
    after.doors.every(
      (door) =>
        before.doors.find((value) => value.id === door.id)?.open === door.open ||
        canSwingAroundPlayers(before, door.id, door.open, players),
    )
  );
}
