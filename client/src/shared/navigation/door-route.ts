import { applyCommands } from '@refloor/scene';
import type { SceneCommand } from '@refloor/scene';
import { compileBuilding, isPlayerPositionValid, isWalkable } from '@refloor/engine';
import type { CompiledBuilding, NavigationPoint, NavigationPath } from '@refloor/engine';
import { doorCrossings } from '@refloor/engine/navigation/doors';
import { clearSegment } from '@refloor/engine/navigation/surfaces';
import { distanceToBox, rotate } from '@refloor/engine/math';
import { destinationRoute, navigationFor } from '@/shared/navigation/destinations';
import { compoundDoorApproach } from '@/shared/navigation/compound-route';

export type DoorRoute = {
  path: NavigationPath;
  commands: SceneCommand[];
  staging: boolean;
  facing?: { x: number; y: number; z: number };
};

export function doorRoute(
  compiled: CompiledBuilding,
  from: NavigationPoint,
  target: NavigationPoint,
  options: { doorId?: string; canSwing?: (id: string, open: boolean) => boolean } = {},
): DoorRoute | null {
  const portal = compiled.doors.find((door) => door.id === options.doorId);
  const selected = portal && !portal.open ? portal : undefined;
  const validPlayer = isPlayerPositionValid(compiled, from);
  if (
    portal &&
    from.floorId === portal.floorId &&
    from.floorId === target.floorId &&
    Math.hypot(from.position.x - portal.centre.x, from.position.z - portal.centre.z) < 2.5 &&
    (portal.open || (validPlayer && options.canSwing?.(portal.id, true)))
  ) {
    const start = { ...from.position, y: portal.centre.y };
    if (
      clearSegment(
        compiled,
        from.floorId,
        start,
        target.position,
        portal.open ? 'current' : 'openable',
      )
    )
      return {
        path: {
          points: [from.position, target.position],
          length: Math.hypot(
            target.position.x - from.position.x,
            target.position.y - from.position.y,
            target.position.z - from.position.z,
          ),
          doorIds: selected ? [selected.id] : [],
          stairIds: [],
        },
        commands: selected ? [{ type: 'set-door', doorId: selected.id, open: true }] : [],
        staging: false,
      };
  }
  const current = selected ? null : destinationRoute(compiled, from, target, 'current');
  if (current) return { path: current, commands: [], staging: false };
  const path = destinationRoute(compiled, from, target, 'openable');
  if (!path) return null;
  const crossing = selected
    ? {
        door: selected,
        side:
          Math.sign(
            rotate(
              { x: from.position.x - selected.centre.x, z: from.position.z - selected.centre.z },
              -selected.rotation,
            ).z,
          ) || 1,
      }
    : doorCrossings(compiled, path.points).find(({ door }) => !door.open);
  if (crossing) {
    const { door, side } = crossing;
    if (
      door.floorId === from.floorId &&
      Math.hypot(from.position.x - door.centre.x, from.position.z - door.centre.z) < 2.5 &&
      validPlayer &&
      options.canSwing?.(door.id, true)
    )
      return {
        path,
        commands: [{ type: 'set-door', doorId: door.id, open: true }],
        staging: false,
      };
    const normal = rotate({ x: 0, z: side }, door.rotation);
    const graph = navigationFor(compiled, 'current');
    const exteriorApproach = compoundDoorApproach(compiled, from, door);
    const stagingSpace = {
      ...compiled,
      options: { ...compiled.options, clearance: compiled.options.clearance + 0.06 },
    };
    const candidates: NavigationPoint[] = (graph.byFloor.get(door.floorId) ?? [])
      .map((node) => graph.nodes[node]!)
      .filter((node) => {
        const dx = node.position.x - door.centre.x,
          dz = node.position.z - door.centre.z;
        return (
          isWalkable(stagingSpace, node, 'current') &&
          dx * normal.x + dz * normal.z > 0.4 &&
          Math.hypot(dx, dz) < 2.8 &&
          Math.hypot(node.position.x - door.hinge.x, node.position.z - door.hinge.z) >
            door.width + compiled.options.radius + 0.12
        );
      })
      .sort(
        (a, b) =>
          Math.hypot(a.position.x - from.position.x, a.position.z - from.position.z) -
          Math.hypot(b.position.x - from.position.x, b.position.z - from.position.z),
      );
    if (exteriorApproach) candidates.unshift(exteriorApproach);
    for (const candidate of candidates) {
      const approach = destinationRoute(compiled, from, candidate, 'current');
      if (!approach) continue;
      return {
        path: approach,
        commands: [{ type: 'set-door', doorId: door.id, open: true }],
        staging:
          !validPlayer ||
          Math.hypot(
            from.position.x - candidate.position.x,
            from.position.y - candidate.position.y,
            from.position.z - candidate.position.z,
          ) > 0.12,
        facing: { ...door.centre, y: door.centre.y + 1.2 },
      };
    }
    return null;
  }
  return clearDoorRoute(compiled, from, target, path);
}

