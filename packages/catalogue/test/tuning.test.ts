import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { lightTuning, lightOutput, validateCommandTuning } from '@refloor/catalogue';

describe('fixture tuning limits', () => {
  it('caps output from legacy oversized settings without making the saved asset invalid', () => {
    const building = createHouse({ id: 'legacy-light', name: 'Legacy light', storeys: 1 }),
      object = building.objects.find((item) => item.kind === 'light')!,
      state = object.behaviours.find((item) => item.kind === 'light')!.state;
    expect(lightTuning(object)).toMatchObject({ min: 0, normal: 3, max: 6 });
    state.intensity = 100;
    expect(lightOutput(object)).toBe(6);
    state.intensity = 0;
    expect(lightOutput(object)).toBe(0);
    state.intensity = 3;
    state.powered = false;
    expect(lightOutput(object)).toBe(0);
  });
  it('rejects new adjustments beyond either bound and allows normal and maximum settings', () => {
    const building = createHouse({ id: 'bounded-light', name: 'Bounded light', storeys: 1 }),
      object = building.objects.find((item) => item.kind === 'light')!;
    for (const intensity of [-1, 6.01, 100, NaN, Infinity])
      expect(() =>
        validateCommandTuning(building, [
          { type: 'set-light', objectId: object.id, state: { intensity } },
        ]),
      ).toThrow('0% and 200%');
    for (const intensity of [0, 3, 6])
      expect(() =>
        validateCommandTuning(building, [
          { type: 'set-light', objectId: object.id, state: { intensity } },
        ]),
      ).not.toThrow();
  });
});
