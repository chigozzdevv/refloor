import { describe, expect, it } from 'vitest';
import { undoRevision } from '@refloor/scene';
import {
  buildNavigation,
  checkReachability,
  validateBuilding,
  validatePlacement,
} from '@refloor/engine';
import { createBuilding, edit } from '@engine-test/fixtures';

describe('validated structural editing', () => {
  it('keeps both rooms, their objects and doorway reachable after moving a shared partition', () => {
    const original = createBuilding();
    const result = validatePlacement(
      original,
      edit([{ type: 'move-partition', wallId: 'partition', position: 6.4 }]),
    );
    expect(result.compiled.doors.find((door) => door.id === 'bedroom-door')!.centre.x).toBeCloseTo(
      6.4,
    );
    expect(checkReachability(buildNavigation(result.compiled))).toEqual([]);
    expect(result.building.objects).toEqual(original.objects);
    expect(() =>
      validateBuilding(
        undoRevision(result.building, result.revision, {
          id: 'undo-partition',
          at: '2026-10-20T12:00:00Z',
        }).building,
      ),
    ).not.toThrow();
  });

  it('validates door clearance and accessible room routes after relocating or resizing an opening', () => {
    const original = createBuilding(),
      valid = {
        type: 'set-opening' as const,
        wallId: 'partition',
        openingId: 'bedroom-door',
        offset: 2.4,
        width: 1.1,
        height: 2.2,
        sill: null,
      };
    expect(() => validatePlacement(original, edit([valid]))).not.toThrow();
    expect(() => validatePlacement(original, edit([{ ...valid, width: 0.4 }]))).toThrow(
      'too small',
    );
    expect(() => validatePlacement(original, edit([{ ...valid, height: 1.4 }]))).toThrow(
      'too small',
    );
    expect(() =>
      validatePlacement(original, edit([{ ...valid, offset: 4, width: 1.2 }])),
    ).toThrow();
  });

  it('rejects partitions that consume user furniture or the player while preserving the original house', () => {
    const original = createBuilding(),
      before = structuredClone(original);
    expect(() =>
      validatePlacement(
        original,
        edit([{ type: 'move-partition', wallId: 'partition', position: 4.8 }]),
      ),
    ).toThrow('outside its room');
    expect(() =>
      validatePlacement(
        original,
        edit([{ type: 'move-partition', wallId: 'partition', position: 6.4 }]),
        {},
        { floorId: 'ground', position: { x: 6.4, y: 0, z: 4 } },
      ),
    ).toThrow('player');
    expect(original).toEqual(before);
  });

  it('rejects moving a facade window across an adjoining room partition', () => {
    const original = createBuilding();
    expect(() => validateBuilding(original)).not.toThrow();
    expect(() =>
      validatePlacement(
        original,
        edit([
          {
            type: 'set-opening',
            wallId: 'south',
            openingId: 'window',
            offset: 5.7,
            width: 1.5,
            height: 1,
            sill: 1,
          },
        ]),
      ),
    ).toThrow('adjoining wall or partition');
  });

  it('requires moving wall-mounted items with a divider and accepts the complete reversible edit', () => {
    const original = createBuilding(),
      television = original.objects.find((object) => object.id === 'tv')!;
    television.position.x = 5.8;
    television.rotation = -Math.PI / 2;
    expect(() => validateBuilding(original)).not.toThrow();
    const partition = { type: 'move-partition' as const, wallId: 'partition', position: 6.4 };
    expect(() => validatePlacement(original, edit([partition]))).toThrow('wall-mounted');
    const result = validatePlacement(
      original,
      edit([
        {
          type: 'move-object',
          objectId: television.id,
          roomId: television.roomId,
          position: { ...television.position, x: 6.2 },
          rotation: television.rotation,
        },
        partition,
      ]),
    );
    expect(result.building.objects.find((object) => object.id === television.id)!.position.x).toBe(
      6.2,
    );
    expect(() =>
      validateBuilding(
        undoRevision(result.building, result.revision, {
          id: 'undo-mounted-wall',
          at: '2026-10-20T12:00:00Z',
        }).building,
      ),
    ).not.toThrow();
  });
});
