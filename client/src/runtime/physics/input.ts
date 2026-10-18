export const walkInput = { keys: new Set<string>(), yaw: 0, pitch: 0, dragged: false };
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest('input, textarea, select, [contenteditable="true"]')
  );
}
