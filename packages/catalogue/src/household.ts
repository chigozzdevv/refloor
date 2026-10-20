import type { Behaviour } from '@refloor/scene';
import { cookerIgnitionHeat, waterStartFlow } from '@refloor/scene';

export function householdOpenableLabel(assetId: string): string | null {
  switch (assetId) {
    case 'catalogue/kitchen-counter':
      return 'oven door';
    case 'catalogue/vanity':
    case 'catalogue/bedside':
      return 'drawers';
    case 'catalogue/fridge':
      return 'refrigerator doors';
    case 'catalogue/wardrobe':
    case 'catalogue/cabinet':
    case 'catalogue/kitchen-island':
      return 'storage fronts';
    default:
      return null;
  }
}

export function householdBehaviours(assetId: string): Behaviour[] {
  const openable: Behaviour = { kind: 'openable', state: { open: false } };
  const water = (temperature: number): Behaviour => ({
    kind: 'water',
    state: { powered: false, flow: waterStartFlow, temperature },
  });
  switch (assetId) {
    case 'catalogue/kitchen-counter':
      return [
        {
          kind: 'cooker',
          state: { powered: false, heat: cookerIgnitionHeat, burners: [true, false, false, false] },
        },
        water(22),
        openable,
      ];
    case 'catalogue/vanity':
      return [water(22), openable];
    case 'catalogue/shower':
      return [water(38)];
    case 'catalogue/fridge':
    case 'catalogue/wardrobe':
    case 'catalogue/cabinet':
    case 'catalogue/kitchen-island':
    case 'catalogue/bedside':
      return [openable];
    default:
      return [];
  }
}
