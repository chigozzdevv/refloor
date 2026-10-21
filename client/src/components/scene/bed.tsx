import { useEffect, useMemo } from 'react';
import type { SceneObject } from '@refloor/scene';
import { finishes } from '@refloor/catalogue';
import { useSurface } from '@/shared/scene/asset-loader';
import { duvetGeometry, pillowGeometry } from '@/shared/scene/furniture-geometry';
import { FurnitureSolid as Solid } from '@/components/scene/furniture-solid';

export function Bed({ object }: { object: SceneObject }) {
  const upholstery = useSurface(object.materials.body ?? finishes.linen),
    frame = useSurface(object.materials.frame ?? finishes.walnut),
    sheets = useSurface(finishes.linen),
    { width: w, height: h, depth: d } = object.dimensions,
    cloth = useMemo(() => duvetGeometry(w, d), [w, d]),
    pillow = useMemo(() => pillowGeometry(w * 0.405, 0.16, 0.5), [w]);
  useEffect(() => () => cloth.dispose(), [cloth]);
  useEffect(
    () => () => {
      pillow.body.dispose();
      pillow.seam.dispose();
    },
    [pillow],
  );
  return (
    <>
      <Solid size={[w - 0.08, 0.11, d - 0.1]} at={[0, 0.185, 0.015]} material={frame} />
      <Solid
        size={[w - 0.16, 0.19, d - 0.16]}
        at={[0, 0.33, 0.01]}
        radius={0.06}
        material={upholstery}
      />
      <Solid
        size={[w - 0.16, 0.2, d - 0.18]}
        at={[0, 0.48, 0.01]}
        radius={0.075}
        material={sheets}
      />
      <Solid
        size={[w, h - 0.12, 0.13]}
        at={[0, (h + 0.12) / 2, -d / 2 + 0.065]}
        radius={0.05}
        material={frame}
      />
      {[-1, 1].map((side) => (
        <Solid
          key={`head:${side}`}
          size={[w / 2 - 0.028, h - 0.2, 0.065]}
          at={[side * (w / 4 - 0.004), (h + 0.15) / 2, -d / 2 + 0.15]}
          radius={0.025}
          material={upholstery}
        />
      ))}
      {[-1, 1].map((side) => (
        <group
          key={`pillow:${side}`}
          position={[side * w * 0.23, 0.63, -d * 0.295]}
          rotation={[0.1, 0, side * -0.035]}
        >
          <mesh geometry={pillow.body} material={sheets} castShadow receiveShadow />
          <mesh geometry={pillow.seam} material={sheets} castShadow />
        </group>
      ))}
      <Solid
        size={[w * 0.75, 0.055, d * 0.55]}
        at={[0, 0.601, d * 0.07]}
        radius={0.025}
        material={upholstery}
      />
      <mesh
        geometry={cloth}
        position={[0, 0.63, d * 0.105]}
        material={upholstery}
        castShadow
        receiveShadow
      />
      <Solid
        size={[w - 0.16, 0.035, 0.17]}
        at={[0, 0.64, -d * 0.23]}
        radius={0.014}
        material={sheets}
      />
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <Solid
            key={`foot:${x}:${z}`}
            size={[0.045, 0.13, 0.045]}
            at={[x * (w / 2 - 0.18), 0.065, z * (d / 2 - 0.18)]}
            material={frame}
          />
        )),
      )}
    </>
  );
}
