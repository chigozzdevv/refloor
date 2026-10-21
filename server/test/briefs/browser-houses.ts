import type {
  HouseRequirements,
  RoomRequirement,
} from '@refloor/server/shared/planning/requirements';
import { lShapedBrief } from '@server-test/briefs/l-shaped';

const room = (name: string, uses: RoomRequirement['uses'], floor = 0): RoomRequirement => ({
  name,
  uses,
  floor,
  size: 'standard',
  side: null,
  position: 'middle',
});
const rectangular = (): HouseRequirements => ({
  ...lShapedBrief('central-hall'),
  circulation: {
    family: 'central-hall',
    gallerySide: 'left',
    stairPosition: 'front',
    footprint: 'rectangle',
  },
  roof: 'gable',
});

export const browserHouseBriefs: { name: string; requirements: HouseRequirements }[] = [
  { name: 'generated-l-shaped', requirements: lShapedBrief('living-hub') },
  {
    name: 'generated-open-plan',
    requirements: {
      ...rectangular(),
      name: 'Open-plan bungalow',
      rooms: [
        room('Open living, dining and kitchen', ['living', 'dining', 'kitchen']),
        room('Bedroom', ['bedroom']),
        room('Bathroom', ['bathroom']),
      ],
      circulation: { ...rectangular().circulation!, balance: 'public-wide' },
    },
  },
  {
    name: 'generated-two-storey',
    requirements: {
      ...rectangular(),
      name: 'Two-storey family home',
      storeys: 2,
      width: 14,
      depth: 12,
      rooms: [
        room('Living and Dining Room', ['living', 'dining']),
        room('Kitchen', ['kitchen']),
        room('Ground-Floor Bathroom', ['bathroom']),
        room('Workspace', ['workspace']),
        room('Bedroom One', ['bedroom'], 1),
        room('Bedroom Two', ['bedroom'], 1),
        room('Bedroom Three', ['bedroom'], 1),
        room('Upstairs Bathroom', ['bathroom'], 1),
      ],
    },
  },
];
