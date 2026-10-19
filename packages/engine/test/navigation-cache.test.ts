import { describe, expect, it } from 'vitest';
import {
  buildNavigation,
  compileBuilding,
  entrancePoints,
  findPath,
  validateBuilding,
  validatePlacement,
} from '@refloor/engine';
import { createBuilding, edit, finish, first } from '@engine-test/fixtures';

const bedroom = { floorId: 'ground', position: { x: 8, y: 0, z: 3 } };

describe('navigation topology reuse', () => {
  it('returns the existing graph for the same compiled scene and door policy', () => {
    const compiled = validateBuilding(createBuilding());
    for (const policy of ['openable', 'current'] as const)
      expect(buildNavigation(compiled, policy)).toBe(buildNavigation(compiled, policy));
    expect(buildNavigation(compiled, 'openable')).not.toBe(buildNavigation(compiled, 'current'));
  });

  it('shares openable topology after opening a door while binding routes to the latest scene', () => {
    const before = validateBuilding(createBuilding()),
      initial = buildNavigation(before),
      after = validatePlacement(
        before.building,
        edit([{ type: 'set-door', doorId: 'bedroom-door', open: true }]),
      ).compiled,
      updated = buildNavigation(after),
      from = first(entrancePoints(initial));
    expect(updated).not.toBe(initial);
    expect(updated.nodes).toBe(initial.nodes);
    expect(updated.compiled).toBe(after);
    expect(initial.compiled).toBe(before);
    expect(findPath(initial, from, bedroom)?.doorIds).toContain('bedroom-door');
    expect(findPath(updated, from, bedroom)?.doorIds).not.toContain('bedroom-door');
  });

  it('reuses topology for material and light edits without exposing mutable cached maps', () => {
    const before = validateBuilding(createBuilding()),
      initial = buildNavigation(before),
      indices = initial.byFloor.get('ground')!,
      cells = new Map(initial.grids.get('ground')),
      after = validatePlacement(
        before.building,
        edit([
          { type: 'set-wall-material', wallId: 'north', material: { ...finish, color: '#ffddcc' } },
          { type: 'set-object-material', objectId: 'sofa', slot: 'body', material: finish },
          { type: 'set-light', objectId: 'lamp', state: { powered: false, intensity: 1 } },
        ]),
      ).compiled;
    initial.byFloor.clear();
    initial.grids.get('ground')!.clear();
    const updated = buildNavigation(after);
    expect(updated.nodes).toBe(initial.nodes);
    expect(updated.byFloor.get('ground')).toEqual(indices);
    expect(updated.grids.get('ground')).toEqual(cells);
    expect(Object.isFrozen(updated.nodes)).toBe(true);
    expect(Object.isFrozen(updated.nodes[0]!.edges)).toBe(true);
    expect(() => updated.nodes[0]!.edges.pop()).toThrow(TypeError);
  });

  it('rebuilds current-state routes when a door opens and keeps closed routes blocked', () => {
    const before = validateBuilding(createBuilding()),
      closed = buildNavigation(before, 'current'),
      after = validatePlacement(
        before.building,
        edit([{ type: 'set-door', doorId: 'bedroom-door', open: true }]),
      ).compiled,
      opened = buildNavigation(after, 'current'),
      from = first(entrancePoints(closed));
    expect(opened.nodes).not.toBe(closed.nodes);
    expect(findPath(closed, from, bedroom)).toBeNull();
    expect(findPath(opened, from, bedroom)).not.toBeNull();
    expect(findPath(closed, from, bedroom)).toBeNull();
  });

  it('invalidates topology for changed walker options and resource limits', () => {
    const before = validateBuilding(createBuilding()),
      initial = buildNavigation(before),
      wider = compileBuilding(before.building, { radius: 0.35 });
    expect(buildNavigation(wider).nodes).not.toBe(initial.nodes);
    expect(() => buildNavigation(compileBuilding(before.building, { maxNodes: 2 }))).toThrow(
      /budget/,
    );
  });

  it('rebuilds topology when a door rule moves furniture', () => {
    const building = createBuilding();
    building.rules = [
      {
        id: 'make-space',
        label: 'Move the sofa when the bedroom opens',
        enabled: true,
        trigger: { kind: 'door', doorId: 'bedroom-door', open: true },
        conditions: [],
        actions: [
          {
            type: 'move-object',
            objectId: 'sofa',
            roomId: 'living',
            position: { x: 2.5, y: 0, z: 2.5 },
            rotation: 0,
          },
        ],
      },
    ];
    const before = validateBuilding(building),
      initial = buildNavigation(before),
      after = validatePlacement(
        before.building,
        edit([{ type: 'set-door', doorId: 'bedroom-door', open: true }]),
      );
    expect(after.revision.commands.some((command) => command.type === 'move-object')).toBe(true);
    expect(buildNavigation(after.compiled).nodes).not.toBe(initial.nodes);
  });

  it('still rejects colliding door leaves when the openable topology is cached', () => {
    const building = createBuilding(),
      partition = first(building.floors).walls.find((wall) => wall.id === 'partition')!,
      door = first(partition.openings);
    if (door.kind !== 'door') throw new Error('Fixture requires an interior door');
    partition.openings.push({
      ...structuredClone(door),
      id: 'adjacent-door',
      offset: door.offset + door.width,
      hinge: 'start',
    });
    const before = validateBuilding(building);
    buildNavigation(before);
    expect(() =>
      validatePlacement(
        before.building,
        edit([
          { type: 'set-door', doorId: 'bedroom-door', open: true },
          { type: 'set-door', doorId: 'adjacent-door', open: true },
        ]),
      ),
    ).toThrow(/Door leaf overlaps/);
  });
});
