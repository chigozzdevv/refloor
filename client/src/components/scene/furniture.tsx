import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Group, Mesh, Vector3 } from 'three';
import type { MeshStandardMaterial } from 'three';
import { getCatalogueEntry } from '@refloor/catalogue';
import type { CatalogueEntry } from '@refloor/catalogue';
import type { SceneObject } from '@refloor/scene';
import { Select } from '@react-three/postprocessing';
import { useProject } from '@/shared/scene/scene-store';
import { FurnitureModels } from '@/components/scene/furniture-models';
import { useSurface } from '@/shared/scene/asset-loader';
import { scannedMaterial } from '@/shared/scene/scanned-material';
import { isScenePointer, visibleGroupRaycast } from '@/shared/editor/picking';
import { SelectionBounds } from '@/components/editor/selection-bounds';
import { invalidateShadows } from '@/shared/scene/shadow-updates';
import { dispatchSceneEvent } from '@/shared/behaviours/events';

export function ScannedFurniture({
  object,
  entry,
}: {
  object: SceneObject;
  entry: CatalogueEntry;
}) {
  const { scene } = useGLTF(entry.modelUrl!, false),
    finish = useSurface(object.materials.body!),
    { width, height, depth } = object.dimensions;
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
          const material = scannedMaterial(
            source,
            child.name,
            entry,
            object.materials.body!,
            finish,
          ) as MeshStandardMaterial;
          if (material.map) material.map.anisotropy = 8;
          return material;
        },
      );
      child.material = Array.isArray(child.material) ? materials : materials[0]!;
    });
    return container;
  }, [
    scene,
    width,
    height,
    depth,
    object.materials.body?.color,
    object.materials.body?.textureId,
    object.materials.body?.roughness,
    object.materials.body?.metalness,
    object.materials.body?.opacity,
    entry,
    finish,
  ]);
  useLayoutEffect(invalidateShadows, [model]);
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
    cutaway = useProject((state) => state.cutaway),
    selection = useProject((state) => state.selection),
    select = useProject((state) => state.select);
  const floor = compiled.building.floors.find((value) => value.id === object.floorId),
    active = compiled.building.floors.find((value) => value.id === floorId);
  const body = object.materials.body;
  if (!floor || !body) return null;
  const visible = mode !== 'orbit' || !cutaway || !active || floor.elevation <= active.elevation;
  return (
    <>
      <group
        userData={{ fixtureObjectId: object.id }}
        raycast={visibleGroupRaycast}
        visible={visible}
        position={[object.position.x, floor.elevation + object.position.y, object.position.z]}
        rotation={[0, object.rotation, 0]}
        onClick={(event) => {
          if (!isScenePointer(event) || event.delta > 5 || useProject.getState().interacting)
            return;
          event.stopPropagation();
          if (!dispatchSceneEvent({ kind: 'object-click', objectId: object.id })) return;
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
        <Select enabled={selection?.kind === 'object' && selection.id === object.id}>
          {entry.modelUrl ? (
            <ScannedFurniture object={object} entry={entry} />
          ) : (
            <FurnitureModels object={object} renderer={entry.renderer} />
          )}
        </Select>
        {selection?.kind === 'object' && selection.id === object.id && (
          <SelectionBounds dimensions={object.dimensions} />
        )}
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
