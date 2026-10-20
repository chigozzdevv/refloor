export type RenderBudget = {
  compact: boolean;
  dpr: number;
  multisampling: number;
  sunlightResolution: number;
  mirrorResolution: number;
  mirrorInterval: number;
  softShadows: boolean;
  aoQuality: 'medium' | 'low';
  ambientOcclusion: boolean;
  bloom: boolean;
  landscapeQuality: 'high' | 'balanced';
};

export function renderBudget(input: {
  width: number;
  height: number;
  devicePixelRatio: number;
  maxSamples: number;
  maxTextureSize: number;
  quality: 'high' | 'balanced';
  reduction: number;
}): RenderBudget {
  const width = Math.max(1, input.width),
    height = Math.max(1, input.height),
    compact = Math.min(width, height) <= 600 && width * height <= 700_000,
    reduction = Math.max(0, Math.min(3, Math.floor(input.reduction))),
    constrained = compact || input.quality === 'balanced' || reduction >= 2,
    pixels = compact ? 1_200_000 : input.quality === 'high' ? 4_000_000 : 2_500_000,
    cap = input.quality === 'balanced' ? 1 : compact ? 1.25 : 1.75,
    native = Math.max(0.25, input.devicePixelRatio || 1),
    textureSize = Math.max(1, input.maxTextureSize),
    maximum = Math.min(
      cap,
      native,
      Math.sqrt(pixels / (width * height)),
      textureSize / width,
      textureSize / height,
    ),
    minimum = Math.min(maximum, compact ? 1 : 0.85),
    dpr = Math.max(
      Math.floor(minimum * 100) / 100,
      Math.floor(maximum * [1, 0.85, 0.7, 0.6][reduction]! * 100) / 100,
    );
  return {
    compact,
    dpr,
    multisampling: constrained ? 0 : Math.min(4, Math.max(0, input.maxSamples)),
    sunlightResolution: constrained ? 1024 : 2048,
    mirrorResolution: constrained ? 256 : 512,
    mirrorInterval: constrained ? 1000 / 15 : 1000 / 30,
    softShadows: !constrained,
    aoQuality: constrained ? 'low' : 'medium',
    ambientOcclusion: reduction < 3,
    bloom: reduction < 3,
    landscapeQuality: constrained ? 'balanced' : 'high',
  };
}

export type FrameSample = { fps: number; mean: number; p90: number; reduction: number };

export class FrameBudget {
  reduction = 0;
  private samples: number[] = [];
  private elapsed = 0;
  private slow = 0;
  private fast = 0;
  private stalls = 0;
  private resumeAt = 0;

  reset(now: number, grace = 2000) {
    this.samples = [];
    this.elapsed = 0;
    this.slow = 0;
    this.fast = 0;
    this.stalls = 0;
    this.resumeAt = now + grace;
  }

  sample(milliseconds: number, now: number): FrameSample | null {
    if (now < this.resumeAt || milliseconds <= 0) return null;
    if (milliseconds > 250) {
      this.stalls++;
      this.samples = [];
      this.elapsed = 0;
      this.slow = 0;
      this.fast = 0;
      if (this.stalls < 3) return null;
      this.reduction = Math.min(3, this.reduction + 1);
      this.reset(now, 4000);
      return {
        fps: 1000 / milliseconds,
        mean: milliseconds,
        p90: milliseconds,
        reduction: this.reduction,
      };
    }
    this.stalls = 0;
    this.samples.push(milliseconds);
    this.elapsed += milliseconds;
    if (this.elapsed < 2000 || this.samples.length < 24) return null;
    const sorted = [...this.samples].sort((a, b) => a - b),
      mean = this.elapsed / this.samples.length,
      p90 = sorted[Math.floor((sorted.length - 1) * 0.9)]!;
    this.slow = mean > 28 || p90 > 40 ? this.slow + 1 : 0;
    this.fast = mean < 19 && p90 < 24 ? this.fast + 1 : 0;
    const previous = this.reduction;
    if (this.slow >= 2) this.reduction = Math.min(3, this.reduction + 1);
    else if (this.fast >= 8) this.reduction = Math.max(0, this.reduction - 1);
    if (previous !== this.reduction) this.reset(now, 4000);
    this.samples = [];
    this.elapsed = 0;
    return { fps: 1000 / mean, mean, p90, reduction: this.reduction };
  }
}
