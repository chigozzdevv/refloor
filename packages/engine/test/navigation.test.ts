import { rotate } from '@refloor/engine/math';
import { doorCrossings } from '@refloor/engine/navigation/doors';
import { describe, expect, it } from 'vitest';
import { applyCommands } from '@refloor/scene';
import {
  buildNavigation,
  checkClearance,
  checkReachability,
  compileBuilding,
  entrancePoints,
  findPath,
  validateBuilding,
  validatePlacement,
} from '@refloor/engine';
import { createBuilding, createTwoStorey, edit, first, getObject } from '@engine-test/fixtures';

describe('clearance and navigation', () => {
  it('validates a furnished house and finds a path requiring an interior door to open', () => {
    const compiled = validateBuilding(createBuilding()),
      navigation = buildNavigation(compiled);
    const from = first(entrancePoints(navigation));
    const path = findPath(navigation, from, { floorId: 'ground', position: { x: 8, y: 0, z: 3 } });
    expect(path?.doorIds).toContain('bedroom-door');
    expect(path?.length).toBeGreaterThan(5);
    expect(checkReachability(navigation)).toEqual([]);
  });

  it('detects a crossing when path vertices lie on a rotated door plane', () => {
    const compiled = compileBuilding(createBuilding());
    const door = compiled.doors.find((value) => value.id === 'bedroom-door')!;
    const points = [
      [0, -1],
      [0.2, -1e-15],
      [-0.2, 1e-15],
      [0, 1],
    ].map(([x, z]) => {
      const offset = rotate({ x: x!, z: z! }, door.rotation);
      return { x: door.centre.x + offset.x, y: door.centre.y, z: door.centre.z + offset.z };
    });
    for (const route of [points, points.toReversed()]) {
      const crossings = doorCrossings(compiled, route);
      expect(crossings.map((value) => value.door.id)).toEqual([door.id]);
    }
    expect(
      doorCrossings(
        compiled,
        points.map((point) => ({ ...point, y: point.y + 3 })),
      ),
    ).toEqual([]);
  });

  it('respects closed door leaves when current-state navigation is requested', () => {
    const navigation = buildNavigation(compileBuilding(createBuilding()), 'current');
    expect(
      findPath(navigation, first(entrancePoints(navigation)), {
        floorId: 'ground',
        position: { x: 8, y: 0, z: 3 },
      }),
    ).toBeNull();
  });

  it.each(['u-shaped', 'straight'] as const)(
    'connects rooms across floors through a %s staircase',
    (kind) => {
      const compiled = validateBuilding(createTwoStorey(kind)),
        navigation = buildNavigation(compiled);
      const path = findPath(navigation, first(entrancePoints(navigation)), {
        floorId: 'upper',
        position: { x: 8, y: 3, z: 3 },
      });
      expect(path?.stairIds).toEqual(['stairs']);
      expect(path?.points.some((point) => point.y > 0 && point.y < 3)).toBe(true);
    },
  );

  it('rejects a room sealed off by a wall', () => {
    const building = createBuilding(),
      partition = first(building.floors).walls.find((wall) => wall.id === 'partition');
    if (!partition) throw new Error('Partition missing');
    partition.openings = [];
    expect(() => validateBuilding(building)).toThrow(/reachable/);
  });

  it('detects door swing collisions even while the door is closed', () => {
    const building = createBuilding(),
      sofa = getObject(building, 'sofa');
    sofa.dimensions = { width: 0.5, height: 1, depth: 0.5 };
    sofa.position = { x: 1.5, y: 0, z: 0.5 };
    expect(
      checkClearance(compileBuilding(building)).some((issue) => issue.code === 'DOOR_SWING'),
    ).toBe(true);
  });

  it('detects rotated furniture collisions without treating their empty bounding-box corners as solid', () => {
    const building = createBuilding(),
      sofa = getObject(building, 'sofa'),
      tv = getObject(building, 'tv');
    tv.position = { ...sofa.position };
    tv.rotation = Math.PI / 4;
    expect(
      checkClearance(compileBuilding(building)).some((issue) => issue.code === 'OBJECT_COLLISION'),
    ).toBe(true);
    sofa.dimensions = { width: 2, height: 0.8, depth: 0.15 };
    sofa.position = { x: 2, y: 0, z: 2 };
    sofa.rotation = Math.PI / 4;
    tv.dimensions = { ...sofa.dimensions };
    tv.rotation = sofa.rotation;
    tv.position = { x: 2.4, y: 0, z: 2.4 };
    expect(
      checkClearance(compileBuilding(building)).some((issue) => issue.code === 'OBJECT_COLLISION'),
    ).toBe(false);
  });

  it('accepts a valid move and preserves the original document', () => {
    const building = createBuilding(),
      original = structuredClone(building);
    const result = validatePlacement(
      building,
      edit([
        {
          type: 'move-object',
          objectId: 'sofa',
          roomId: 'living',
          position: { x: 2.5, y: 0, z: 2.5 },
          rotation: 0,
        },
      ]),
    );
    expect(result.building.revision).toBe(1);
    expect(building).toEqual(original);
  });

  it('rejects placement into another object or the player without mutation', () => {
    const building = createBuilding(),
      original = structuredClone(building);
    expect(() =>
      validatePlacement(
        building,
        edit([
          {
            type: 'move-object',
            objectId: 'sofa',
            roomId: 'living',
            position: { x: 4.5, y: 0.9, z: 4.5 },
            rotation: 0,
          },
        ]),
      ),
    ).toThrow();
    expect(() =>
      validatePlacement(
        building,
        edit([
          {
            type: 'move-object',
            objectId: 'sofa',
            roomId: 'living',
            position: { x: 2.5, y: 0, z: 2.5 },
            rotation: 0,
          },
        ]),
        {},
        { floorId: 'ground', position: { x: 2.5, y: 0, z: 2.5 } },
      ),
    ).toThrow(/player/);
    expect(building).toEqual(original);
  });

  it('rejects an inaccessible interaction position and navigation overflow', () => {
    const building = createBuilding(),
      tv = getObject(building, 'tv');
    tv.position.z = 5.85;
    expect(() => validateBuilding(building)).toThrow(/interaction/);
    expect(() => buildNavigation(compileBuilding(createBuilding(), { maxNodes: 2 }))).toThrow(
      /budget/,
    );
  });

  it('updates a door collider after its state changes', () => {
    const building = createBuilding(),
      next = applyCommands(building, edit([{ type: 'set-door', doorId: 'entrance', open: true }]));
    expect(compileBuilding(next.building).doors.find((door) => door.id === 'entrance')?.open).toBe(
      true,
    );
  });

  it('rejects two opened door leaves that occupy the same space', () => {
    const building = createBuilding(),
      partition = first(building.floors).walls.find((wall) => wall.id === 'partition');
    if (!partition) throw new Error('Partition missing');
    const door = first(partition.openings);
    if (door.kind !== 'door') throw new Error('Door missing');
    door.state.open = true;
    partition.openings.push({
      ...structuredClone(door),
      id: 'adjacent-door',
      offset: door.offset + door.width,
      hinge: 'start',
    });
    expect(
      checkClearance(compileBuilding(building)).some((issue) => issue.code === 'DOOR_COLLISION'),
    ).toBe(true);
  });

  it('rejects a missing or partial-height exterior wall', () => {
    const building = createBuilding(),
      floor = first(building.floors),
      north = floor.walls.find((wall) => wall.id === 'north');
    if (!north) throw new Error('North wall missing');
    north.height = 2;
    expect(() => validateBuilding(building)).toThrow(/perimeter/);
    floor.walls = floor.walls.filter((wall) => wall.id !== 'north');
    for (const room of floor.rooms) room.wallIds = room.wallIds.filter((id) => id !== 'north');
    expect(() => validateBuilding(building)).toThrow(/perimeter/);
  });
});
