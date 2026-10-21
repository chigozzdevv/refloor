import type { HouseRequirements } from '@refloor/server/shared/planning/requirements';

export const lShapedBrief = (family: 'central-hall' | 'living-hub'): HouseRequirements => ({
  name: 'Courtyard bungalow',
  storeys: 1,
  width: null,
  depth: null,
  rooms: [
    { name: 'Parlor', uses: ['living'] as const },
    { name: 'Kitchen', uses: ['kitchen'] as const },
    { name: 'Bedroom One', uses: ['bedroom'] as const },
    { name: 'Bedroom Two', uses: ['bedroom'] as const },
    { name: 'Bathroom', uses: ['bathroom'] as const },
  ].map(({ name, uses }) => ({
    name,
    uses: [...uses],
    floor: 0,
    size: 'standard',
    side: null,
    position: 'middle',
  })),
  circulation: { family, gallerySide: 'left', stairPosition: 'rear', footprint: 'l-shaped' },
  design: {
    style: 'natural-minimal',
    joinery: 'oak',
    hardware: 'black',
    glazing: 'generous',
    exterior: { finish: 'plaster', color: '#eee8db' },
    roof: { finish: 'asphalt', color: '#555550' },
  },
  wallColor: '#f5f0e6',
  upholsteryColor: '#aca08a',
  flooring: 'oak',
  roof: 'flat',
  unsupported: [],
});
