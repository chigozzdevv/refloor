import type { SceneObject } from '@refloor/scene';
import type { FurnitureRenderer } from '@refloor/catalogue';
import { finishes } from '@refloor/catalogue';
import { useSurface } from '@/shared/scene/asset-loader';
import { Mirror } from '@/components/scene/mirror';
import { FurnitureSolid as Solid } from '@/components/scene/furniture-solid';
import { Cupboard } from '@/components/objects/cupboard';
import { Kitchen } from '@/components/objects/kitchen';
import { Refrigerator } from '@/components/objects/refrigerator';
import { Vanity, Toilet, Shower } from '@/components/objects/bathroom-fixtures';
import { Table, DiningChair } from '@/components/objects/dining';

export { Cupboard } from '@/components/objects/cupboard';

export function RoomFixtures({
  object,
  renderer,
}: {
  object: SceneObject;
  renderer: FurnitureRenderer;
}) {
  const body = useSurface(object.materials.body ?? finishes.oak),
    frame = useSurface(object.materials.frame ?? finishes.walnut),
    { width: w, height: h, depth: d } = object.dimensions;
  switch (renderer) {
    case 'kitchen':
      return <Kitchen object={object} body={body} frame={frame} />;
    case 'island':
      return <Kitchen object={object} body={body} frame={frame} island />;
    case 'fridge':
      return <Refrigerator object={object} body={body} frame={frame} />;
    case 'vanity':
      return <Vanity object={object} body={body} frame={frame} />;
    case 'toilet':
      return <Toilet object={object} body={body} frame={frame} />;
    case 'shower':
      return <Shower object={object} body={body} frame={frame} />;
    case 'desk':
      return <Table object={object} body={body} frame={frame} desk />;
    case 'dining-table':
      return <Table object={object} body={body} frame={frame} />;
    case 'dining-chair':
      return <DiningChair object={object} body={body} frame={frame} />;
    case 'wardrobe':
    case 'bedside':
      return (
        <>
          <Cupboard
            object={object}
            w={w}
            h={h - 0.02}
            d={d}
            material={body}
            frame={frame}
            drawers={renderer === 'bedside'}
          />
          <Solid size={[w, 0.025, d]} at={[0, h - 0.012, 0]} material={body} />
        </>
      );
    case 'mirror':
      return (
        <>
          <Solid size={[w, h, d]} at={[0, h / 2, 0]} material={frame} />
          <Mirror object={object} surface={body} />
        </>
      );
    default:
      throw new Error(`Furniture renderer is unavailable: ${renderer}`);
  }
}
