import { describe, expect, it } from 'vitest';
import { applyCommands, fingerprintBuilding, parseBuilding, undoRevision } from '@refloor/scene';
import type { Building, SceneCommand, SceneRule } from '@refloor/scene';
import { createBuilding, getObject } from '@scene-test/fixtures';

function change(building: Building, commands: SceneCommand[]) {
  return applyCommands(building, {
    id: crypto.randomUUID(),
    at: '2026-10-20T12:00:00Z',
    expectedRevision: building.revision,
    commands,
  });
}

function configure(actions: SceneRule['actions']) {
  const rule: SceneRule = {
    id: 'click-action',
    label: 'Adjust on each click',
    enabled: true,
    trigger: { kind: 'object-click', objectId: 'sofa' },
    conditions: [],
    actions,
  };
  return change(createBuilding(), [{ type: 'set-rules', rules: [rule] }]).building;
}

const click: SceneCommand = {
  type: 'emit-event',
  event: { kind: 'object-click', objectId: 'sofa' },
};

describe('relative saved actions', () => {
  it('moves and turns from the current state on every trigger after serialization', () => {
    const configured = configure([
      { type: 'translate-object', objectId: 'sofa', delta: { x: 0.25, y: 0, z: 0 } },
      { type: 'turn-object', objectId: 'sofa', radians: Math.PI / 12 },
    ]);
    const portable = parseBuilding(JSON.parse(JSON.stringify(configured)));
    const first = change(portable, [click]);
    const moved = change(first.building, [
      {
        type: 'move-object',
        objectId: 'sofa',
        roomId: 'living',
        position: { x: 3, y: 0, z: 2 },
        rotation: Math.PI / 2,
      },
    ]);
    const second = change(moved.building, [click]);
    expect(getObject(first.building, 'sofa').position.x).toBeCloseTo(2.25);
    expect(getObject(second.building, 'sofa').position.x).toBeCloseTo(3.25);
    expect(getObject(second.building, 'sofa').rotation).toBeCloseTo(Math.PI / 2 + Math.PI / 12);
    expect(second.revision.commands.map((command) => command.type)).toEqual([
      'emit-event',
      'move-object',
      'rotate-object',
    ]);
    const restored = undoRevision(second.building, second.revision, {
      id: 'undo-click',
      at: '2026-10-20T12:01:00Z',
    });
    expect(fingerprintBuilding(restored.building)).toBe(fingerprintBuilding(moved.building));
    const redone = undoRevision(restored.building, restored.revision, {
      id: 'redo-click',
      at: '2026-10-20T12:02:00Z',
    });
    expect(fingerprintBuilding(redone.building)).toBe(fingerprintBuilding(second.building));
  });

  it('resolves sequential changes in a rule against the immediately preceding result', () => {
    const configured = configure([
      { type: 'translate-object', objectId: 'sofa', delta: { x: 0.25, y: 0, z: 0 } },
      { type: 'translate-object', objectId: 'sofa', delta: { x: 0.25, y: 0, z: 0 } },
    ]);
    expect(getObject(change(configured, [click]).building, 'sofa').position.x).toBeCloseTo(2.5);
  });

  it('adjusts brightness and volume repeatedly within their limits without changing power', () => {
    const configured = configure([
      {
        type: 'adjust-light-intensity',
        objectId: 'lamp',
        delta: 0.75,
        limits: { min: 0, max: 4 },
      },
      { type: 'adjust-television-volume', objectId: 'tv', delta: -0.2 },
    ]);
    let building = configured;
    for (let count = 0; count < 4; count++) building = change(building, [click]).building;
    expect(getObject(building, 'lamp').behaviours).toEqual([
      { kind: 'light', state: { powered: true, intensity: 4, color: '#ffffff' } },
    ]);
    expect(getObject(building, 'tv').behaviours[0]!.state).toMatchObject({
      powered: false,
      volume: 0,
    });
    expect(configured.rules![0]!.actions[0]).toMatchObject({
      type: 'adjust-light-intensity',
      delta: 0.75,
    });
  });

  it('rejects impossible triggered positions atomically and rejects unsupported capabilities', () => {
    const configured = configure([
      { type: 'set-light', objectId: 'lamp', state: { powered: false } },
      { type: 'translate-object', objectId: 'sofa', delta: { x: 100, y: 0, z: 0 } },
    ]);
    const original = structuredClone(configured);
    expect(() => change(configured, [click])).toThrow();
    expect(configured).toEqual(original);
    expect(() =>
      configure([
        { type: 'adjust-light-intensity', objectId: 'sofa', delta: 1, limits: { min: 0, max: 4 } },
      ]),
    ).toThrow();
  });
});
