import { expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { validateBuilding, validatePlacement } from '@refloor/engine';
import type { SceneCommand } from '@refloor/scene';

it('accepts appearance and device changes while still rejecting new geometry and blocked fixtures', () => {
  const building = createHouse({ id: 'validation-reuse', name: 'Validation reuse', storeys: 1 });
  validateBuilding(building);
  const light = building.objects.find((object) => object.kind === 'light')!,
    sofa = building.objects.find((object) => object.kind === 'sofa')!;
  const apply = (commands: SceneCommand[]) =>
    validatePlacement(building, {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      expectedRevision: building.revision,
      commands,
    });
  expect(
    apply([{ type: 'set-light', objectId: light.id, state: { powered: false } }])
      .building.objects.find((object) => object.id === light.id)!
      .behaviours.find((value) => value.kind === 'light')!.state.powered,
  ).toBe(false);
  expect(() =>
    apply([
      {
        type: 'move-object',
        objectId: sofa.id,
        roomId: sofa.roomId,
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
      },
    ]),
  ).toThrow();
  const changed = structuredClone(building);
  changed.floors[0]!.walls = changed.floors[0]!.walls.filter((wall) => !wall.id.endsWith('/west'));
  expect(() => validateBuilding(changed)).toThrow();
});
