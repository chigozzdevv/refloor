export const walkInput = {
  keys: new Set<string>(),
  view: { x: 0, z: 1 },
  yaw: 0,
  pitch: 0,
  pad: { x: 0, y: 0 },
  turn: 0,
};

export function joystickVector(x: number, y: number, radius: number) {
  const distance = Math.hypot(x, y),
    deadzone = radius * 0.12;
  if (distance <= deadzone) return { x: 0, y: 0 };
  const strength = Math.min(1, (distance - deadzone) / (radius - deadzone));
  return { x: (x / distance) * strength, y: (-y / distance) * strength };
}

export function movementInput() {
  const { keys, pad } = walkInput;
  const x = Number(keys.has('d')) - Number(keys.has('a')) + pad.x;
  const y =
    Number(keys.has('w') || keys.has('arrowup')) -
    Number(keys.has('s') || keys.has('arrowdown')) +
    pad.y;
  const length = Math.max(1, Math.hypot(x, y));
  return { x: x / length, y: y / length };
}

export function turningInput() {
  const { keys, turn } = walkInput;
  return Math.max(
    -1,
    Math.min(1, Number(keys.has('arrowright')) - Number(keys.has('arrowleft')) + turn),
  );
}

export function resetWalkInput() {
  walkInput.keys.clear();
  walkInput.pad = { x: 0, y: 0 };
  walkInput.turn = 0;
}
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest('input, textarea, select, [contenteditable="true"]')
  );
}
