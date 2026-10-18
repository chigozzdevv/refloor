import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Group, Mesh, Vector3 } from 'three';
import type { MeshStandardMaterial } from 'three';
import { getCatalogueEntry } from '@refloor/catalogue';
import type { CatalogueEntry } from '@refloor/catalogue';
import type { SceneObject } from '@refloor/scene';
import { SelectionOutline } from '@/components/editor/selection-outline';
import { useProject } from '@/shared/scene/scene-store';
import { FurnitureModels } from '@/components/scene/furniture-models';
import { useSurface } from '@/shared/scene/asset-loader';
import { sameMaterial } from '@/shared/scene/finish';
import { isScenePointer, visibleGroupRaycast } from '@/shared/editor/picking';

function ScannedFurniture({ object, entry }: { object: SceneObject; entry: CatalogueEntry }) {
  const { scene } = useGLTF(entry.modelUrl!, false),
    finish = useSurface(object.materials.body!),
    { width, height, depth } = object.dimensions,
    changed = !sameMaterial(object.materials.body, entry.materials.body);
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
    const scale = new Vector3(width / size.x, height / size.y, depth / size.z);
    container.scale.copy(scale);
    container.position.set(-centre.x * scale.x, -box.min.y * scale.y, -centre.z * scale.z);
    clone.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const materials = (Array.isArray(child.material) ? child.material : [child.material]).map(
        (source) => {
          const tint =
            (!entry.tintMaterials || entry.tintMaterials.includes(source.name)) &&
            (!entry.tintNodes || entry.tintNodes.includes(child.name));
          const material = (
            changed && tint ? finish.clone() : source.clone()
          ) as MeshStandardMaterial;
          if (material.map) material.map.anisotropy = 8;
          return material;
        },
      );
      child.material = Array.isArray(child.material) ? materials : materials[0]!;
    });
    return container;
  }, [scene, width, height, depth, changed, entry, finish]);
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
    <>
      <group
        raycast={visibleGroupRaycast}
        visible={visible}
        position={[object.position.x, floor.elevation + object.position.y, object.position.z]}
        rotation={[0, object.rotation, 0]}
        onClick={(event) => {
          if (!isScenePointer(event) || event.delta > 5 || useProject.getState().interacting)
            return;
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
          <ScannedFurniture object={object} entry={entry} />
        ) : (
          <FurnitureModels object={object} renderer={entry.renderer} />
        )}
        {selection?.id === object.id && <SelectionOutline dimensions={object.dimensions} />}
      </group>
    </>
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
