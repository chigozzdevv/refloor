import { describe, expect, it } from 'vitest';
import { watchDoorDragCancellation } from '@/shared/behaviours/door-drag';

describe('door drag cancellation', () => {
  it.each(['capture loss', 'window blur', 'pointer cancellation', 'hidden page'])(
    'releases a held interaction after %s without requiring a pointer-up event',
    (interruption) => {
      const canvas = new EventTarget(),
        window = new EventTarget(),
        document = new EventTarget();
      let interacting = true,
        hidden = false;
      const stop = watchDoorDragCancellation(
        { canvas, window, document, hidden: () => hidden },
        () => {
          interacting = false;
        },
      );
      if (interruption === 'capture loss') canvas.dispatchEvent(new Event('lostpointercapture'));
      if (interruption === 'window blur') window.dispatchEvent(new Event('blur'));
      if (interruption === 'pointer cancellation') window.dispatchEvent(new Event('pointercancel'));
      if (interruption === 'hidden page') {
        hidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
      }
      expect(interacting).toBe(false);
      stop();
    },
  );

  it('leaves a visible-page interaction alone and removes every listener on unmount', () => {
    const canvas = new EventTarget(),
      window = new EventTarget(),
      document = new EventTarget();
    let cancellations = 0;
    const stop = watchDoorDragCancellation(
      { canvas, window, document, hidden: () => false },
      () => cancellations++,
    );
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cancellations).toBe(0);
    stop();
    expect(cancellations).toBe(1);
    for (const [target, event] of [
      [canvas, 'lostpointercapture'],
      [window, 'blur'],
      [window, 'pointercancel'],
      [document, 'visibilitychange'],
    ] as const)
      target.dispatchEvent(new Event(event));
    expect(cancellations).toBe(1);
  });
});
