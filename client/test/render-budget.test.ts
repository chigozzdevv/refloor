import { describe, expect, it } from 'vitest';
import { FrameBudget, renderBudget } from '@/shared/scene/render-budget';

const desktop = {
  width: 1440,
  height: 900,
  devicePixelRatio: 2,
  maxSamples: 8,
  maxTextureSize: 8192,
  quality: 'high' as const,
  reduction: 0,
};

describe('render target budget', () => {
  it('retains high desktop shadows, reflections and edge smoothing within a four-megapixel target', () => {
    const settings = renderBudget(desktop);
    expect(settings).toMatchObject({
      compact: false,
      dpr: 1.75,
      multisampling: 4,
      sunlightResolution: 2048,
      mirrorResolution: 512,
      softShadows: true,
      landscapeQuality: 'high',
      ambientOcclusion: true,
      bloom: true,
    });
    expect(desktop.width * desktop.height * settings.dpr ** 2).toBeLessThanOrEqual(4_000_000);
  });

  it('bounds portrait and landscape phone targets without relying on browser identity', () => {
    for (const [width, height] of [
      [390, 844],
      [844, 390],
    ]) {
      const settings = renderBudget({
        ...desktop,
        width: width!,
        height: height!,
        devicePixelRatio: 3,
      });
      expect(settings).toMatchObject({
        compact: true,
        dpr: 1.25,
        multisampling: 0,
        sunlightResolution: 1024,
        mirrorResolution: 256,
        softShadows: false,
        landscapeQuality: 'balanced',
      });
      expect(width! * height! * settings.dpr ** 2).toBeLessThanOrEqual(1_200_000);
    }
  });

  it('does not allocate device-scale targets at 4K and respects small maximum texture dimensions', () => {
    for (const maximum of [2048, 8192]) {
      const settings = renderBudget({
        ...desktop,
        width: 3840,
        height: 2160,
        maxTextureSize: maximum,
      });
      expect(3840 * 2160 * settings.dpr ** 2).toBeLessThanOrEqual(4_000_000);
      expect(3840 * settings.dpr).toBeLessThanOrEqual(maximum);
      expect(2160 * settings.dpr).toBeLessThanOrEqual(maximum);
    }
  });

  it('reduces raster work before expensive effects and keeps every level bounded', () => {
    const settings = [0, 1, 2, 3].map((reduction) => renderBudget({ ...desktop, reduction }));
    expect(settings.map((value) => value.dpr)).toEqual([1.75, 1.48, 1.22, 1.05]);
    expect(settings[1]!.softShadows).toBe(true);
    expect(settings[2]!.softShadows).toBe(false);
    expect(settings[2]!.landscapeQuality).toBe('balanced');
    expect(settings[3]!.mirrorResolution).toBe(256);
    expect(settings[2]!.ambientOcclusion).toBe(true);
    expect(settings[3]!.ambientOcclusion).toBe(false);
    expect(settings[3]!.bloom).toBe(false);
    expect(renderBudget({ ...desktop, reduction: 100 })).toEqual(settings[3]);
    expect(renderBudget({ ...desktop, maxSamples: 2 }).multisampling).toBe(2);
  });

  it('keeps compact views at native-scale clarity when frame pressure comes from draw submission', () => {
    for (const native of [1, 2, 3]) {
      const levels = [0, 1, 2, 3].map((reduction) =>
        renderBudget({
          ...desktop,
          width: 390,
          height: 844,
          devicePixelRatio: native,
          reduction,
        }),
      );
      expect(levels.every((settings) => settings.dpr >= 1)).toBe(true);
      expect(levels[3]!.ambientOcclusion).toBe(false);
      expect(levels[3]!.bloom).toBe(false);
      expect(levels[3]!.mirrorResolution).toBe(256);
    }
    const limited = renderBudget({
      ...desktop,
      width: 3840,
      height: 2160,
      reduction: 3,
    });
    expect(limited.dpr).toBeLessThan(0.85);
    expect(3840 * 2160 * limited.dpr ** 2).toBeLessThanOrEqual(4_000_000);
  });
});

describe('measured frame adaptation', () => {
  function run(budget: FrameBudget, milliseconds: number, duration: number, from = 0) {
    let now = from;
    const samples = [];
    while (now < from + duration) {
      now += milliseconds;
      const sample = budget.sample(milliseconds, now);
      if (sample) samples.push(sample);
    }
    return { now, samples };
  }

  it('requires sustained slow frames, ignores individual loading stalls and has a recovery cooldown', () => {
    const budget = new FrameBudget();
    const first = run(budget, 35, 2100);
    expect(budget.reduction).toBe(0);
    const second = run(budget, 35, 2100, first.now);
    expect(budget.reduction).toBe(1);
    expect(second.samples.at(-1)?.fps).toBeCloseTo(1000 / 35);
    run(budget, 35, 3000, second.now);
    expect(budget.reduction).toBe(1);
    budget.sample(700, second.now + 3100);
    expect(budget.reduction).toBe(1);
  });

  it('recovers slowly after fast frames rather than oscillating around the downgrade threshold', () => {
    const budget = new FrameBudget();
    const slow = run(budget, 35, 4200);
    expect(budget.reduction).toBe(1);
    const fast = run(budget, 16, 17_000, slow.now);
    expect(budget.reduction).toBe(1);
    run(budget, 16, 5000, fast.now);
    expect(budget.reduction).toBe(0);
  });

  it('responds to a persistently stalled renderer while ignoring one isolated long frame', () => {
    const budget = new FrameBudget();
    expect(budget.sample(700, 700)).toBeNull();
    run(budget, 16, 3000, 700);
    expect(budget.reduction).toBe(0);
    expect(budget.sample(400, 4100)).toBeNull();
    expect(budget.sample(400, 4500)).toBeNull();
    expect(budget.sample(400, 4900)?.reduction).toBe(1);
  });

  it('discards paused-tab cadence and startup samples while preserving the current reduction', () => {
    const budget = new FrameBudget();
    run(budget, 35, 4200);
    expect(budget.reduction).toBe(1);
    budget.reset(100_000);
    expect(run(budget, 50, 1900, 100_000).samples).toHaveLength(0);
    expect(budget.reduction).toBe(1);
    expect(budget.sample(5000, 102_100)).toBeNull();
    expect(run(budget, 16, 900, 102_100).samples).toHaveLength(0);
    expect(budget.reduction).toBe(1);
  });
});
