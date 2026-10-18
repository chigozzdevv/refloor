export const walkInput = {
  keys: new Set<string>(),
  axis: { forward: 0, right: 0 },
  view: { x: 0, z: 1 },
  yaw: 0,
  pitch: 0,
  dragged: false,
};
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest('input, textarea, select, [contenteditable="true"]')
  );
}
