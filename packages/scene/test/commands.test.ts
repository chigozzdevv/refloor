import { describe, expect, it } from 'vitest';
import {
  applyCommands,
  getObjectAsset,
  getObjectCapabilities,
  parseBuilding,
  SceneError,
  undoRevision,
} from '@refloor/scene';
import type { SceneCommand } from '@refloor/scene';
import {
  createBuilding,
  createChair,
  createTwoStorey,
  edit,
  finish,
  first,
  getObject,
} from '@scene-test/fixtures';

const metadata = { id: 'undo-1', at: '2026-10-18T12:01:00Z' };
const replacement = getObjectAsset(createChair());
const commands: [string, SceneCommand][] = [
  ['add an object', { type: 'add-object', object: createChair(), index: 1 }],
  ['remove an object', { type: 'remove-object', objectId: 'sofa' }],
  [
    'move an object',
    {
      type: 'move-object',
      objectId: 'sofa',
      roomId: 'living',
      position: { x: 3, y: 0, z: 2 },
      rotation: 0,
    },
  ],
  ['rotate an object', { type: 'rotate-object', objectId: 'sofa', rotation: Math.PI / 2 }],
  [
    'resize an object',
    { type: 'resize-object', objectId: 'sofa', dimensions: { width: 2.5, height: 1, depth: 1 } },
  ],
  ['replace an asset', { type: 'replace-object', objectId: 'sofa', asset: replacement }],
  [
    'change an object material',
    {
      type: 'set-object-material',
      objectId: 'sofa',
      slot: 'body',
      material: { ...finish, color: '#123456' },
    },
  ],
  [
    'change a wall material',
    { type: 'set-wall-material', wallId: 'south', material: { ...finish, color: '#123456' } },
  ],
  ['open a door', { type: 'set-door', doorId: 'entrance', open: true }],
  [
    'change TV state',
    {
      type: 'set-television',
      objectId: 'tv',
      state: { powered: true, muted: false, source: 'https://example.org/video.mp4' },
    },
  ],
  [
    'change light state',
    {
      type: 'set-light',
      objectId: 'lamp',
      state: { powered: false, intensity: 0.5, color: '#ff0000' },
    },
  ],
];

