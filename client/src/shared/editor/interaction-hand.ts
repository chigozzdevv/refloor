export const interactionHand = {
  x: 0.68,
  y: 0,
  turn: 0,
  pressed: false,
  aim: { x: 0.68, y: 0.7 },
};
let pointer: MediaQueryList | undefined;

export const handScale = (height: number) => Math.min(1, height / 900);
export const handChatHeight = (height: number) => 296 * handScale(height);

export function handSleeveLength(top: number, direction: number, height: number) {
  const downward = -direction * 1100 * handScale(height);
  return downward > 1 ? Math.max(0.19, (top + 40) / downward) : 0.19;
}

export function handPointer(x: number, y: number, width: number, height: number) {
  const horizontal = (Math.max(0, Math.min(1, x / width)) - 0.5) * 240;
  return {
    x: 0.68 + horizontal / width,
    y: (Math.max(0, Math.min(1, y / height)) - 0.5) * 80,
    turn: horizontal * 0.075,
    aim: { x: x / width, y: y / height },
  };
}

export function handTap(start: { x: number; y: number }, end: { x: number; y: number }) {
  return Math.hypot(end.x - start.x, end.y - start.y) <= 6;
}

export function isHandSurface(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'canvas, .door-handle-hint, .fixture-handle, .navigation-marker, .portal-action',
      ),
    )
  );
}

export function showInteractionHand(width: number, height: number) {
  return (
    width >= 800 &&
    height >= 560 &&
    (pointer ??= window.matchMedia('(hover: hover) and (pointer: fine)')).matches
  );
}
