export function fogRange(mode: 'entry' | 'orbit' | 'walk', distance: number, radius: number) {
  const near = mode === 'orbit' ? Math.max(45, distance + radius + 0.5) : 45;
  return { near, far: near + 95 };
}
