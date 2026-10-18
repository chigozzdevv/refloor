import { readFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import type { Building } from '@refloor/scene';
import { applyCommands } from '@refloor/scene';
import { compileBuilding } from '@refloor/engine';
import { CharacterWorld, initializePhysics } from '@/shared/navigation/physics-world';
import { destinations, smoothRoute } from '@/shared/navigation/destinations';
import { createJourney, stepJourney } from '@/shared/navigation/journey';
import { doorRoute } from '@/shared/navigation/door-route';
import { MathUtils } from 'three';
beforeAll(initializePhysics);
it('walks every generated room and returns through real doors and stairs', () => {
  let compiled = compileBuilding(
    JSON.parse(
      readFileSync(new URL('fixtures/generated-two-storey.json', import.meta.url), 'utf8'),
    ) as Building,
  );
  let world = new CharacterWorld(compiled);
  const fractions = new Map(compiled.doors.map((door) => [door.id, Number(door.open)]));
  const home = { ...world.player, position: { ...world.feet, y: 0 } };
  const stops = destinations(compiled).filter((s) => s.kind === 'room');
  try {
    for (const stop of stops) {
      for (const target of [stop.target, home]) {
        let arrived = false;
        for (let phase = 0; phase < 6 && !arrived; phase++) {
          const plan = doorRoute(compiled, world.player, target);
          expect(
            plan,
            JSON.stringify({ label: stop.label, from: world.player, target }),
          ).not.toBeNull();
          if (!plan!.commands.length || plan!.staging) {
            const journey = createJourney(smoothRoute(compiled, plan!.path.points));
            let status = 'moving';
            for (let i = 0; i < 12000 && status === 'moving'; i++) {
              for (const door of compiled.doors) {
                const fraction = MathUtils.damp(
                  fractions.get(door.id)!,
                  Number(door.open),
                  9,
                  1 / 60,
                );
                if (!world.doorBlocked(door.id, fraction)) fractions.set(door.id, fraction);
                world.setDoorFraction(door.id, fractions.get(door.id)!);
              }
              status = stepJourney(world, journey, 1 / 60);
            }
            expect(
              status,
              JSON.stringify({
                label: stop.label,
                target,
                feet: world.feet,
                next: journey.points[journey.index],
              }),
            ).toBe('arrived');
            if (!plan!.commands.length) {
              arrived = true;
              continue;
            }
          }
          const changed = applyCommands(compiled.building, {
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            expectedRevision: compiled.building.revision,
            commands: plan!.commands,
          });
          const feet = world.feet;
          world.dispose();
          compiled = compileBuilding(changed.building);
          world = new CharacterWorld(compiled, feet);
        }
        expect(arrived, stop.label).toBe(true);
      }
    }
  } finally {
    world.dispose();
  }
}, 60000);
