import { compileBuilding } from '@refloor/engine';
import { EngineError } from '@refloor/engine/errors';
import { checkOpenableClearance } from '@refloor/engine/validation/openable-clearance';
import type { Building } from '@refloor/scene';

export function validateFixtureOpenings(building: Building): void {
  const fixtures = building.objects.filter((object) =>
    object.behaviours.some((behaviour) => behaviour.kind === 'openable'),
  );
  for (const fixture of fixtures) {
    const opened: Building = {
      ...building,
      objects: building.objects.map((object) =>
        object.id !== fixture.id
          ? object
          : {
              ...object,
              behaviours: object.behaviours.map((behaviour) =>
                behaviour.kind === 'openable' ? { ...behaviour, state: { open: true } } : behaviour,
              ),
            },
      ),
    };
    const issues = checkOpenableClearance(compileBuilding(opened));
    if (issues.length) throw new EngineError(issues);
  }
}
