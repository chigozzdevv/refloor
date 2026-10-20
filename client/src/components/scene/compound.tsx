import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Object3D } from 'three';
import type { InstancedMesh } from 'three';
import type { CompiledBuilding } from '@refloor/engine';
import { compoundTiles, exteriorLayout } from '@/shared/scene/exterior';
import { siteSurfaceMaterial } from '@refloor/scene/site-material';
import { useSurface } from '@/shared/scene/asset-loader';
import { applyMetricUVs } from '@/shared/scene/metric-uv';
import { SiteBox, SiteSurface } from '@/components/scene/site-surface';

export function Compound({ compiled }: { compiled: CompiledBuilding }) {
  const site = useMemo(() => exteriorLayout(compiled), [compiled]);
  const paving = useRef<InstancedMesh>(null);
  const override = compiled.building.siteMaterials?.paving,
    material = useSurface(
      override ?? { ...siteSurfaceMaterial(compiled.building, 'paving'), color: '#ffffff' },
    ),
    base = useSurface(
      override ?? {
        ...siteSurfaceMaterial(compiled.building, 'paving'),
        color: '#6b6b61',
        roughness: 1,
      },
    ),
    kerb = useSurface(siteSurfaceMaterial(compiled.building, 'kerb'));
  const tiles = useMemo(() => compoundTiles(site), [site]);
  useLayoutEffect(() => {
    if (!paving.current) return;
    const dummy = new Object3D(),
      color = new Color();
    tiles.forEach((tile, index) => {
      dummy.position.set(tile.x, site.ground.elevation - 0.125, tile.z);
      dummy.updateMatrix();
      paving.current!.setMatrixAt(index, dummy.matrix);
      paving.current!.setColorAt(
        index,
        override
          ? color.setScalar(0.96 + tile.shade)
          : color.setHSL(0.11, 0.055, 0.48 + tile.shade),
      );
    });
    paving.current.instanceMatrix.needsUpdate = true;
    if (paving.current.instanceColor) paving.current.instanceColor.needsUpdate = true;
    paving.current.computeBoundingSphere();
    applyMetricUVs(paving.current.geometry);
  }, [tiles, site, override]);
  return (
    <group>
      <SiteSurface buildingId={compiled.building.id} slot="paving">
        <SiteBox
          position={[
            site.compound.x + site.compound.width / 2,
            site.ground.elevation - 0.18,
            site.compound.z + site.compound.depth / 2,
          ]}
          size={[site.compound.width, 0.06, site.compound.depth]}
          material={base}
        />
        <instancedMesh
          ref={paving}
          args={[undefined, undefined, tiles.length]}
          receiveShadow
          castShadow
          material={material}
        >
          <boxGeometry args={[0.43, 0.06, 0.21]} />
        </instancedMesh>
      </SiteSurface>
      <SiteSurface buildingId={compiled.building.id} slot="kerb">
        {[-1, 1].flatMap((side) => [
          <SiteBox
            key={`z:${side}`}
            position={[
              site.compound.x + site.compound.width / 2,
              site.ground.elevation - 0.08,
              site.compound.z + (side > 0 ? site.compound.depth : 0),
            ]}
            size={[site.compound.width + 0.2, 0.18, 0.16]}
            material={kerb}
          />,
          <SiteBox
            key={`x:${side}`}
            position={[
              site.compound.x + (side > 0 ? site.compound.width : 0),
              site.ground.elevation - 0.08,
              site.compound.z + site.compound.depth / 2,
            ]}
            size={[0.16, 0.18, site.compound.depth]}
            material={kerb}
          />,
        ])}
      </SiteSurface>
    </group>
  );
}
