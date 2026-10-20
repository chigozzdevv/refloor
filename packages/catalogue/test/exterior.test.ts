import { describe, expect, it } from 'vitest';
import { applyCommands, fingerprintBuilding, undoRevision } from '@refloor/scene';
import { createHouse } from '@refloor/catalogue/houses';
import { exteriorAdditions, furnishExterior } from '@refloor/catalogue/houses/exterior';
import {
  lightOutput,
  lightTuning,
  validateCommandTuning,
  assetFromCatalogue,
} from '@refloor/catalogue';
import { validateBuilding, validatePlacement } from '@refloor/engine';

const metadata = (id: string) => ({ id, at: '2026-10-19T12:00:00Z' });

describe('editable exterior furnishings', () => {
  it.each([1, 2] as const)(
    'places selectable planters and warm wall lights clear of a %s-storey entrance',
    (storeys) => {
      const building = createHouse({ id: 'exterior', name: 'Exterior', storeys });
      const outside = building.objects.filter((object) => object.placement === 'exterior');
      expect(outside).toHaveLength(6);
      expect(
        outside.filter((object) => object.assetId === 'catalogue/outdoor-planter'),
      ).toHaveLength(2);
      expect(outside.filter((object) => object.assetId === 'catalogue/wall-light')).toHaveLength(2);
      expect(
        outside.every((object) => object.roomId && object.floorId && object.materials.body),
      ).toBe(true);
      expect(() => validateBuilding(building)).not.toThrow();
      for (const planter of outside.filter((object) => object.kind === 'decor'))
        expect(planter.position.y).toBe(-0.095);
      for (const light of outside.filter((object) => object.assetId === 'catalogue/wall-light')) {
        expect(lightOutput(light)).toBe(6);
        expect(lightTuning(light)).toMatchObject({ min: 0, normal: 6, max: 12 });
        expect(() =>
          validateCommandTuning(building, [
            { type: 'set-light', objectId: light.id, state: { intensity: 12 } },
          ]),
        ).not.toThrow();
        expect(() =>
          validateCommandTuning(building, [
            { type: 'set-light', objectId: light.id, state: { intensity: 12.01 } },
          ]),
        ).toThrow('200%');
      }
    },
  );

  it('keeps a moved planter accessible around a building corner and rejects a sealed enclosure', () => {
    const building = createHouse({ id: 'access', name: 'Access', storeys: 1 });
    const planter = building.objects.find((object) => object.id === 'site/planter-left')!;
    planter.position = { x: -1.2, y: -0.095, z: 5 };
    expect(() => validateBuilding(building)).not.toThrow();
    planter.position = { x: 4, y: -0.095, z: -2.5 };
    const barriers = [
      { x: 4, z: -1.5, width: 3, depth: 0.2 },
      { x: 4, z: -3.5, width: 3, depth: 0.2 },
      { x: 2.6, z: -2.5, width: 0.2, depth: 1.8 },
      { x: 5.4, z: -2.5, width: 0.2, depth: 1.8 },
    ];
    building.objects.push(
      ...barriers.map((barrier, index) => ({
        ...assetFromCatalogue('catalogue/outdoor-planter'),
        id: `enclosure/planter-${index}`,
        floorId: planter.floorId,
        roomId: planter.roomId,
        placement: 'exterior' as const,
        position: { x: barrier.x, y: -0.095, z: barrier.z },
        rotation: 0,
        dimensions: { width: barrier.width, depth: barrier.depth, height: 1.5 },
      })),
    );
    expect(() => validateBuilding(building)).toThrow(
      'Object has no reachable interaction position',
    );
  });

  it('adds missing exterior objects without changing saved fixture state or duplicating IDs', () => {
    const building = createHouse({ id: 'existing', name: 'Existing', storeys: 1 });
    building.objects = building.objects.filter(
      (object) =>
        !object.id.startsWith('site/planter-') && !object.id.startsWith('site/wall-light-'),
    );
    const floodlight = building.objects.find((object) => object.id === 'site/floodlight-left')!;
    floodlight.behaviours.find((behaviour) => behaviour.kind === 'light')!.state.powered = true;
    const before = fingerprintBuilding(building),
      additions = exteriorAdditions(building);
    expect(additions).toHaveLength(4);
    expect(fingerprintBuilding(building)).toBe(before);
    const result = validatePlacement(building, {
      ...metadata('upgrade'),
      expectedRevision: building.revision,
      commands: additions.map((object) => ({ type: 'add-object', object })),
    });
    expect(exteriorAdditions(result.building)).toEqual([]);
    expect(result.building.objects.find((object) => object.id === floodlight.id)).toEqual(
      floodlight,
    );
    const restored = undoRevision(result.building, result.revision, metadata('undo-upgrade'));
    expect(restored.building.objects).toEqual(building.objects);
    furnishExterior(result.building);
    expect(new Set(result.building.objects.map((object) => object.id)).size).toBe(
      result.building.objects.length,
    );
  });

  it('supports normal material, move, power, colour and undo commands on exterior objects', () => {
    const building = createHouse({ id: 'commands', name: 'Commands', storeys: 1 });
    const planter = building.objects.find((object) => object.id === 'site/planter-left')!;
    const light = building.objects.find((object) => object.id === 'site/wall-light-left')!;
    const result = validatePlacement(building, {
      ...metadata('exterior-edit'),
      expectedRevision: building.revision,
      commands: [
        {
          type: 'move-object',
          objectId: planter.id,
          roomId: planter.roomId,
          rotation: planter.rotation,
          position: { ...planter.position, z: planter.position.z - 0.5 },
        },
        {
          type: 'set-object-material',
          objectId: planter.id,
          slot: 'body',
          material: { ...planter.materials.body, color: '#b47761' },
        },
        {
          type: 'set-light',
          objectId: light.id,
          state: { powered: false, intensity: 9, color: '#ffcc88' },
        },
      ],
    });
    expect(lightOutput(result.building.objects.find((object) => object.id === light.id)!)).toBe(0);
    expect(
      undoRevision(result.building, result.revision, metadata('undo-exterior')).building.objects,
    ).toEqual(building.objects);
    expect(
      applyCommands(building, {
        ...metadata('light-on'),
        expectedRevision: building.revision,
        commands: [{ type: 'set-light', objectId: light.id, state: { powered: true } }],
      })
        .building.objects.find((object) => object.id === light.id)
        ?.behaviours.find((behaviour) => behaviour.kind === 'light')?.state.powered,
    ).toBe(true);
  });
});
