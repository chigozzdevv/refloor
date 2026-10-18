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
          'cabinet',
          planned.side === 0 ? fp.x + 0.4 : fp.x + fp.width - 0.4,
          rear - 1.3,
          Math.PI / 2,
        );
      } else if (use === 'dining') {
        const table = add('dining-table', 'coffee-table', centre, fp.z + 2.3);
        table.dimensions = { width: 1.8, height: 0.75, depth: 0.9 };
        add('dining-chair-1', 'chair', centre, fp.z + 1.2);
        add('dining-chair-2', 'chair', centre, fp.z + 3.4, Math.PI);
      } else if (use === 'kitchen') {
        const counter = add('kitchen-counter', 'cabinet', centre, rear - 0.5, Math.PI);
        counter.dimensions = { width: 3.2, height: 0.9, depth: 0.65 };
        if (planned.requirement.uses.length === 1) add('island', 'cabinet', centre, rear - 2.25);
      } else if (use === 'workspace') {
        const desk = add('desk', 'cabinet', centre, rear - 0.5, Math.PI);
        desk.dimensions = { width: 1.8, height: 0.75, depth: 0.65 };
        add('desk-chair', 'chair', centre, rear - 1.6);
      } else if (use === 'bathroom') {
        const vanity = add('vanity', 'cabinet', centre, rear - 0.5, Math.PI);
        vanity.dimensions = { width: 1.4, height: 0.85, depth: 0.6 };
      }
    }
  }
}
