export const walkInput = {
  keys: new Set<string>(),
  view: { x: 0, z: 1 },
  yaw: 0,
  pitch: 0,
};
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest('input, textarea, select, [contenteditable="true"]')
  );
}