describe('scene commands', () => {
  it.each(commands)('can %s and restore the exact original content', (_, command) => {
    const original = createBuilding();
    const result = applyCommands(original, edit([command]));
    expect(result.building.revision).toBe(1);
    expect(result.building).not.toEqual(original);
    const restored = undoRevision(
      JSON.parse(JSON.stringify(result.building)),
      JSON.parse(JSON.stringify(result.revision)),
      metadata,
    );
    expect(restored.building).toEqual({ ...original, revision: 2 });
    expect(original).toEqual(createBuilding());
  });

  it('preserves identity and placement when replacing an asset', () => {
    const original = createBuilding(),
      old = getObject(original, 'sofa');
    const result = applyCommands(
      original,
      edit([{ type: 'replace-object', objectId: 'sofa', asset: replacement }]),
    );
    const next = getObject(result.building, 'sofa');
    expect(next).toMatchObject({
      id: old.id,
      floorId: old.floorId,
      roomId: old.roomId,
      position: old.position,
      rotation: old.rotation,
      assetId: replacement.assetId,
    });
    expect(result.building.objects.filter((value) => value.id !== 'sofa')).toEqual(
      original.objects.filter((value) => value.id !== 'sofa'),
    );
  });

  it('moves between rooms and derives the destination floor', () => {
    const result = applyCommands(
      createTwoStorey(),
      edit([
        {
          type: 'move-object',
          objectId: 'sofa',
          roomId: 'upper-bedroom',
          position: { x: 8, y: 0, z: 3 },
          rotation: 0,
        },
      ]),
    );
    expect(getObject(result.building, 'sofa')).toMatchObject({
      floorId: 'upper',
      roomId: 'upper-bedroom',
    });
  });

  it('applies multiple edits as one revision and undoes them in reverse order', () => {
    const original = createBuilding();
    const result = applyCommands(
      original,
      edit([
        {
          type: 'move-object',
          objectId: 'sofa',
          roomId: 'living',
          position: { x: 3, y: 0, z: 2 },
          rotation: 0,
        },
        {
          type: 'set-object-material',
          objectId: 'sofa',
          slot: 'body',
          material: { ...finish, color: '#000000' },
        },
        { type: 'remove-object', objectId: 'tv' },
      ]),
    );
    expect(result.revision.inverseCommands.map((command) => command.type)).toEqual([
      'add-object',
      'set-object-material',
      'move-object',
    ]);
    expect(undoRevision(result.building, result.revision, metadata).building).toEqual({
      ...original,
      revision: 2,
    });
  });

  it('leaves the input untouched when a later command fails', () => {
    const original = createBuilding(),
      copy = structuredClone(original);
    expect(() =>
      applyCommands(
        original,
        edit([
          { type: 'set-door', doorId: 'entrance', open: true },
          {
            type: 'move-object',
            objectId: 'sofa',
            roomId: 'living',
            position: { x: 30, y: 0, z: 2 },
            rotation: 0,
          },
        ]),
      ),
    ).toThrow();
    expect(original).toEqual(copy);
  });

  it('rejects stale edits', () => {
    const result = applyCommands(
      createBuilding(),
      edit([{ type: 'set-door', doorId: 'entrance', open: true }]),
    );
    expect(() =>
      applyCommands(result.building, edit([{ type: 'remove-object', objectId: 'sofa' }])),
    ).toThrowError(expect.objectContaining({ code: 'REVISION_CONFLICT' }));
  });

  const invalid: [string, unknown][] = [
    ['missing object', { type: 'remove-object', objectId: 'missing' }],
    [
      'missing room',
      {
        type: 'move-object',
        objectId: 'sofa',
        roomId: 'missing',
        position: { x: 2, y: 0, z: 2 },
        rotation: 0,
      },
    ],
    ['missing wall', { type: 'set-wall-material', wallId: 'missing', material: finish }],
    ['missing door', { type: 'set-door', doorId: 'missing', open: true }],
    ['window as door', { type: 'set-door', doorId: 'window', open: true }],
    [
      'unsupported television action',
      { type: 'set-television', objectId: 'sofa', state: { powered: true } },
    ],
    ['unsupported light action', { type: 'set-light', objectId: 'sofa', state: { powered: true } }],
    ['empty television action', { type: 'set-television', objectId: 'tv', state: {} }],
    [
      'unsafe media URL',
      { type: 'set-television', objectId: 'tv', state: { source: 'javascript:alert(1)' } },
    ],
    ['invalid volume', { type: 'set-television', objectId: 'tv', state: { volume: 2 } }],
    [
      'missing material slot',
      { type: 'set-object-material', objectId: 'sofa', slot: 'missing', material: finish },
    ],
    [
      'inherited material property',
      { type: 'set-object-material', objectId: 'sofa', slot: 'constructor', material: finish },
    ],
    ['invalid insert position', { type: 'add-object', object: createChair(), index: 100 }],
    ['duplicate object identity', { type: 'add-object', object: { ...createChair(), id: 'sofa' } }],
    [
      'structural identity collision',
      { type: 'add-object', object: { ...createChair(), id: 'south' } },
    ],
    [
      'invalid replacement bounds',
      {
        type: 'replace-object',
        objectId: 'sofa',
        asset: { ...replacement, dimensions: { width: 100, height: 1, depth: 1 } },
      },
    ],
    ['unknown command', { type: 'execute-code', source: 'anything' }],
  ];
  it.each(invalid)('rejects %s without mutation', (_, command) => {
    const original = createBuilding();
    expect(() => applyCommands(original, { ...edit([]), commands: [command] })).toThrow();
    expect(original).toEqual(createBuilding());
  });

  it('rejects an empty command batch', () => {
    expect(() => applyCommands(createBuilding(), edit([]))).toThrow();
  });

  it('exposes only declared device actions', () => {
    const building = parseBuilding(createBuilding());
    expect(getObjectCapabilities(getObject(building, 'tv'))).toContain('television');
    expect(getObjectCapabilities(getObject(building, 'sofa'))).not.toContain('television');
  });

  it('returns domain errors for unsupported device actions', () => {
    expect(() =>
      applyCommands(
        createBuilding(),
        edit([{ type: 'set-light', objectId: 'sofa', state: { powered: false } }]),
      ),
    ).toThrowError(SceneError);
  });

  it('retains the configured screen binding after a power command', () => {
    const result = applyCommands(
      createBuilding(),
      edit([{ type: 'set-television', objectId: 'tv', state: { powered: true } }]),
    );
    expect(first(getObject(result.building, 'tv').behaviours)).toMatchObject({
      kind: 'television',
      screenNode: 'screen',
      state: { powered: true, muted: true, volume: 0.5 },
    });
  });
});
