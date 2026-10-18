import { compileBuilding } from '@refloor/engine';
import type { Building } from '@refloor/scene';
import type { EngineOptions, NavigationPoint } from '@refloor/engine';
import { completeFurnishings } from '@/shared/editor/furnishings';

self.onmessage = async (
  event: MessageEvent<{ building: Building; options: EngineOptions; player?: NavigationPoint }>,
) => {
  try {
    const { building, options, player } = event.data;
    const result = await completeFurnishings(compileBuilding(building, options), player);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Furnishings could not be completed.',
    });
  }
};
