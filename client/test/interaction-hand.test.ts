import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type * as React from 'react';
import { InteractionHand } from '@/components/editor/interaction-hand';
import { handScale, handSleeveLength, interactionHand } from '@/shared/editor/interaction-hand';
import { useProject } from '@/shared/scene/scene-store';
import { useNavigation } from '@/shared/navigation/navigation-store';

const effect = vi.hoisted(() => ({ dispose: undefined as (() => void) | undefined }));
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useEffect: (run: () => () => void) => {
    effect.dispose = run();
  },
}));

class Surface extends EventTarget {
  constructor(private readonly kind: string) {
    super();
  }
  closest(selector: string) {
    return selector.split(', ').includes(this.kind) ? this : null;
  }
  getBoundingClientRect() {
    return { x: 300, y: 250, width: 40, height: 40 };
  }
}
const project = useProject.getState(),
  navigation = useNavigation.getState();
let page: EventTarget, browser: EventTarget;
function send(type: string, target: Surface, properties: Record<string, unknown> = {}) {
  const event = new Event(type);
  for (const [key, value] of Object.entries({
    target,
    pointerType: 'mouse',
    pointerId: 1,
    button: 0,
    clientX: 320,
    clientY: 270,
    detail: 1,
    ...properties,
  }))
    Object.defineProperty(event, key, { value });
  page.dispatchEvent(event);
}
beforeEach(() => {
  vi.useFakeTimers();
  page = new EventTarget();
  browser = Object.assign(new EventTarget(), { innerWidth: 1000, innerHeight: 1000 });
  vi.stubGlobal('document', page);
  vi.stubGlobal('window', browser);
  vi.stubGlobal('Element', Surface);
  useProject.setState({ mode: 'walk', selection: null });
  useNavigation.setState({ panelOpen: false, mapOpen: false });
});
afterEach(() => {
  effect.dispose?.();
  useProject.setState(project, true);
  useNavigation.setState(navigation, true);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each(['canvas', '.door-handle-hint', '.fixture-handle', '.navigation-marker', '.portal-action'])(
  'observes %s clicks before scene buttons can stop propagation and aims at the click',
  async (kind) => {
    const listener = vi.spyOn(page, 'addEventListener');
    InteractionHand();
    expect(listener).toHaveBeenCalledWith('click', expect.any(Function), true);
    expect(listener).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    const surface = new Surface(kind);
    send('pointerdown', surface);
    expect(interactionHand.pressed).toBe(true);
    send('click', surface);
    expect(interactionHand.pressed).toBe(true);
    expect(interactionHand.aim).toEqual({ x: 0.32, y: 0.27 });
    await vi.advanceTimersByTimeAsync(220);
    expect(interactionHand.pressed).toBe(false);
  },
);

it('does not turn a camera drag into a hand tap, even after returning to the starting point', () => {
  InteractionHand();
  const surface = new Surface('canvas');
  send('pointerdown', surface);
  send('pointermove', surface, { clientX: 360 });
  send('pointermove', surface);
  send('click', surface);
  expect(interactionHand.pressed).toBe(false);
});

it('responds to keyboard activation at the scene button centre without a mouse gesture', () => {
  InteractionHand();
  send('click', new Surface('.door-handle-hint'), { detail: 0, clientX: 0, clientY: 0 });
  expect(interactionHand.aim).toEqual({ x: 0.32, y: 0.27 });
  expect(interactionHand.pressed).toBe(true);
});

it('leaves movement controls and chat inputs alone', () => {
  InteractionHand();
  for (const kind of ['.movement-pad', 'textarea']) {
    const surface = new Surface(kind);
    send('pointerdown', surface);
    send('click', surface);
    expect(interactionHand.pressed).toBe(false);
  }
});

it('clears a press and its timer if the browser loses focus', () => {
  InteractionHand();
  const surface = new Surface('canvas');
  send('pointerdown', surface);
  send('click', surface);
  browser.dispatchEvent(new Event('blur'));
  expect(interactionHand.pressed).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([120, 300, 650])(
  'keeps the sleeve connected to the lower screen edge when reaching to height %s',
  (top) => {
    const height = 754,
      direction = -0.84;
    const length = handSleeveLength(top, direction, height);
    expect(top + length * direction * 1100 * handScale(height)).toBeLessThanOrEqual(-39.99);
    expect(length).toBeGreaterThanOrEqual(0.19);
  },
);
