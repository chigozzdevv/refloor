import { describe, expect, it } from 'vitest';
import { compileBuilding } from '@refloor/engine';
import { createHouse } from '@refloor/catalogue/houses';
import { ScenePresentation } from '@/shared/scene/presentation';

const compiled = compileBuilding(
  createHouse({ id: 'presented-house', name: 'Presented house', storeys: 1 }),
);

describe('visible scene completion', () => {
  it('waits for the edited scene to commit and its frame to finish drawing', async () => {
    const presentation = new ScenePresentation(),
      controller = new AbortController();
    let done = false;
    const pending = presentation.waitFor(compiled, controller.signal).then(() => (done = true));
    presentation.frame(compiled);
    await Promise.resolve();
    expect(done).toBe(false);
    presentation.commit(compiled);
    expect(done).toBe(false);
    presentation.frame(compiled);
    expect(done).toBe(false);
    await pending;
    expect(done).toBe(true);
  });

  it('does not acknowledge the old scene while replacement assets are suspended', async () => {
    const presentation = new ScenePresentation(),
      next = { ...compiled, building: { ...compiled.building, revision: 1 } },
      controller = new AbortController();
    let done = false;
    presentation.commit(compiled);
    const pending = presentation.waitFor(next, controller.signal).then(() => (done = true));
    presentation.frame(compiled);
    await Promise.resolve();
    presentation.suspend(compiled);
    presentation.frame(next);
    await Promise.resolve();
    expect(done).toBe(false);
    presentation.commit(next);
    presentation.frame(next);
    await pending;
    expect(done).toBe(true);
  });

  it('waits for every finite fixture animation, including two refrigerator panels', async () => {
    const presentation = new ScenePresentation(),
      left = Symbol('left'),
      right = Symbol('right'),
      controller = new AbortController();
    let done = false;
    presentation.commit(compiled);
    presentation.motion(left, compiled.building.id, true, 'fridge');
    presentation.motion(right, compiled.building.id, true, 'fridge');
    expect(presentation.animating(compiled.building.id)).toBe(true);
    const pending = presentation
      .waitFor(compiled, controller.signal, new Set(['fridge']))
      .then(() => (done = true));
    presentation.frame(compiled);
    await Promise.resolve();
    expect(done).toBe(false);
    presentation.release(left);
    presentation.frame(compiled);
    await Promise.resolve();
    expect(done).toBe(false);
    presentation.motion(right, compiled.building.id, false, 'fridge');
    expect(presentation.animating(compiled.building.id)).toBe(false);
    presentation.frame(compiled);
    await pending;
    expect(done).toBe(true);
  });

  it('does not reuse an acknowledgement from an earlier copy of the same saved house', async () => {
    const presentation = new ScenePresentation(),
      reopened = { ...compiled, building: { ...compiled.building } },
      controller = new AbortController();
    presentation.commit(compiled);
    presentation.frame(compiled);
    await Promise.resolve();
    let done = false;
    const pending = presentation.waitFor(reopened, controller.signal).then(() => (done = true));
    presentation.frame(compiled);
    await Promise.resolve();
    expect(done).toBe(false);
    presentation.commit(reopened);
    presentation.frame(reopened);
    await pending;
    expect(done).toBe(true);
  });

  it('finishes against a later drawn revision without undoing concurrent manual changes', async () => {
    const presentation = new ScenePresentation(),
      next = { ...compiled, building: { ...compiled.building, revision: 2 } },
      controller = new AbortController(),
      pending = presentation.waitFor(compiled, controller.signal);
    presentation.commit(next);
    presentation.frame(next);
    await pending;
    expect(presentation.pending(compiled.building.id)).toBe(false);
  });

  it('cancels obsolete work when the project changes', async () => {
    const presentation = new ScenePresentation(),
      controller = new AbortController(),
      pending = presentation.waitFor(compiled, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow('no longer open');
    expect(presentation.pending(compiled.building.id)).toBe(false);
  });

  it('releases busy state on a blocked motion or renderer failure', async () => {
    const presentation = new ScenePresentation(),
      controller = new AbortController(),
      pending = presentation.waitFor(compiled, controller.signal);
    presentation.fail(new Error('The door is blocked.'), compiled.building.id);
    await expect(pending).rejects.toThrow('door is blocked');
    expect(presentation.pending(compiled.building.id)).toBe(false);
    const another = presentation.waitFor(compiled, controller.signal);
    presentation.fail(new Error('The renderer was closed.'));
    await expect(another).rejects.toThrow('renderer was closed');
  });
});
