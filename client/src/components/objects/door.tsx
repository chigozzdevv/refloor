import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { Select } from '@react-three/postprocessing';
import { MathUtils, MeshPhysicalMaterial } from 'three';
import type { Group } from 'three';
import type { MeshPart, DoorPortal } from '@refloor/engine';
import { rotate } from '@refloor/engine/math';
import { useProject } from '@/shared/scene/scene-store';
import { useSurface } from '@/shared/scene/asset-loader';
import { physicsSession } from '@/shared/navigation/physics-session';
import { DoorHint } from '@/components/objects/door-hint';
import { DoorMotion } from '@/shared/behaviours/door-motion';
import { activateDoor, traverseDoor } from '@/shared/behaviours/door';
import { hiddenExterior } from '@/shared/scene/visibility';
import { isScenePointer, visibleGroupRaycast, visibleMeshRaycast } from '@/shared/editor/picking';
import { invalidateShadows } from '@/shared/scene/shadow-updates';

export function Door({ part, portal }: { part: MeshPart; portal: DoorPortal }) {
  const pivot = useRef<Group>(null),
    motion = useRef(new DoorMotion(portal.open)),
    levers = useRef<(Group | null)[]>([]),
    preview = useRef<number | null>(null),
    handleHovered = useRef(false),
    drag = useRef<{ x: number; y: number; fraction: number } | null>(null);
  const handleMaterial = useMemo(
    () =>
      new MeshPhysicalMaterial({
        color: '#baa579',
        roughness: 0.25,
        metalness: 0.9,
        emissive: '#d1b886',
        emissiveIntensity: 0,
      }),
    [],
  );
  useEffect(() => () => handleMaterial.dispose(), [handleMaterial]);
  const camera = useThree((state) => state.camera),
    mode = useProject((state) => state.mode),
    floorId = useProject((state) => state.floorId),
    selection = useProject((state) => state.selection),
    compiled = useProject((state) => state.compiled);
  const cutaway = useProject((state) => state.cutaway);
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
    const before = motion.current.fraction,
      handle = motion.current.handle;
    handleMaterial.emissiveIntensity = MathUtils.damp(
      handleMaterial.emissiveIntensity,
      handleHovered.current || drag.current ? 0.22 : 0,
      12,
      delta,
    );
    motion.current.step(
      portal.open,
      delta,
      (next) => mode === 'walk' && Boolean(physicsSession.current?.doorBlocked(portal.id, next)),
      preview.current,
      drag.current !== null,
    );
    if (
      Math.abs(before - motion.current.fraction) > 0.0001 ||
      Math.abs(handle - motion.current.handle) > 0.0001
    )
      invalidateShadows();
    for (const lever of levers.current)
      if (lever) lever.rotation.z = (local.x >= 0 ? 1 : -1) * 0.5 * motion.current.handle;
    if (pivot.current) {
      pivot.current.rotation.y = portal.rotation + portal.openingAngle * motion.current.fraction;
      pivot.current.visible =
        mode !== 'orbit' ||
        !cutaway ||
        !floor ||
        !active ||
        (floor.elevation <= active.elevation &&
          !(floor.id === floorId && wall && hiddenExterior(wall, floor, camera.position)));
    }
    physicsSession.current?.setDoorFraction(portal.id, motion.current.fraction);
  }, -2);
  if (source.shape !== 'box') return null;
  const down = (event: ThreeEvent<PointerEvent>) => {
    if (!isScenePointer(event)) return;
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    motion.current.press();
    drag.current = { x: event.clientX, y: event.clientY, fraction: motion.current.fraction };
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
      open = distance < 5 ? !portal.open : (preview.current ?? motion.current.fraction) > 0.45;
    (event.target as Element).releasePointerCapture(event.pointerId);
    drag.current = null;
    preview.current = null;
    useProject.getState().setInteracting(false);
    if (mode !== 'orbit' && (distance < 5 || open)) traverseDoor(portal.id);
    else activateDoor(portal.id, open);
  };
  const sign = local.x >= 0 ? 1 : -1;
  return (
    <Select enabled={selection?.kind === 'door' && selection.id === portal.id}>
      <group
        userData={{ doorId: portal.id }}
        ref={pivot}
        position={[portal.hinge.x, portal.hinge.y, portal.hinge.z]}
        rotation={[0, portal.rotation + portal.openingAngle * motion.current.fraction, 0]}
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
          onPointerOver={(event) => {
            event.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = '';
          }}
          onClick={(event) => {
            if (!isScenePointer(event)) return;
            event.stopPropagation();
            if (event.delta >= 5) return;
            if (mode === 'orbit' || event.nativeEvent.shiftKey)
              useProject.getState().select({
                kind: 'door',
                id: portal.id,
                point: { x: event.point.x, y: event.point.y, z: event.point.z },
              });
            else {
              motion.current.press();
              traverseDoor(portal.id);
            }
          }}
          onContextMenu={(event) => {
            event.nativeEvent.preventDefault();
            event.stopPropagation();
            useProject.getState().select({
              kind: 'door',
              id: portal.id,
              point: { x: event.point.x, y: event.point.y, z: event.point.z },
            });
          }}
        />
        <DoorHint
          doorId={portal.id}
          floorId={portal.floorId}
          open={portal.open}
          x={sign * (source.size.x - 0.17)}
          depth={source.size.z}
          pivot={pivot}
          onHover={(active) => {
            handleHovered.current = active;
          }}
          onPress={() => motion.current.press()}
          onOpen={() => {
            motion.current.press();
            traverseDoor(portal.id);
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
              handleHovered.current = false;
              useProject.getState().setInteracting(false);
            }}
            onClick={(event) => event.stopPropagation()}
            onPointerOver={(event) => {
              event.stopPropagation();
              handleHovered.current = true;
              document.body.style.cursor = 'grab';
            }}
            onPointerOut={() => {
              handleHovered.current = false;
              if (!drag.current) document.body.style.cursor = '';
            }}
          >
            <RoundedBox
              args={[0.035, 0.16, 0.015]}
              radius={0.007}
              smoothness={3}
              material={handleMaterial}
              castShadow
            />
            <group
              ref={(value) => {
                levers.current[side === -1 ? 0 : 1] = value;
              }}
              position={[0, 0.028, side * 0.025]}
            >
              <mesh
                position={[-sign * 0.05, 0, 0]}
                rotation={[0, 0, Math.PI / 2]}
                material={handleMaterial}
                castShadow
              >
                <cylinderGeometry args={[0.013, 0.013, 0.14, 16]} />
              </mesh>
            </group>
            <mesh visible={false}>
              <sphereGeometry args={[0.14, 12, 8]} />
              <meshBasicMaterial />
            </mesh>
          </group>
        ))}
      </group>
    </Select>
  );
}
