import type { Wall } from '@refloor/scene';
import type { DoorPortal } from '@refloor/engine';
import { rotate } from '@refloor/engine/math';

export function planWall(wall: Wall) {
  const dx = wall.end.x - wall.start.x,
    dz = wall.end.z - wall.start.z,
    length = Math.hypot(dx, dz),
    segments: { offset: number; length: number }[] = [];
  let cursor = 0;
  for (const opening of [...wall.openings].sort((a, b) => a.offset - b.offset)) {
    if (opening.offset > cursor) segments.push({ offset: cursor, length: opening.offset - cursor });
    cursor = Math.max(cursor, opening.offset + opening.width);
  }
  if (cursor < length) segments.push({ offset: cursor, length: length - cursor });
  return { rotation: (Math.atan2(dz, dx) * 180) / Math.PI, segments };
}

export function planDoor(door: DoorPortal) {
  const closed = {
      x: (door.centre.x - door.hinge.x) * 2,
      z: (door.centre.z - door.hinge.z) * 2,
    },
    radius = Math.hypot(closed.x, closed.z),
    open = rotate(closed, door.openingAngle),
    closedTip = { x: door.hinge.x + closed.x, z: door.hinge.z + closed.z },
    openTip = { x: door.hinge.x + open.x, z: door.hinge.z + open.z };
  return {
    radius,
    openTip,
    arc: `M ${closedTip.x} ${closedTip.z} A ${radius} ${radius} 0 0 ${door.openingAngle < 0 ? 1 : 0} ${openTip.x} ${openTip.z}`,
  };
}

export function planRoomName(name: string) {
  return name
    .replace(/^(?:ground[ -]floor|upstairs|upper[ -]floor)\s+/i, '')
    .replace(/\s+and\s+/gi, ' & ')
    .replace(/-/g, ' ');
}
