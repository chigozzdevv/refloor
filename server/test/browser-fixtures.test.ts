import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateBuilding } from '@refloor/engine';
import { validateFixtureOpenings } from '@refloor/server/shared/planning/fixture-clearance';
import { browserHouseBriefs } from '@server-test/briefs/browser-houses';

describe('generated browser fixtures', () => {
  it.each(browserHouseBriefs)('keeps every fixture operable in $name', ({ name, requirements }) => {
    const path = new URL(`../../client/test/browser/fixtures/${name}.json`, import.meta.url),
      building = validateBuilding(JSON.parse(readFileSync(path, 'utf8'))).building;
    expect(building.floors).toHaveLength(requirements.storeys);
    expect(() => validateFixtureOpenings(building)).not.toThrow();
  });
});
