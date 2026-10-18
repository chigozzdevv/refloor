import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Color, Group, Mesh, Vector3 } from 'three';
import type { MeshStandardMaterial } from 'three';
import { getCatalogueEntry } from '@refloor/catalogue';
import type { CatalogueEntry } from '@refloor/catalogue';
import type { SceneObject } from '@refloor/scene';
import { useProject } from '@/features/projects/project-store';
import { CraftedFurniture } from '@/features/viewport/CraftedFurniture';

function ScannedFurniture({
  object,
  entry,
}: {
  object: SceneObject;
  entry: CatalogueEntry & { modelUrl: string };
}) {
  const { scene } = useGLTF(entry.modelUrl, false);
  const model = useMemo(() => {
    const clone = scene.clone(true),
      container = new Group();
    clone.rotation.y = entry.modelRotation ?? 0;
    container.add(clone);
    container.updateMatrixWorld(true);
    const box = new Box3().setFromObject(container),
      size = box.getSize(new Vector3()),
      centre = box.getCenter(new Vector3());
    if (Math.min(size.x, size.y, size.z) <= 0)
      throw new Error(`Furniture model has no measurable geometry: ${entry.assetId}`);
    const scale = new Vector3(
      object.dimensions.width / size.x,
      object.dimensions.height / size.y,
      object.dimensions.depth / size.z,
    );
    container.scale.copy(scale);
    container.position.set(-centre.x * scale.x, -box.min.y * scale.y, -centre.z * scale.z);
    clone.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const materials = (Array.isArray(child.material) ? child.material : [child.material]).map(
        (source) => {
          const material = source.clone() as MeshStandardMaterial;
          if (
            (!entry.tintMaterials || entry.tintMaterials.includes(material.name)) &&
            object.materials.body?.color !== entry.materials.body?.color
          )
            material.color.multiply(new Color(object.materials.body?.color ?? '#ffffff'));
          if (material.map) material.map.anisotropy = 8;
          return material;
        },
      );
      child.material = Array.isArray(child.material) ? materials : materials[0]!;
    });
    return container;
  }, [scene, object, entry]);
  useEffect(
    () => () =>
      model.traverse((child) => {
        if (child instanceof Mesh)
          (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) =>
            material.dispose(),
          );
      }),
    [model],
  );
  return <primitive object={model} dispose={null} />;
}

function FurnitureInstance({ object }: { object: SceneObject }) {
  const entry = getCatalogueEntry(object.assetId),
    compiled = useProject((state) => state.compiled),
    floorId = useProject((state) => state.floorId),
    mode = useProject((state) => state.mode),
    selection = useProject((state) => state.selection),
    select = useProject((state) => state.select);
  const floor = compiled.building.floors.find((value) => value.id === object.floorId),
    active = compiled.building.floors.find((value) => value.id === floorId);
  const body = object.materials.body;
  if (!floor || !body) return null;
  const visible = mode !== 'orbit' || !active || floor.elevation <= active.elevation;
  return (
    <group
      visible={visible}
      position={[object.position.x, floor.elevation + object.position.y, object.position.z]}
      rotation={[0, object.rotation, 0]}
      onClick={(event) => {
        if (event.delta > 5) return;
        event.stopPropagation();
        select({ kind: 'object', id: object.id });
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      {entry.modelUrl ? (
        <ScannedFurniture object={object} entry={{ ...entry, modelUrl: entry.modelUrl }} />
      ) : (
        <CraftedFurniture object={object} renderer={entry.renderer} />
      )}
      {selection?.id === object.id && (
        <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry
            args={[
              Math.max(object.dimensions.width, object.dimensions.depth) / 2 + 0.08,
              Math.max(object.dimensions.width, object.dimensions.depth) / 2 + 0.105,
              64,
            ]}
          />
          <meshBasicMaterial color="#d6ad6d" depthWrite={false} transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}

export function Furniture() {
  const objects = useProject((state) => state.compiled.building.objects);
  return (
    <>
      {objects.map((object) => (
        <FurnitureInstance key={object.id} object={object} />
      ))}
    </>
  );
}
