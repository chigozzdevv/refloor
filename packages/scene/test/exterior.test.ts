import { describe, expect, it } from 'vitest';
import { applyCommands, parseBuilding, fingerprintBuilding, undoRevision } from '@refloor/scene';
import { languageEditRequestSchema } from '@refloor/scene/chat';
import { createEditMemory, commandTouches, snapshotFor } from '@refloor/scene/edit-memory';
import { wallExteriorSide } from '@refloor/scene/wall-exterior';
import { createBuilding, edit, finish } from '@scene-test/fixtures';

const metadata = { id: 'undo-exterior', at: '2026-10-19T12:00:00Z' };
describe('editable exterior surfaces', () => {
  it('preserves legacy building JSON and exactly undoes a new exterior override', () => {
    const building = createBuilding(),
      fingerprint = fingerprintBuilding(building);
    expect(parseBuilding(building)).toEqual(building);
    const changed = applyCommands(
      building,
      edit([
        {
          type: 'set-wall-exterior-material',
          wallId: 'south',
          material: { ...finish, textureId: 'brick', color: '#a45030' },
        },
      ]),
    );
    expect(changed.building.floors[0]!.walls[0]!.material).toEqual(finish);
    expect(changed.revision.inverseCommands).toEqual([
      { type: 'set-wall-exterior-material', wallId: 'south', material: null },
    ]);
    const undone = undoRevision(changed.building, changed.revision, metadata);
    expect(undone.building.floors[0]!.walls[0]).not.toHaveProperty('exteriorMaterial');
    expect(fingerprintBuilding({ ...undone.building, revision: building.revision })).toBe(
      fingerprint,
    );
  });
  it('preserves an inherited exterior dynamically and restores exact optional field absence', () => {
    const building = createBuilding();
    const changed = applyCommands(
      building,
      edit([
        {
          type: 'set-wall-material',
          wallId: 'south',
          material: { ...finish, color: '#aabbcc' },
          preserveExterior: true,
        },
      ]),
    );
    expect(changed.building.floors[0]!.walls[0]!.exteriorMaterial).toEqual(finish);
    expect(changed.revision.inverseCommands).toEqual([
      { type: 'set-wall-material', wallId: 'south', material: finish, exteriorMaterial: null },
    ]);
    const undone = undoRevision(changed.building, changed.revision, metadata);
    expect(undone.building.floors[0]!.walls[0]).not.toHaveProperty('exteriorMaterial');
    expect(fingerprintBuilding({ ...undone.building, revision: building.revision })).toBe(
      fingerprintBuilding(building),
    );
    const legacy = applyCommands(
      building,
      edit([
        { type: 'set-wall-material', wallId: 'south', material: { ...finish, color: '#aabbcc' } },
      ]),
    );
    expect(legacy.building.floors[0]!.walls[0]).not.toHaveProperty('exteriorMaterial');
    expect(legacy.revision.inverseCommands).toEqual([
      { type: 'set-wall-material', wallId: 'south', material: finish },
    ]);
  });
  it('keeps roof material changes reversible and in persistent context', () => {
    const building = createBuilding(),
      roof = building.roof;
    const changed = applyCommands(
      building,
      edit([
        {
          type: 'set-roof-material',
          roofId: roof.id,
          material: { ...roof.material, textureId: 'roof-asphalt' },
        },
      ]),
    );
    expect(undoRevision(changed.building, changed.revision, metadata).building.roof).toEqual(roof);
    expect(createEditMemory(building).originals).toContainEqual({
      kind: 'roof',
      id: roof.id,
      value: roof,
    });
    expect(snapshotFor(building, { kind: 'roof', id: roof.id })?.value).toEqual(roof);
    expect(commandTouches(changed.revision.commands[0]!, { kind: 'roof', id: roof.id })).toBe(true);
  });
  it('rejects exterior cladding on internal partitions and keeps paint context separate', () => {
    const building = createBuilding(),
      floor = building.floors[0]!;
    expect(
      wallExteriorSide(
        floor,
        floor.walls.find((wall) => wall.id === 'partition')!,
      ),
    ).toBeNull();
    expect(() =>
      applyCommands(
        building,
        edit([{ type: 'set-wall-exterior-material', wallId: 'partition', material: finish }]),
      ),
    ).toThrow('exterior');
    const exterior = {
      type: 'set-wall-exterior-material' as const,
      wallId: 'south',
      material: finish,
    };
    expect(commandTouches(exterior, { kind: 'wall', id: 'south' })).toBe(false);
    expect(commandTouches(exterior, { kind: 'wall', id: 'south', side: 'exterior' })).toBe(true);
  });
  it('accepts actual outside walking elevations in chat while rejecting negative interior objects', () => {
    const building = createBuilding();
    expect(
      languageEditRequestSchema.parse({
        requestId: '99b73231-385b-4734-9962-526d2555b546',
        building,
        target: { kind: 'roof', id: building.roof.id },
        message: 'Make the roof charcoal',
        view: { x: 0, z: 1 },
        player: { floorId: 'ground', position: { x: 2, y: -0.12, z: -1 } },
      }).player?.position.y,
    ).toBe(-0.12);
    building.objects[0]!.position.y = -0.1;
    expect(() => parseBuilding(building)).toThrow('Interior object');
  });
});
