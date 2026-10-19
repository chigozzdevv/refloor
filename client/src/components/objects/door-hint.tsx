import { useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Raycaster, Vector3 } from 'three';
import type { Group } from 'three';
import { belongsToDoor, isVisible } from '@/shared/editor/picking';
import { physicsSession } from '@/shared/navigation/physics-session';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { useExperience } from '@/shared/scene/experience-store';
import { useProject } from '@/shared/scene/scene-store';

export function DoorHint({
  doorId,
  floorId,
  open,
  x,
  depth,
  pivot,
  onHover,
  onPress,
  onOpen,
}: {
  doorId: string;
  floorId: string;
  open: boolean;
  x: number;
  depth: number;
  pivot: RefObject<Group | null>;
  onHover: (active: boolean) => void;
  onPress: () => void;
  onOpen: () => void;
}) {
  const anchor = useRef<Group>(null),
    button = useRef<HTMLButtonElement>(null),
    elapsed = useRef(1);
  const local = useMemo(() => new Vector3(), []),
    point = useMemo(() => new Vector3(), []),
    direction = useMemo(() => new Vector3(), []),
    ray = useMemo(() => new Raycaster(), []);
  useFrame(({ camera, scene }, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.1 || !anchor.current || !button.current || !pivot.current) return;
    elapsed.current = 0;
    const project = useProject.getState(),
      navigation = useNavigation.getState();
    let visible =
      useExperience.getState().stage === 'ready' &&
      project.mode !== 'orbit' &&
      !project.selection &&
      !project.interacting &&
      !navigation.request &&
      !navigation.mapOpen &&
      isVisible(pivot.current) &&
      (project.mode === 'entry' || physicsSession.current?.player.floorId === floorId);
    if (visible) {
      camera.updateMatrixWorld();
      pivot.current.updateWorldMatrix(true, false);
      local.copy(camera.position);
      pivot.current.worldToLocal(local);
      anchor.current.position.z = Math.sign(local.z || 1) * (depth / 2 + 0.08);
      anchor.current.updateWorldMatrix(true, false);
      anchor.current.getWorldPosition(point);
      const distance = camera.position.distanceTo(point);
      direction.copy(point).sub(camera.position).normalize();
      ray.set(camera.position, direction);
      ray.near = 0.05;
      ray.far = Math.max(0.05, distance - 0.05);
      point.project(camera);
      visible =
        distance < (project.mode === 'entry' ? 4.5 : 3.5) &&
        point.z > -1 &&
        point.z < 1 &&
        Math.abs(point.x) < 0.9 &&
        Math.abs(point.y) < 0.85 &&
        !ray
          .intersectObjects(scene.children, true)
          .some(
            (hit) =>
              !belongsToDoor(hit.object, doorId) &&
              !hit.object.userData.navigationMarker &&
              isVisible(hit.object),
          );
    }
    if (!visible && !button.current.hidden) onHover(false);
    button.current.hidden = !visible;
  });
  return (
    <group ref={anchor} position={[x, 1.08, depth / 2 + 0.08]}>
      <Html center zIndexRange={[16, 11]}>
        <button
          ref={button}
          hidden
          className="door-handle-hint"
          data-door-handle={doorId}
          aria-label={open ? 'Enter through door handle' : 'Open door using handle'}
          onPointerEnter={() => onHover(true)}
          onPointerLeave={() => onHover(false)}
          onFocus={() => onHover(true)}
          onBlur={() => onHover(false)}
          onPointerDown={(event) => {
            event.stopPropagation();
            onPress();
          }}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          <span className="door-handle-label">{open ? 'Click to enter' : 'Click to open'}</span>
        </button>
      </Html>
    </group>
  );
}
