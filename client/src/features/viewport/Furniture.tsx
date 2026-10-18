import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { Edges, TransformControls, useGLTF } from '@react-three/drei';
import { Box3, Group, Mesh, Vector3 } from 'three';
import type { MeshStandardMaterial } from 'three';
import { getCatalogueEntry } from '@refloor/catalogue';
import type { CatalogueEntry } from '@refloor/catalogue';
import type { SceneObject } from '@refloor/scene';
import { useProject } from '@/features/projects/project-store';
import { CraftedFurniture } from '@/features/viewport/CraftedFurniture';
import { useSurface } from '@/runtime/rendering/materials';
import { sameMaterial } from '@/runtime/rendering/finish';
import { visibleGroupRaycast } from '@/runtime/rendering/picking';

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
    select = useProject((state) => state.select),
    transformMode = useProject((state) => state.transformMode),
    interacting = useProject((state) => state.interacting);
  const group = useRef<Group>(null),
    [target, setTarget] = useState<Group | null>(null);
  const attach = useCallback((value: Group | null) => {
    group.current = value;
    setTarget(value);
  }, []);
  const floor = compiled.building.floors.find((value) => value.id === object.floorId),
    active = compiled.building.floors.find((value) => value.id === floorId);
  const body = object.materials.body;
  if (!floor || !body) return null;
  const visible = mode !== 'orbit' || !active || floor.elevation <= active.elevation;
  return (
    <>
      <group
        ref={attach}
        raycast={visibleGroupRaycast}
        visible={visible}
        position={[object.position.x, floor.elevation + object.position.y, object.position.z]}
        rotation={[0, object.rotation, 0]}
        onClick={(event) => {
          if (event.delta > 5 || useProject.getState().interacting) return;
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
          <CraftedFurniture object={object} renderer={entry.renderer} />
        )}
        {selection?.id === object.id && (
          <mesh position={[0, object.dimensions.height / 2, 0]} raycast={() => undefined}>
            <boxGeometry
              args={[
                object.dimensions.width + 0.025,
                object.dimensions.height + 0.025,
                object.dimensions.depth + 0.025,
              ]}
            />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            <Edges color="#c4a86d" transparent opacity={0.65} raycast={() => undefined} />
          </mesh>
        )}
      </group>
      {mode === 'orbit' && selection?.id === object.id && target && (
        <TransformControls
          object={target}
          mode={transformMode}
          showX={transformMode === 'translate'}
          showY={transformMode === 'rotate'}
          showZ={transformMode === 'translate'}
          translationSnap={0.05}
          rotationSnap={Math.PI / 12}
          size={0.7}
          onMouseDown={() => useProject.getState().setInteracting(true)}
          onMouseUp={() => {
            const state = useProject.getState(),
              value = group.current;
            if (value) {
              const room = floor.rooms.find(
                (room) =>
                  value.position.x >= room.footprint.x &&
                  value.position.x <= room.footprint.x + room.footprint.width &&
                  value.position.z >= room.footprint.z &&
                  value.position.z <= room.footprint.z + room.footprint.depth,
              );
              const accepted = state.edit([
                {
                  type: 'move-object',
                  objectId: object.id,
                  roomId: room?.id ?? object.roomId,
                  position: {
                    x: value.position.x,
                    y: value.position.y - floor.elevation,
                    z: value.position.z,
                  },
                  rotation: value.rotation.y,
                },
              ]);
              if (!accepted) {
                value.position.set(
                  object.position.x,
                  floor.elevation + object.position.y,
                  object.position.z,
                );
                value.rotation.set(0, object.rotation, 0);
              }
            }
            state.setInteracting(false);
          }}
          onPointerMissed={() => {
            if (interacting) useProject.getState().setInteracting(false);
          }}
        />
      )}
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
