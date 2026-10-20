import type { Building, SceneObject } from '@refloor/scene';
import { createFurniture } from '@refloor/catalogue/furniture';
import { finish, finishes } from '@refloor/catalogue/materials';
import type { HouseRequirements } from '@refloor/server/shared/planning/requirements';
import type { HouseLayout } from '@refloor/server/shared/planning/solver';

export function furnishLayout(
  building: Building,
  requirements: HouseRequirements,
  layout: HouseLayout,
): void {
  const design = requirements.design,
    joinery = finishes[design?.joinery ?? 'oak'],
    hardware = finishes[design?.hardware ?? 'black'];
  const styleObject = (object: SceneObject, asset: string) => {
    if (['sofa', 'chair', 'bed', 'dining-chair'].includes(asset))
      object.materials.body = finish(requirements.upholsteryColor, 'fabric', 0.95);
    if (!design) return;
    if (
      [
        'coffee-table',
        'cabinet',
        'wardrobe',
        'bedside',
        'kitchen-counter',
        'kitchen-island',
        'vanity',
        'desk',
        'dining-table',
      ].includes(asset)
    )
      object.materials.body = structuredClone(joinery);
    if (object.materials.frame)
      object.materials.frame = structuredClone(asset === 'bed' ? joinery : hardware);
    const light = object.behaviours.find((value) => value.kind === 'light');
    if (light)
      light.state.color =
        design.style === 'moody-modern'
          ? '#ffd2a2'
          : design.style === 'natural-minimal'
            ? '#fff0dc'
            : '#ffe6bf';
  };
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
      styleObject(object, asset);
      building.objects.push(object);
      return object;
    };
    add('pendant', 'pendant', centre, fp.z + fp.depth / 2, 0, 2.33);
    const sideBySide = planned.requirement.uses.length === 2 && fp.width >= 8.4;
    for (const use of planned.requirement.uses) {
      const centre = sideBySide
          ? fp.x + fp.width * (use === 'living' ? 0.75 : 0.25)
          : fp.x + fp.width / 2,
        zoneWidth = sideBySide ? fp.width / 2 : fp.width;
      if (use === 'living') {
        add('sofa', 'sofa', centre, rear - 3.4);
        add('coffee-table', 'coffee-table', centre, rear - 2);
        add('television', 'television', centre, rear - 0.18, Math.PI, 1.05);
        add('sideboard', 'cabinet', centre, rear - 0.4, Math.PI);
        if (design && zoneWidth >= 4.8) {
          add('lounge-chair-left', 'chair', centre - 1.65, rear - 2.2, Math.PI / 3);
          if (design.style !== 'natural-minimal')
            add('lounge-chair-right', 'chair', centre + 1.65, rear - 2.2, -Math.PI / 3);
        }
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
        const z = sideBySide ? fp.z + fp.depth / 2 : fp.z + 2.3;
        add('dining-table', 'dining-table', centre, z, Math.PI / 2);
        add('dining-chair-1', 'dining-chair', centre, z - 1.35);
        add('dining-chair-2', 'dining-chair', centre, z + 1.35, Math.PI);
        add('dining-chair-3', 'dining-chair', centre - 1.05, z, Math.PI / 2);
        add('dining-chair-4', 'dining-chair', centre + 1.05, z, -Math.PI / 2);
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
    if (
      design &&
      planned.requirement.uses.some((use) => ['living', 'bedroom', 'workspace'].includes(use))
    )
      add('plant', 'plant', planned.side === 0 ? fp.x + 0.5 : fp.x + fp.width - 0.5, rear - 0.55);
  }
  for (const floor of building.floors) {
    const hall = floor.rooms.find((room) => room.kind === 'corridor');
    if (!hall) continue;
    for (let z = 1.8; z < hall.footprint.depth - 0.7; z += 4) {
      const object = createFurniture('catalogue/pendant', {
        id: `${hall.id}/pendant-${z.toFixed(1)}`,
        floorId: floor.id,
        roomId: hall.id,
        position: {
          x: hall.footprint.x + (hall.footprint.width > 3 ? 0.7 : hall.footprint.width / 2),
          y: 2.33,
          z,
        },
        rotation: 0,
      });
      styleObject(object, 'pendant');
      building.objects.push(object);
    }
  }
}
