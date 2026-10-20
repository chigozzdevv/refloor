import { useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Raycaster, Vector3 } from 'three';
import type { Group, Vector3Tuple } from 'three';
import type { SceneObject } from '@refloor/scene';
import { useProject } from '@/shared/scene/scene-store';
import { useExperience } from '@/shared/scene/experience-store';
import { useNavigation } from '@/shared/navigation/navigation-store';
import {
  fixtureToggle,
  fixtureOccludes,
  FixtureRaycastBudget,
  type FixtureCapability,
} from '@/shared/behaviours/fixture';
import { isScenePointer, isVisible } from '@/shared/editor/picking';

const raycastBudget = new FixtureRaycastBudget();

export function FixtureControl({
  object,
  capability,
  burner,
  label,
  enabled = true,
  position = [0, 0, 0],
  children,
}: {
  object: SceneObject;
  capability: FixtureCapability;
  burner?: number;
  label: string;
  enabled?: boolean;
  position?: Vector3Tuple;
  children: ReactNode;
}) {
  const camera = useThree((value) => value.camera),
    stage = useExperience((value) => value.stage),
    mode = useProject((value) => value.mode),
    floorId = useProject((value) => value.floorId),
    anchor = useRef<Group>(null),
    button = useRef<HTMLButtonElement>(null),
    elapsed = useRef(0),
    point = useMemo(() => new Vector3(), []),
    direction = useMemo(() => new Vector3(), []),
    ray = useMemo(() => new Raycaster(), []);
  const reachable = () => {
    const state = useProject.getState();
    if (
      !anchor.current ||
      !isVisible(anchor.current) ||
      state.interacting ||
      state.mode !== 'walk' ||
      state.floorId !== object.floorId ||
      useExperience.getState().stage !== 'ready'
    )
      return false;
    anchor.current.getWorldPosition(point);
    return camera.position.distanceTo(point) < 2.8;
  };
  const operate = () => {
    if (!reachable()) return;
    const state = useProject.getState(),
      current = state.compiled.building.objects.find((value) => value.id === object.id);
    if (!current || state.interacting) return;
    try {
      state.edit(
        [
          { type: 'emit-event', event: { kind: 'object-click', objectId: current.id } },
          fixtureToggle(current, capability, burner),
        ],
        { source: 'manual', label },
      );
    } catch (error) {
      state.notify(error instanceof Error ? error.message : 'This item could not be operated.');
    }
  };
  useFrame(({ camera, scene, clock }, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.16 || !anchor.current || !button.current) return;
    elapsed.current = 0;
    const state = useProject.getState();
    let visible =
      useExperience.getState().stage === 'ready' &&
      state.mode === 'walk' &&
      state.floorId === object.floorId &&
      !state.interacting &&
      !useNavigation.getState().request &&
      !useNavigation.getState().mapOpen &&
      (!state.selection || state.selection.id === object.id) &&
      isVisible(anchor.current);
    if (visible) {
      anchor.current.getWorldPosition(point);
      const distance = camera.position.distanceTo(point);
      visible = distance < 2.8;
      if (visible) {
        direction.copy(point).sub(camera.position).normalize();
        ray.set(camera.position, direction);
        ray.near = 0.05;
        ray.far = Math.max(0.05, distance - 0.04);
        point.project(camera);
        visible = Math.abs(point.x) < 0.9 && Math.abs(point.y) < 0.85 && Math.abs(point.z) < 1;
        if (visible) {
          if (!raycastBudget.acquire(clock.elapsedTime)) {
            elapsed.current = 0.16;
            return;
          }
          visible = !ray
            .intersectObjects(scene.children, true)
            .some((hit) => fixtureOccludes(hit, distance));
        }
      }
    }
    button.current.hidden = !visible;
  });
  if (
    !enabled ||
    stage !== 'ready' ||
    mode !== 'walk' ||
    floorId !== object.floorId ||
    !object.behaviours.some((value) => value.kind === capability)
  )
    return children;
  return (
    <group
      onClick={(event) => {
        if (!isScenePointer(event) || !isVisible(event.object) || event.delta > 5 || !reachable())
          return;
        event.stopPropagation();
        operate();
      }}
    >
      {children}
      <group ref={anchor} position={position}>
        <Html center zIndexRange={[15, 10]}>
          <button
            ref={button}
            hidden
            className="fixture-handle"
            aria-label={`${label} · ${object.label}`}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              operate();
            }}
          >
            <span>{label}</span>
          </button>
        </Html>
      </group>
    </group>
  );
}
