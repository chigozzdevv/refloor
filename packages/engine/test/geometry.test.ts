import { describe, expect, it } from 'vitest';
import { applyCommands } from '@refloor/scene';
import { compileBuilding, EngineError } from '@refloor/engine';
import { worldPoint } from '@refloor/engine/math';
import { createBuilding, createTwoStorey, edit, first } from '@engine-test/fixtures';

describe('compiled building geometry', () => {
  it('produces finite indexed meshes with matching collision transforms', () => {
    const source = createTwoStorey(),
      before = structuredClone(source),
      compiled = compileBuilding(source);
    expect(compiled.parts.length).toBeGreaterThan(20);
    expect(source).toEqual(before);
    expect(new Set(compiled.parts.map((part) => part.id)).size).toBe(compiled.parts.length);
    for (const part of compiled.parts) {
      expect(part.mesh.positions.every(Number.isFinite)).toBe(true);
      expect(part.mesh.normals.every(Number.isFinite)).toBe(true);
      expect(part.mesh.uvs.every(Number.isFinite)).toBe(true);
      expect(part.mesh.normals.length).toBe(part.mesh.positions.length);
      expect(part.mesh.uvs.length).toBe((part.mesh.positions.length / 3) * 2);
      expect(
        part.mesh.indices.every(
          (index) =>
            Number.isInteger(index) && index >= 0 && index < part.mesh.positions.length / 3,
        ),
      ).toBe(true);
      expect(part.collider.entityId).toBe(part.entityId);
      if (part.collider.shape === 'box') {
        const xs: number[] = [],
          ys: number[] = [],
          zs: number[] = [];
        for (let i = 0; i < part.mesh.positions.length; i += 3) {
          xs.push(part.mesh.positions[i] ?? 0);
          ys.push(part.mesh.positions[i + 1] ?? 0);
          zs.push(part.mesh.positions[i + 2] ?? 0);
        }
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(part.collider.size.x);
        expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(part.collider.size.y);
        expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(part.collider.size.z);
      }
    }
  });

  it('actually removes door and window openings from wall solids', () => {
    const compiled = compileBuilding(createBuilding());
    const solids = compiled.parts.filter(
      (part) => part.entityId === 'south' && part.role === 'wall',
    );
    const volume = solids.reduce(
      (sum, part) =>
        sum +
        (part.collider.shape === 'box'
          ? part.collider.size.x * part.collider.size.y * part.collider.size.z
          : 0),
      0,
    );
    expect(volume).toBeCloseTo((10 * 2.8 - 0.9 * 2.1 - 1.5 * 1) * 0.15);
    expect(
      compiled.parts.some((part) => part.entityId === 'window' && part.role === 'window'),
    ).toBe(true);
  });

  it('cuts the stair opening out of the upper floor', () => {
    const building = createTwoStorey(),
      compiled = compileBuilding(building);
    const upper = building.floors.find((floor) => floor.id === 'upper');
    if (!upper) throw new Error('Upper floor missing');
    const area = compiled.surfaces
      .filter((surface) => surface.floorId === 'upper' && !surface.id.includes('step'))
      .reduce((sum, surface) => sum + surface.footprint.width * surface.footprint.depth, 0);
    expect(area).toBeCloseTo(10 * 6 - 2.4 * 4);
  });

  it.each(['start', 'end'] as const)('rotates a door leaf around its %s hinge', (hinge) => {
    const building = createBuilding();
    const opening = first(first(first(building.floors).walls).openings);
    if (opening.kind !== 'door') throw new Error('Door missing');
    opening.hinge = hinge;
    const closed = compileBuilding(building),
      changed = applyCommands(
        building,
        edit([{ type: 'set-door', doorId: 'entrance', open: true }]),
      );
    const opened = compileBuilding(changed.building),
      a = closed.doors.find((door) => door.id === 'entrance'),
      b = opened.doors.find((door) => door.id === 'entrance');
    expect(a?.hinge).toEqual(b?.hinge);
    const leaf = opened.parts.find((part) => part.id === 'entrance:leaf');
    if (!leaf || leaf.collider.shape !== 'box' || !b) throw new Error('Leaf missing');
    expect(Math.abs(leaf.collider.rotation - b.rotation)).toBeCloseTo(Math.PI / 2);
    const edge = worldPoint(
      {
        x: ((hinge === 'start' ? -1 : 1) * leaf.collider.size.x) / 2,
        y: -leaf.collider.size.y / 2,
        z: 0,
      },
      leaf.collider.position,
      leaf.collider.rotation,
    );
    expect(edge.x).toBeCloseTo(b.hinge.x);
    expect(edge.z).toBeCloseTo(b.hinge.z);
  });

  it('builds a closed gable shell with a matching mesh collider', () => {
    const building = createBuilding();
    building.roof.kind = 'gable';
    building.roof.pitch = Math.PI / 6;
    const roof = compileBuilding(building).parts.find((part) => part.role === 'roof');
    expect(roof?.collider.shape).toBe('mesh');
    expect(roof?.mesh.indices.length).toBe(24);
  });

  it('keeps furniture as asset instances with real collision proxies', () => {
    const compiled = compileBuilding(createBuilding());
    expect(compiled.instances).toHaveLength(3);
    expect(compiled.parts.some((part) => part.role === 'furniture')).toBe(false);
    expect(
      compiled.instances.find((instance) => instance.object.id === 'tv')?.collider.position.y,
    ).toBeCloseTo(1.3);
  });

  it('rejects invalid profile settings, geometry budgets and unassigned floor areas', () => {
    expect(() => compileBuilding(createBuilding(), { radius: NaN })).toThrow(EngineError);
    expect(() => compileBuilding(createBuilding(), { maxParts: 2 })).toThrow(EngineError);
    const building = createBuilding();
    building.objects = [];
    first(first(building.floors).rooms).footprint.width = 5;
    expect(() => compileBuilding(building)).toThrow(EngineError);
  });

  it('rejects a degenerate gable and storeys whose slabs or roof would leave gaps', () => {
    const gable = createBuilding();
    gable.roof.kind = 'gable';
    gable.roof.pitch = 1e-12;
    expect(() => compileBuilding(gable)).toThrow(/ridge/);
    const stacked = createTwoStorey(),
      upper = stacked.floors.find((floor) => floor.id === 'upper');
    if (!upper) throw new Error('Upper floor missing');
    upper.elevation += 0.1;
    expect(() => compileBuilding(stacked)).toThrow(/slab/);
    upper.elevation -= 0.1;
    upper.footprint.width += 1;
    expect(() => compileBuilding(stacked)).toThrow(/footprints/);
  });
});
