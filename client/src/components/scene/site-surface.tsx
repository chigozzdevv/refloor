import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { BoxGeometry } from 'three';
import type { MeshPhysicalMaterial } from 'three';
import { Select } from '@react-three/postprocessing';
import { siteSurfaceId } from '@refloor/scene/site-material';
import type { SiteSurfaceSlot } from '@refloor/scene/site-material';
import { useProject } from '@/shared/scene/scene-store';
import { isScenePointer, isVisible, visibleMeshRaycast } from '@/shared/editor/picking';
import { applyMetricUVs } from '@/shared/scene/metric-uv';

export function SiteSurface({
  slot,
  children,
  buildingId,
}: {
  slot: SiteSurfaceSlot;
  children: ReactNode;
  buildingId: string;
}) {
  const building = useProject((state) => state.compiled.building),
    selection = useProject((state) => state.selection),
    select = useProject((state) => state.select),
    id = siteSurfaceId({ id: buildingId }, slot);
  return (
    <Select
      enabled={building.id === buildingId && selection?.kind === 'surface' && selection.id === id}
    >
      <group
        userData={{ surfaceId: id }}
        onClick={(event) => {
          if (
            building.id !== buildingId ||
            !isScenePointer(event) ||
            !isVisible(event.object) ||
            event.delta > 5
          )
            return;
          event.stopPropagation();
          select({
            kind: 'surface',
            id,
            point: { x: event.point.x, y: event.point.y, z: event.point.z },
          });
        }}
      >
        {children}
      </group>
    </Select>
  );
}

export function SiteBox({
  size,
  position,
  rotation,
  material,
}: {
  size: [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
  material: MeshPhysicalMaterial;
}) {
  const geometry = useMemo(
    () => applyMetricUVs(new BoxGeometry(...size)),
    [size[0], size[1], size[2]],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      {...(position ? { position } : {})}
      {...(rotation ? { rotation } : {})}
      material={material}
      castShadow
      receiveShadow
      raycast={visibleMeshRaycast}
    />
  );
}
