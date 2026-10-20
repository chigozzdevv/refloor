import { useEffect, useMemo } from 'react';
import type { Material, Vector3Tuple } from 'three';
import { roundedFurnitureGeometry, type FurnitureSize } from '@/shared/scene/furniture-geometry';

export function FurnitureSolid({
  size,
  at,
  material,
  color = '#edece5',
  metalness = 0,
  roughness = 0.45,
  opacity = 1,
  radius = 0.018,
  rotation,
}: {
  size: FurnitureSize;
  at: Vector3Tuple;
  material?: Material;
  color?: string;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  radius?: number;
  rotation?: Vector3Tuple;
}) {
  const [w, h, d] = size,
    [x, y, z] = at,
    geometry = useMemo(
      () => roundedFurnitureGeometry([w, h, d], radius, [x, y, z]),
      [w, h, d, radius, x, y, z],
    );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      position={at}
      {...(rotation ? { rotation } : {})}
      {...(material ? { material } : {})}
      castShadow
      receiveShadow
    >
      {!material && (
        <meshPhysicalMaterial
          color={color}
          roughness={roughness}
          metalness={metalness}
          transparent={opacity < 1}
          opacity={opacity}
        />
      )}
    </mesh>
  );
}
