export const interactionHand = { x: 0.68, y: 0, turn: 0, pressed: false };
let pointer: MediaQueryList | undefined;

export const handScale = (height: number) => Math.min(1, height / 900);
export const handChatHeight = (height: number) => 296 * handScale(height);

export function showInteractionHand(width: number, height: number) {
  return (
    width >= 800 &&
    height >= 560 &&
    (pointer ??= window.matchMedia('(hover: hover) and (pointer: fine)')).matches
  );
}
