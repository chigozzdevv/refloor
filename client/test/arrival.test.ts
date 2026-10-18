import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Building } from '@refloor/scene';
import { compileBuilding } from '@refloor/engine';
import { createHouse } from '@refloor/catalogue/houses';
import { arrivalView } from '@/shared/navigation/arrival';
import { destinations } from '@/shared/navigation/destinations';
import { clearView } from '@/shared/navigation/viewpoints';
import { exteriorCamera, exteriorLayout } from '@/shared/scene/exterior';
import { entryPose } from '@/shared/navigation/entry';
import { PerspectiveCamera, Vector3 } from 'three';

const generated = JSON.parse(
  readFileSync(new URL('fixtures/generated-two-storey.json', import.meta.url), 'utf8'),
) as Building;

describe('tour arrival views', () => {
  it.each([createHouse({ id: 'arrival-default', name: 'Default', storeys: 2 }), generated])(
    'faces visible interactions at every room stop in $name',
    (building) => {
      const compiled = compileBuilding(building);
      for (const stop of destinations(compiled).filter((value) => value.kind === 'room')) {
        const view = arrivalView(compiled, stop.target, stop.lookAt);
        expect(view, stop.label).not.toBeNull();
        const ignored = view!.kind === 'stairs' ? view!.entityId.split(':')[1] : view!.entityId;
        expect(
          clearView(
            compiled,
            { ...stop.target.position, y: stop.target.position.y + 1.62 },
            view!.point,
            ignored,
          ),
          stop.label,
        ).toBe(true);
      }
      for (const stair of compiled.stairs) {
        for (const landing of [stair.upper, stair.lower]) {
          const stop = destinations(compiled).find(
            (value) => value.kind === 'stairs' && value.target === landing,
          )!;
          const view = arrivalView(compiled, landing, stop.lookAt);
          expect(view).not.toBeNull();
          expect(
            clearView(
              compiled,
              { ...landing.position, y: landing.position.y + 1.62 },
              view!.point,
              view!.kind === 'stairs' ? stair.id : view!.entityId,
            ),
          ).toBe(true);
          if (
            stop.lookAt &&
            clearView(
              compiled,
              { ...landing.position, y: landing.position.y + 1.62 },
              stop.lookAt,
              view!.entityId,
            )
          )
            expect(view!.point).toEqual(stop.lookAt);
        }
      }
    },
  );
});

describe('exterior layout', () => {
  it.each([0.526, 1.6])('frames the complete building at aspect ratio %s', (aspect) => {
    const compiled = compileBuilding(generated),
      site = exteriorLayout(compiled),
      framing = exteriorCamera(compiled, aspect);
    const camera = new PerspectiveCamera(45, aspect, 0.08, 200);
    camera.position.set(framing.position.x, framing.position.y, framing.position.z);
    camera.lookAt(framing.target.x, framing.target.y, framing.target.z);
    camera.updateMatrixWorld(true);
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        for (const y of [0, site.height]) {
          const point = new Vector3(
            site.centre.x + x * (site.width / 2 + 0.5),
            y,
            site.centre.z + z * (site.depth / 2 + 0.5),
          ).project(camera);
          expect(Math.abs(point.x)).toBeLessThan(0.95);
          expect(Math.abs(point.y)).toBeLessThan(0.95);
        }
  });
  it('aligns the path and canopy to the generated entrance instead of a fixed scene position', () => {
    const compiled = compileBuilding(generated),
      site = exteriorLayout(compiled),
      entry = entryPose(compiled);
    const path = site.paving[1]!;
    const dx = path.position.x - site.door.centre.x,
      dz = path.position.z - site.door.centre.z;
    expect(dx * site.tangent.x + dz * site.tangent.z).toBeCloseTo(0);
    expect(dx * entry.normal.x + dz * entry.normal.z).toBeLessThan(0);
    expect(site.paving[0]!.width).toBeGreaterThan(site.width);
    const camera = exteriorCamera(compiled);
    expect(camera.position.y).toBeGreaterThan(site.height);
    expect(camera.target.y).toBeGreaterThan(0);
    expect(compiled.parts.some((part) => part.role === 'roof')).toBe(true);
  });
});
