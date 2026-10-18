import { describe, expect, it } from 'vitest';
import { fingerprintBuilding } from '@refloor/scene';
import { compileBuilding } from '@refloor/engine';
import { useProject } from '@/shared/scene/scene-store';

describe('scene and editor state integration', () => {
  it('applies and reverses real edits through the editor slice', () => {
    const original = useProject.getState().compiled.building;
    const wall = original.floors[0]!.walls[0]!;
    expect(
      useProject.getState().edit([
        {
          type: 'set-wall-material',
          wallId: wall.id,
          material: { ...wall.material, color: '#123456' },
        },
      ]),
    ).toBe(true);
    expect(useProject.getState().past).toHaveLength(1);
    useProject.getState().undo();
    expect(fingerprintBuilding(useProject.getState().compiled.building)).toBe(
      fingerprintBuilding(original),
    );
    expect(useProject.getState().future).toHaveLength(1);
    useProject.getState().redo();
    expect(useProject.getState().compiled.building.floors[0]!.walls[0]!.material.color).toBe(
      '#123456',
    );
  });

  it('clears editor selection and history when opening or creating another house', () => {
    const current = useProject.getState();
    current.select({ kind: 'object', id: current.compiled.building.objects[0]!.id });
    current.loadProject(compileBuilding(current.compiled.building));
    expect(useProject.getState()).toMatchObject({
      selection: null,
      past: [],
      future: [],
      remote: null,
      mode: 'entry',
    });
    useProject
      .getState()
      .select({ kind: 'wall', id: current.compiled.building.floors[0]!.walls[0]!.id });
    useProject.getState().createHome(1);
    expect(useProject.getState()).toMatchObject({
      selection: null,
      past: [],
      future: [],
      remote: null,
      mode: 'entry',
    });
    expect(useProject.getState().compiled.building.floors).toHaveLength(1);
  });
});