function clearDoorRoute(
  compiled: CompiledBuilding,
  from: NavigationPoint,
  target: NavigationPoint,
  openable: NavigationPath,
): DoorRoute | null {
  const commands: SceneCommand[] = [];
  for (const door of compiled.doors.filter((value) => value.open)) {
    const leaf = compiled.colliders.find((value) => value.id === `${door.id}:leaf`);
    if (!leaf || leaf.shape !== 'box') continue;
    const blocked = openable.points.slice(1).some((b, index) => {
      const a = openable.points[index]!;
      const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1));
      for (let step = 0; step <= count; step++) {
        const t = step / count,
          point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
        if (
          point.y < door.centre.y + door.height &&
          point.y + compiled.options.height > door.centre.y &&
          distanceToBox(point, leaf) < compiled.options.radius + compiled.options.clearance
        )
          return true;
      }
      return false;
    });
    if (blocked) commands.push({ type: 'set-door', doorId: door.id, open: false });
  }
  if (!commands.length) return null;
  const alternatives =
    commands.length > 1 ? [...commands.map((command) => [command]), commands] : [commands];
  for (const candidate of alternatives) {
    const route = closedDoorRoute(compiled, from, target, candidate);
    if (route) return route;
  }
  return null;
}

function closedDoorRoute(
  compiled: CompiledBuilding,
  from: NavigationPoint,
  target: NavigationPoint,
  commands: SceneCommand[],
): DoorRoute | null {
  const changed = compileBuilding(
    applyCommands(compiled.building, {
      id: 'navigation-plan',
      at: new Date().toISOString(),
      expectedRevision: compiled.building.revision,
      commands,
    }).building,
    compiled.options,
  );
  const doors = commands.flatMap((command) =>
    command.type === 'set-door' ? compiled.doors.filter((door) => door.id === command.doorId) : [],
  );
  const safe = (point: NavigationPoint) =>
    doors.every(
      (door) =>
        door.floorId !== point.floorId ||
        Math.hypot(point.position.x - door.hinge.x, point.position.z - door.hinge.z) >
          door.width + compiled.options.radius + 0.1,
    );
  const path = destinationRoute(changed, from, target, 'current');
  if (path && safe(from)) return { path, commands, staging: false };
  const graph = navigationFor(compiled, 'current');
  const candidates = (graph.byFloor.get(from.floorId) ?? [])
    .map((index) => graph.nodes[index]!)
    .filter(
      (node) =>
        safe(node) &&
        Math.hypot(node.position.x - from.position.x, node.position.z - from.position.z) < 3,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.position.x - from.position.x, a.position.z - from.position.z) -
        Math.hypot(b.position.x - from.position.x, b.position.z - from.position.z),
    );
  for (const node of candidates) {
    const approach = destinationRoute(compiled, from, node, 'current');
    if (approach && destinationRoute(changed, node, target, 'current'))
      return { path: approach, commands, staging: true };
  }
  return null;
}
