import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { encodeProject, parseProjectFile } from '@/runtime/projects/files';

describe('portable project files', () => {
  it('round-trips the complete two-storey building with stable identities and state', () => {
    const building = createHouse({ id: 'portable-home', name: 'Portable home', storeys: 2 });
    expect(parseProjectFile(encodeProject(building)).building).toEqual(building);
  });
  it('rejects unavailable assets and invalid geometry before opening a project', () => {
    const building = createHouse({ id: 'portable-home', name: 'Portable home', storeys: 1 });
    building.objects[0]!.assetId = 'unavailable-model';
    expect(() => parseProjectFile(encodeProject(building))).toThrow(
      'Furniture asset is unavailable',
    );
    building.objects[0]!.assetId = 'catalogue/sofa';
    building.objects[0]!.position.x = -50;
    expect(() => parseProjectFile(encodeProject(building))).toThrow();
    expect(() => parseProjectFile('{bad json')).toThrow();
  });
});
