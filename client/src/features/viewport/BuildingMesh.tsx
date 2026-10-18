import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MeshStandardMaterial } from 'three';
import type { Mesh } from 'three';
import type { MeshPart } from '@refloor/engine';
import { useSurface } from '@/runtime/rendering/materials';
import { partGeometry } from '@/runtime/rendering/geometry';
import { useProject } from '@/features/projects/project-store';
import { hiddenExterior } from '@/runtime/rendering/visibility';
import { Door } from '@/features/viewport/Door';
import { visibleMeshRaycast } from '@/runtime/rendering/picking';

export function BuildingPart({ part }: { part: MeshPart }) {
  const ref = useRef<Mesh>(null),
    camera = useThree((state) => state.camera);
  const mode = useProject((state) => state.mode),
    floorId = useProject((state) => state.floorId),
    select = useProject((state) => state.select);
  const compiled = useProject((state) => state.compiled);
  const geometry = useMemo(() => partGeometry(part), [part]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useSurface(part.material, part.role === 'window');
  const ceiling = useMemo(
    () => new MeshStandardMaterial({ color: '#f3f0e8', roughness: 0.92 }),
    [],
  );
  useEffect(() => () => ceiling.dispose(), [ceiling]);
  const floor = compiled.building.floors.find((value) => value.id === part.floorId),
    activeFloor = compiled.building.floors.find((value) => value.id === floorId);
  const wall = floor?.walls.find(
    (value) =>
      value.id === part.entityId || value.openings.some((opening) => opening.id === part.entityId),
  );
  useFrame(() => {
    if (!ref.current) return;
    let visible = true;
    if (mode === 'orbit' && activeFloor && floor) {
      visible = floor.elevation <= activeFloor.elevation && part.role !== 'roof';
      if (wall && floor.id === floorId && hiddenExterior(wall, floor, camera.position))
        visible = false;
    }
    ref.current.visible = visible;
  });
  return (
    <mesh
      ref={ref}
      raycast={visibleMeshRaycast}
      geometry={geometry}
      material={
        ['slab', 'stair-tread', 'stair-landing'].includes(part.role)
          ? [material, ceiling]
          : material
      }
      position={[part.collider.position.x, part.collider.position.y, part.collider.position.z]}
      rotation={[0, part.collider.rotation, 0]}
      castShadow={part.role !== 'window'}
      receiveShadow
      onClick={(event) => {
        if (event.delta > 5) return;
        if (wall) {
          event.stopPropagation();
          select({ kind: 'wall', id: wall.id });
        } else if (part.role === 'slab' && floor) {
          const room = floor.rooms.find(
            (value) =>
              event.point.x >= value.footprint.x &&
              event.point.x <= value.footprint.x + value.footprint.width &&
              event.point.z >= value.footprint.z &&
              event.point.z <= value.footprint.z + value.footprint.depth,
          );
          if (room) {
            event.stopPropagation();
            select({ kind: 'floor', id: room.id });
          }
        }
      }}
    />
  );
}

export function BuildingMesh() {
  const compiled = useProject((state) => state.compiled);
  return (
    <>
      {compiled.parts.map((part) => {
        const portal =
          part.role === 'door'
            ? compiled.doors.find((door) => door.id === part.entityId)
            : undefined;
        return portal ? (
          <Door key={part.id} part={part} portal={portal} />
        ) : (
          <BuildingPart key={part.id} part={part} />
        );
      })}
    </>
  );
}
