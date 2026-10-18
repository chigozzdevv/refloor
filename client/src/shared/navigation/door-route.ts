import { applyCommands } from '@refloor/scene';
import type { SceneCommand } from '@refloor/scene';
import { compileBuilding } from '@refloor/engine';
import type { CompiledBuilding, NavigationPoint, NavigationPath } from '@refloor/engine';
import { distanceToBox } from '@refloor/engine/math';
import { destinationRoute, navigationFor } from '@/shared/navigation/destinations';

export type DoorRoute = { path: NavigationPath; commands: SceneCommand[]; staging: boolean };

export function doorRoute(
  compiled: CompiledBuilding,
  from: NavigationPoint,
  target: NavigationPoint,
): DoorRoute | null {
  const current = destinationRoute(compiled, from, target, 'current');
  if (current) return { path: current, commands: [], staging: false };
  const openable = destinationRoute(compiled, from, target, 'openable');
  if (!openable) return null;
  const commands: SceneCommand[] = openable.doorIds.map((doorId) => ({
    type: 'set-door',
    doorId,
    open: true,
  }));
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
