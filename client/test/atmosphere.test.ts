import { describe, expect, it } from 'vitest';
import { fogRange } from '@/shared/scene/atmosphere';

describe('house atmosphere', () => {
  it('preserves walking and entrance atmosphere regardless of overview distance', () => {
    for (const mode of ['walk', 'entry'] as const)
      for (const distance of [0, 30, 150])
        expect(fogRange(mode, distance, 20)).toEqual({ near: 45, far: 140 });
    expect(fogRange('orbit', 20, 10)).toEqual({ near: 45, far: 140 });
  });

  it('keeps the complete house and compound clear when portrait framing moves the camera back', () => {
    const radius = 18;
    for (const distance of [45, 110, 180]) {
      const range = fogRange('orbit', distance, radius);
      expect(range.near).toBeGreaterThan(distance + radius);
      expect(range.far - range.near).toBe(95);
    }
  });
});
