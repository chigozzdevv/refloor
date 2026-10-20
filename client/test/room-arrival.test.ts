import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import type { Building } from '@refloor/scene';
import { compileBuilding } from '@refloor/engine';
import { arrivalView } from '@/shared/navigation/arrival';
import { destinations } from '@/shared/navigation/destinations';
import { clearView } from '@/shared/navigation/viewpoints';

const generated = JSON.parse(
  readFileSync(new URL('fixtures/generated-two-storey.json', import.meta.url), 'utf8'),
) as Building;
const expectedAssets: Record<string, string[]> = {
  kitchen: ['catalogue/kitchen-counter'],
  bathroom: ['catalogue/vanity', 'catalogue/shower'],
  bedroom: ['catalogue/bed'],
  living: ['catalogue/television', 'catalogue/sofa'],
  workspace: ['catalogue/desk'],
};

describe('semantic room arrival views', () => {
  it.each([
    createHouse({ id: 'semantic-arrival', name: 'Semantic arrival', storeys: 2 }),
    generated,
  ])('faces a useful primary fixture when entering rooms in $name', (building) => {
    const compiled = compileBuilding(building),
      stops = destinations(compiled);
    for (const room of building.floors.flatMap((floor) => floor.rooms)) {
      if (!expectedAssets[room.kind]) continue;
      const stop = stops.find((item) => item.kind === 'room' && item.roomId === room.id)!;
      const view = arrivalView(compiled, stop.target, stop.lookAt)!;
      expect(view.kind, room.name).toBe('object');
      const subject = building.objects.find((item) => item.id === view.entityId)!;
      expect(expectedAssets[room.kind], room.name).toContain(subject.assetId);
      const eye = { ...stop.target.position, y: stop.target.position.y + 1.62 },
        distance = Math.hypot(view.point.x - eye.x, view.point.z - eye.z),
        downwardPitch = Math.atan2(eye.y - view.point.y, distance);
      expect(downwardPitch, room.name).toBeLessThanOrEqual(Math.PI / 10 + 1e-6);
      expect(clearView(compiled, eye, view.point, subject.id), room.name).toBe(true);
    }
  });

  it('ignores a legacy island preference when the cooker is visible', () => {
    const building = createHouse({
        id: 'island-preference',
        name: 'Island preference',
        storeys: 2,
      }),
      compiled = compileBuilding(building),
      kitchen = building.floors
        .flatMap((floor) => floor.rooms)
        .find((room) => room.kind === 'kitchen')!,
      island = building.objects.find(
        (item) => item.roomId === kitchen.id && item.assetId === 'catalogue/kitchen-island',
      )!,
      stop = destinations(compiled).find(
        (item) => item.kind === 'room' && item.roomId === kitchen.id,
      )!,
      view = arrivalView(compiled, stop.target, {
        ...island.position,
        y: island.dimensions.height * 0.65,
      })!;
    expect(building.objects.find((item) => item.id === view.entityId)?.assetId).toBe(
      'catalogue/kitchen-counter',
    );
  });

  it('gives an actual generated open-plan house distinct living and kitchen views', () => {
    const building = JSON.parse(
      readFileSync(new URL('fixtures/generated-open-plan.json', import.meta.url), 'utf8'),
    ) as Building;
    const compiled = compileBuilding(building),
      room = building.floors[0]!.rooms.find((item) => item.kind === 'living')!,
      stops = destinations(compiled).filter(
        (item) => item.kind === 'room' && item.roomId === room.id,
      ),
      subjects = stops.map((stop) => {
        const view = arrivalView(compiled, stop.target, stop.lookAt)!;
        return building.objects.find((item) => item.id === view.entityId)?.assetId;
      });
    expect(subjects).toContain('catalogue/television');
    expect(subjects).toContain('catalogue/kitchen-counter');
  });
});
