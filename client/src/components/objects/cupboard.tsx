import type { Material as ThreeMaterial } from 'three';
import { drawerExtensionRatio, openableAngles } from '@refloor/scene';
import type { SceneObject } from '@refloor/scene';
import { FurnitureSolid as Solid } from '@/components/scene/furniture-solid';
import { FixtureControl } from '@/components/objects/fixture-control';
import { FixtureMotion } from '@/components/objects/fixture-motion';

export function Cupboard({
  object,
  w,
  h,
  d,
  material,
  frame,
  drawers = false,
  operable = true,
}: {
  object: SceneObject;
  w: number;
  h: number;
  d: number;
  material: ThreeMaterial;
  frame: ThreeMaterial;
  drawers?: boolean;
  operable?: boolean;
}) {
  const count = Math.max(2, Math.round(w / 0.6)),
    open =
      operable &&
      (object.behaviours.find((value) => value.kind === 'openable')?.state.open ?? false);
  return (
    <>
      <Solid size={[w - 0.08, 0.09, d - 0.08]} at={[0, 0.045, 0]} material={frame} />
      <Solid
        size={[w - 0.035, h - 0.1, 0.025]}
        at={[0, (h + 0.1) / 2, -d / 2 + 0.015]}
        material={material}
      />
      {[
        0.11,
        h * 0.5,
        ...(['catalogue/kitchen-counter', 'catalogue/vanity'].includes(object.assetId)
          ? []
          : [h - 0.025]),
      ].map((y) => (
        <Solid key={y} size={[w - 0.05, 0.022, d - 0.045]} at={[0, y, -0.01]} material={material} />
      ))}
      {[-1, 1].map((side) => (
        <Solid
          key={side}
          size={[0.025, h - 0.1, d]}
          at={[side * (w / 2 - 0.013), (h + 0.1) / 2, 0]}
          material={material}
        />
      ))}
      {Array.from({ length: drawers ? 2 : count }, (_, index) => (
        <FixtureMotion
          objectId={object.id}
          key={index}
          open={open}
          axis={drawers ? 'z' : 'y'}
          slide={drawers}
          amount={
            drawers ? d * drawerExtensionRatio : (index % 2 ? 1 : -1) * openableAngles.cupboard
          }
          position={[
            drawers ? 0 : -w / 2 + ((index + (index % 2 ? 1 : 0)) * w) / count,
            drawers ? 0.1 + ((index + 0.5) * (h - 0.12)) / 2 : (h + 0.1) / 2,
            d / 2 - 0.014,
          ]}
        >
          <group position={[drawers ? 0 : ((index % 2 ? -1 : 1) * w) / count / 2, 0, 0]}>
            {drawers && (
              <>
                <Solid
                  size={[w - 0.07, 0.018, d * 0.75]}
                  at={[0, -(h - 0.14) / 4 + 0.02, -d * 0.38]}
                  material={material}
                />
                {[-1, 1].map((side) => (
                  <Solid
                    key={side}
                    size={[0.018, (h - 0.14) / 2, d * 0.75]}
                    at={[side * (w / 2 - 0.035), 0, -d * 0.38]}
                    material={material}
                  />
                ))}
              </>
            )}
            <Solid
              size={[
                drawers ? w - 0.012 : w / count - 0.012,
                drawers ? (h - 0.14) / 2 : h - 0.13,
                0.025,
              ]}
              at={[0, 0, 0]}
              material={material}
            />
            <FixtureControl
              object={object}
              capability="openable"
              enabled={operable}
              label={open ? 'Close storage' : 'Open storage'}
              position={[drawers ? 0 : (w / count) * 0.3, drawers ? 0.03 : h * 0.08, 0.035]}
            >
              <Solid
                size={[
                  drawers ? w * 0.38 : 0.012,
                  drawers ? 0.012 : Math.min(0.18, h * 0.25),
                  0.02,
                ]}
                at={[drawers ? 0 : (w / count) * 0.3, drawers ? 0.03 : h * 0.08, 0.015]}
                material={frame}
              />
            </FixtureControl>
          </group>
        </FixtureMotion>
      ))}
    </>
  );
}
