import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Mesh } from 'three';
import type { MeshPart } from '@refloor/engine';
import { useSurface } from '@/runtime/rendering/materials';
import { partGeometry } from '@/runtime/rendering/geometry';
import { useProject } from '@/features/projects/project-store';
import { hiddenExterior } from '@/runtime/rendering/visibility';

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
      geometry={geometry}
      material={material}
      position={[part.collider.position.x, part.collider.position.y, part.collider.position.z]}
      rotation={[0, part.collider.rotation, 0]}
      castShadow={part.role !== 'window'}
      receiveShadow
      onClick={(event) => {
        if (wall) {
          event.stopPropagation();
          select({ kind: 'wall', id: wall.id });
        }
      }}
    />
  );
}

export function BuildingMesh() {
  const compiled = useProject((state) => state.compiled);
  return (
    <>
      {compiled.parts.map((part) => (
        <BuildingPart key={part.id} part={part} />
      ))}
    </>
  );
}
