const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

export class DoorMotion {
  fraction: number;
  handle = 0;
  private open: boolean;
  private origin: number;
  private elapsed = 1;
  private handleElapsed = 1;
  private holding = false;

  constructor(open: boolean) {
    this.open = open;
    this.fraction = this.origin = Number(open);
  }

  press() {
    this.handleElapsed = 0;
  }

  step(
    open: boolean,
    delta: number,
    blocked: (fraction: number) => boolean,
    preview?: number | null,
    holding = false,
  ) {
    const dt = Math.min(delta, 0.05);
    if (open !== this.open) {
      this.open = open;
      this.origin = this.fraction;
      this.elapsed = 0;
      if (open && this.handleElapsed >= 0.28) this.press();
    }
    if (this.holding && !holding) this.handleElapsed = 0.1;
    this.holding = holding;
    this.handleElapsed += dt;
    this.handle = holding
      ? ease(this.handleElapsed / 0.08)
      : this.handleElapsed < 0.1
        ? ease(this.handleElapsed / 0.08)
        : 1 - ease((this.handleElapsed - 0.1) / 0.18);
    const nextTime = this.elapsed + dt;
    const progress = ease((nextTime - (open ? 0.08 : 0)) / (open ? 0.32 : 0.28));
    const next = preview ?? this.origin + (Number(open) - this.origin) * progress;
    const steps = Math.max(1, Math.ceil(Math.abs(next - this.fraction) / 0.04));
    for (let step = 1; step <= steps; step++)
      if (blocked(this.fraction + ((next - this.fraction) * step) / steps)) return false;
    this.fraction = next;
    this.elapsed = nextTime;
    if (preview !== null && preview !== undefined) {
      this.origin = next;
      this.elapsed = 0;
    }
    return true;
  }
}
