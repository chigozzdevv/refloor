import type { Building, SceneObject } from '@refloor/scene';
import { createFurniture } from '@refloor/catalogue/furniture';
import { finish } from '@refloor/catalogue/materials';
import type { HouseRequirements } from '@refloor/server/shared/planning/requirements';
import type { HouseLayout } from '@refloor/server/shared/planning/solver';

export function furnishLayout(
  building: Building,
  requirements: HouseRequirements,
  layout: HouseLayout,
): void {
  for (const planned of layout.rooms) {
    const floor = building.floors[planned.requirement.floor]!;
    const roomId = `${floor.id}/room-${planned.index}`;
    const fp = planned.footprint,
      centre = fp.x + fp.width / 2,
      rear = fp.z + fp.depth;
    const add = (
      name: string,
      asset: string,
      x: number,
      z: number,
      rotation = 0,
      y = 0,
    ): SceneObject => {
      const object = createFurniture(`catalogue/${asset}`, {
        id: `${roomId}/${name}`,
        floorId: floor.id,
        roomId,
        position: { x, y, z },
        rotation,
      });
      if (['sofa', 'chair', 'bed'].includes(asset))
        object.materials.body = finish(requirements.upholsteryColor, 'fabric', 0.95);
      building.objects.push(object);
      return object;
    };
    add('pendant', 'pendant', centre, fp.z + fp.depth / 2, 0, 2.33);
    for (const use of planned.requirement.uses) {
      if (use === 'living') {
        add('sofa', 'sofa', centre, rear - 3.4);
        add('coffee-table', 'coffee-table', centre, rear - 2);
        add('television', 'television', centre, rear - 0.18, Math.PI, 1.05);
        add('sideboard', 'cabinet', centre, rear - 0.4, Math.PI);
      } else if (use === 'bedroom') {
        add('bed', 'bed', centre, rear - 1.3, Math.PI);
        add(
          'wardrobe',
          'wardrobe',
          planned.side === 0 ? fp.x + 0.4 : fp.x + fp.width - 0.4,
          fp.z + 1.5,
          planned.side === 0 ? Math.PI / 2 : -Math.PI / 2,
        );
        if (fp.width >= 5.2) {
          add('bedside-left', 'bedside', centre - 1.25, rear - 1.2);
          add('bedside-right', 'bedside', centre + 1.25, rear - 1.2);
        }
      } else if (use === 'dining') {
        add('dining-table', 'dining-table', centre, fp.z + 2.3, Math.PI / 2);
        add('dining-chair-1', 'dining-chair', centre, fp.z + 0.95);
        add('dining-chair-2', 'dining-chair', centre, fp.z + 3.65, Math.PI);
        add('dining-chair-3', 'dining-chair', centre - 1.05, fp.z + 2.3, Math.PI / 2);
        add('dining-chair-4', 'dining-chair', centre + 1.05, fp.z + 2.3, -Math.PI / 2);
      } else if (use === 'kitchen') {
        const counter = add(
          'kitchen-counter',
          'kitchen-counter',
          centre - 0.4,
          rear - 0.5,
          Math.PI,
        );
        counter.dimensions.width = Math.min(2.8, fp.width - 1.5);
        add('fridge', 'fridge', fp.x + fp.width - 0.55, rear - 0.55, Math.PI);
        if (planned.requirement.uses.length === 1)
          add('island', 'kitchen-island', centre, rear - 2.25);
      } else if (use === 'workspace') {
        add('desk', 'desk', centre, rear - 0.5, Math.PI);
        add('desk-chair', 'chair', centre, rear - 1.6);
      } else if (use === 'bathroom') {
        add('vanity', 'vanity', centre, rear - 0.5, Math.PI);
        add('toilet', 'toilet', fp.x + 0.65, rear - 0.65, Math.PI);
        add('shower', 'shower', fp.x + fp.width - 0.7, rear - 0.7, Math.PI);
        add('mirror', 'mirror', centre, rear - 0.14, Math.PI, 1.25);
      }
    }
  }
}
