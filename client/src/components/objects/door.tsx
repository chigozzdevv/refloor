import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { MathUtils } from 'three';
import type { Group } from 'three';
import type { MeshPart, DoorPortal } from '@refloor/engine';
import { rotate } from '@refloor/engine/math';
import { useProject } from '@/shared/scene/scene-store';
import { useSurface } from '@/shared/scene/asset-loader';
import { physicsSession } from '@/shared/navigation/physics-session';
import { activateDoor } from '@/shared/behaviours/door';
import { hiddenExterior } from '@/shared/scene/visibility';
import { isScenePointer, visibleGroupRaycast, visibleMeshRaycast } from '@/shared/editor/picking';

export function Door({ part, portal }: { part: MeshPart; portal: DoorPortal }) {
  const pivot = useRef<Group>(null),
    fraction = useRef(portal.open ? 1 : 0),
    preview = useRef<number | null>(null),
    drag = useRef<{ x: number; y: number; fraction: number } | null>(null);
  const camera = useThree((state) => state.camera),
    mode = useProject((state) => state.mode),
    floorId = useProject((state) => state.floorId),
    compiled = useProject((state) => state.compiled);
  const material = useSurface(part.material);
  const floor = compiled.building.floors.find((value) => value.id === portal.floorId),
    active = compiled.building.floors.find((value) => value.id === floorId),
    wall = floor?.walls.find((value) => value.id === portal.wallId);
  const source = part.collider;
  const local = useMemo(
    () =>
      rotate(
        { x: source.position.x - portal.hinge.x, z: source.position.z - portal.hinge.z },
        -source.rotation,
      ),
    [source, portal.hinge],
  );
  useFrame((_state, delta) => {
    const target = preview.current ?? (portal.open ? 1 : 0),
      next = MathUtils.damp(fraction.current, target, 9, delta);
    if (mode !== 'walk' || !physicsSession.current?.doorBlocked(portal.id, next))
      fraction.current = next;
    if (pivot.current) {
      pivot.current.rotation.y = portal.rotation + portal.openingAngle * fraction.current;
      pivot.current.visible =
        mode !== 'orbit' ||
        !floor ||
        !active ||
        (floor.elevation <= active.elevation &&
          !(floor.id === floorId && wall && hiddenExterior(wall, floor, camera.position)));
    }
    physicsSession.current?.setDoorFraction(portal.id, fraction.current);
  }, -2);
  if (source.shape !== 'box') return null;
  const down = (event: ThreeEvent<PointerEvent>) => {
    if (!isScenePointer(event)) return;
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, fraction: fraction.current };
    useProject.getState().setInteracting(true);
  };
  const move = (event: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    event.stopPropagation();
    const distance = Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y);
    preview.current = MathUtils.clamp(
      drag.current.fraction + ((portal.open ? -1 : 1) * distance) / 145,
      0,
      1,
    );
  };
  const up = (event: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    event.stopPropagation();
    const distance = Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y),
      open = distance < 5 ? !portal.open : (preview.current ?? fraction.current) > 0.45;
    (event.target as Element).releasePointerCapture(event.pointerId);
    drag.current = null;
    preview.current = null;
    useProject.getState().setInteracting(false);
    activateDoor(portal.id, open);
  };
  const sign = local.x >= 0 ? 1 : -1;
  return (
    <group
      ref={pivot}
      position={[portal.hinge.x, portal.hinge.y, portal.hinge.z]}
      rotation={[0, portal.rotation + portal.openingAngle * fraction.current, 0]}
    >
      <RoundedBox
        raycast={visibleMeshRaycast}
        args={[source.size.x, source.size.y, source.size.z]}
        radius={0.006}
        smoothness={3}
        position={[local.x, source.position.y - portal.hinge.y, 0]}
        material={material}
        castShadow
        receiveShadow
        onClick={(event) => {
          if (!isScenePointer(event)) return;
          event.stopPropagation();
          if (event.delta >= 5) return;
          if (mode === 'entry') activateDoor(portal.id, !portal.open);
          else
            useProject.getState().select({
              kind: 'door',
              id: portal.id,
              point: { x: event.point.x, y: event.point.y, z: event.point.z },
            });
        }}
      />
      {[-1, 1].map((side) => (
        <group
          key={side}
          raycast={visibleGroupRaycast}
          position={[sign * (source.size.x - 0.12), 1.05, side * (source.size.z / 2 + 0.025)]}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => {
            drag.current = null;
            preview.current = null;
            useProject.getState().setInteracting(false);
          }}
          onClick={(event) => event.stopPropagation()}
          onPointerOver={(event) => {
            event.stopPropagation();
            document.body.style.cursor = 'grab';
          }}
          onPointerOut={() => {
            if (!drag.current) document.body.style.cursor = '';
          }}
        >
          <RoundedBox args={[0.035, 0.16, 0.015]} radius={0.007} smoothness={3} castShadow>
            <meshPhysicalMaterial color="#baa579" roughness={0.25} metalness={0.9} />
          </RoundedBox>
          <mesh
            position={[-sign * 0.05, 0.028, side * 0.025]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.013, 0.013, 0.14, 16]} />
            <meshPhysicalMaterial color="#baa579" roughness={0.25} metalness={0.9} />
          </mesh>
          <mesh visible={false}>
            <sphereGeometry args={[0.14, 12, 8]} />
            <meshBasicMaterial />
          </mesh>
        </group>
      ))}
    </group>
  );
}
