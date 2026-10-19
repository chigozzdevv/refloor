import { useMemo } from 'react';
import { RoundedBox, useGLTF } from '@react-three/drei';
import { Group, Mesh, Vector3 } from 'three';
import type { SceneObject } from '@refloor/scene';
import { useSurface } from '@/shared/scene/asset-loader';
import { visibleMeshBounds } from '@/shared/scene/model-bounds';

export function OutdoorPlanter({ object }: { object: SceneObject }) {
  const material = useSurface(object.materials.body!),
    { width: w, height: h, depth: d } = object.dimensions;
  const { scene } = useGLTF('/models/furniture/potted_plant_02/potted_plant_02_1k.gltf', false);
  const foliage = useMemo(() => {
    const container = new Group(),
      clone = scene.clone(true);
    clone.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const sources = Array.isArray(child.material) ? child.material : [child.material];
      if (
        child.name === 'potted_plant_02_pot' ||
        sources.some((source) => source.name === 'potted_plant_02_pot')
      ) {
        child.visible = false;
        return;
      }
      child.castShadow = true;
      child.receiveShadow = true;
    });
    container.add(clone);
    const bounds = visibleMeshBounds(container),
      size = bounds.getSize(new Vector3()),
      centre = bounds.getCenter(new Vector3());
    if (bounds.isEmpty() || Math.min(size.x, size.y, size.z) <= 0)
      throw new Error(`Planter foliage has no visible geometry: ${object.assetId}`);
    const scale = Math.min((w * 0.88) / size.x, (h * 0.66) / size.y, (d * 0.96) / size.z);
    clone.scale.setScalar(scale);
    clone.position.set(-centre.x * scale, h * 0.34 - bounds.min.y * scale, -centre.z * scale);
    return container;
  }, [scene, w, h, d, object.assetId]);
  return (
    <>
      <RoundedBox
        args={[w, h * 0.34, d]}
        position={[0, h * 0.17, 0]}
        radius={0.035}
        smoothness={4}
        material={material}
        castShadow
        receiveShadow
      />
      <mesh position={[0, h * 0.342, 0]} receiveShadow>
        <boxGeometry args={[w - 0.1, 0.018, d - 0.1]} />
        <meshStandardMaterial color="#34372b" roughness={1} />
      </mesh>
      <primitive object={foliage} dispose={null} />
    </>
  );
}
