import { fail } from '@refloor/engine/errors';
import type { EngineOptions } from '@refloor/engine/types';

export const defaultOptions: Readonly<EngineOptions> = Object.freeze({
  radius: 0.3,
  height: 1.75,
  stepHeight: 0.2,
  minTreadDepth: 0.25,
  headroom: 1.9,
  clearance: 0.02,
  resolution: 0.2,
  maxNodes: 40_000,
  maxParts: 10_000,
});

export function resolveOptions(input: Partial<EngineOptions> = {}): EngineOptions {
  const options = { ...defaultOptions, ...input };
  for (const [key, value] of Object.entries(options)) {
    if (!Object.hasOwn(defaultOptions, key) || !Number.isFinite(value) || value <= 0)
      fail('INVALID_OPTIONS', key, 'Engine options must be finite positive numbers');
  }
  if (
    options.height <= 2 * options.radius ||
    options.headroom < options.height ||
    options.stepHeight >= options.height / 2 ||
    options.resolution > options.radius ||
    !Number.isInteger(options.maxNodes) ||
    !Number.isInteger(options.maxParts)
  )
    fail(
      'INVALID_OPTIONS',
      'profile',
      'Walker dimensions, resolution or resource limits are inconsistent',
    );
  return options;
}
