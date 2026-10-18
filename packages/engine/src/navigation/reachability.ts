import { contains, rotate } from '@refloor/engine/math';
import { nearestNode, reachableNodes } from '@refloor/engine/navigation/connectivity';
import type { EngineIssue, Navigation, NavigationPoint } from '@refloor/engine/types';

export function entrancePoints(navigation: Navigation): NavigationPoint[] {
  const { compiled } = navigation,
    points: NavigationPoint[] = [];
  for (const door of compiled.doors) {
    const floor = compiled.building.floors.find((value) => value.id === door.floorId);
    if (!floor) continue;
    const sides = [-1, 1]
      .map((sign) => {
        const delta = rotate(
          { x: 0, z: sign * (compiled.options.radius + compiled.options.clearance + 0.15) },
          door.rotation,
        );
        return {
          floorId: floor.id,
          position: { x: door.centre.x + delta.x, y: floor.elevation, z: door.centre.z + delta.z },
        };
      })
      .filter((point) => contains(floor.footprint, point.position));
    if (sides.length === 1 && sides[0]) points.push(sides[0]);
  }
  return points.sort((a, b) => a.position.y - b.position.y);
}

export function checkReachability(navigation: Navigation): EngineIssue[] {
  const issues: EngineIssue[] = [],
    { compiled } = navigation;
  const entries = entrancePoints(navigation),
    start = entries.map((point) => nearestNode(navigation, point)).find((index) => index !== null);
  if (start === undefined || start === null)
    return [
      {
        code: 'NO_ENTRANCE',
        entityId: compiled.building.id,
        message: 'Building requires an accessible exterior doorway',
      },
    ];
  const reached = reachableNodes(navigation, start);
  for (const floor of compiled.building.floors)
    for (const room of floor.rooms) {
      const centre = {
        x: room.footprint.x + room.footprint.width / 2,
        z: room.footprint.z + room.footprint.depth / 2,
      };
      const candidates = (navigation.byFloor.get(floor.id) ?? [])
        .filter((index) => {
          const node = navigation.nodes[index];
          return node && contains(room.footprint, node.position);
        })
        .sort((a, b) => {
          const x = navigation.nodes[a],
            y = navigation.nodes[b];
          return x && y
            ? Math.hypot(x.position.x - centre.x, x.position.z - centre.z) -
                Math.hypot(y.position.x - centre.x, y.position.z - centre.z)
            : 0;
        });
      const target = candidates[0];
      if (target === undefined || !reached.has(target))
        issues.push({
          code: 'UNREACHABLE_ROOM',
          entityId: room.id,
          message: 'Room has no reachable usable centre area',
        });
    }
  for (const instance of compiled.instances) {
    const object = instance.object,
      floor = compiled.building.floors.find((value) => value.id === object.floorId);
    if (!floor) continue;
    const margin = compiled.options.radius + compiled.options.clearance + 0.15;
    const positions =
      object.kind === 'light' && object.position.y > compiled.options.headroom
        ? [
            { x: 0, z: 0 },
            ...[0.8, 1.4].flatMap((radius) =>
              Array.from({ length: 8 }, (_, i) => ({
                x: Math.cos((i * Math.PI) / 4) * radius,
                z: Math.sin((i * Math.PI) / 4) * radius,
              })),
            ),
          ]
        : object.kind === 'television'
          ? [margin, margin + 0.5, margin + 1].map((distance) => ({
              x: 0,
              z: object.dimensions.depth / 2 + distance,
            }))
          : [
              { x: 0, z: object.dimensions.depth / 2 + margin },
              { x: object.dimensions.width / 2 + margin, z: 0 },
              { x: -object.dimensions.width / 2 - margin, z: 0 },
              { x: 0, z: -object.dimensions.depth / 2 - margin },
            ];
    const accessible = positions.some((local) => {
      const delta = rotate(local, object.rotation),
        point = {
          floorId: floor.id,
          position: {
            x: object.position.x + delta.x,
            y: floor.elevation,
            z: object.position.z + delta.z,
          },
        };
      const index = nearestNode(navigation, point);
      return index !== null && reached.has(index);
    });
    if (!accessible)
      issues.push({
        code: 'UNREACHABLE_OBJECT',
        entityId: object.id,
        message: 'Object has no reachable interaction position',
      });
  }
  for (const stair of compiled.stairs) {
    const lower = nearestNode(navigation, stair.lower),
      upper = nearestNode(navigation, stair.upper);
    if (lower === null || upper === null || !reached.has(lower) || !reached.has(upper))
      issues.push({
        code: 'STAIR_ACCESS',
        entityId: stair.id,
        message: 'Both staircase landings must connect to the reachable floor network',
      });
  }
  return issues;
}
