import { useEffect, useRef } from 'react';
import type { ComponentRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { buildNavigation, findPath } from '@refloor/engine';
import type { Point3 } from '@refloor/engine';
import { useProject } from '@/shared/scene/scene-store';
import { entryPose } from '@/shared/navigation/entry';
import { physicsSession } from '@/shared/navigation/physics-session';
import { isTyping, walkInput } from '@/shared/navigation/input';

export function NavigationControls() {
  const { camera, gl, size } = useThree(),
    controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const floorId = useProject((state) => state.floorId),
    compiled = useProject((state) => state.compiled),
    epoch = useProject((state) => state.projectEpoch),
    mode = useProject((state) => state.mode),
    interacting = useProject((state) => state.interacting),
    travel = useProject((state) => state.travelRequest);
  const previous = useRef(mode),
    transition = useRef<number | null>(null),
    entry = entryPose(compiled),
    route = useRef<{
      points: Point3[];
      index: number;
      delay: number;
      last: Point3;
      idle: number;
    } | null>(null);
  const floor = compiled.building.floors.find((value) => value.id === floorId),
    elevation = floor?.elevation ?? 0,
    centreX = (floor?.footprint.x ?? 0) + (floor?.footprint.width ?? 12) / 2,
    centreZ = (floor?.footprint.z ?? 0) + (floor?.footprint.depth ?? 10) / 2,
    span = Math.max(floor?.footprint.width ?? 12, floor?.footprint.depth ?? 10);
  const forward = useRef(new Vector3()),
    right = useRef(new Vector3()),
    target = useRef(new Vector3());
  useEffect(() => {
    camera.rotation.order = 'YXZ';
    if (mode === 'entry') {
      const portrait = size.width / size.height < 0.8;
      if (camera instanceof PerspectiveCamera) {
        camera.fov = portrait ? 65 : 45;
        camera.updateProjectionMatrix();
      }
      camera.position.set(entry.outside.x, entry.outside.y, entry.outside.z);
      camera.lookAt(
        entry.target.x - (portrait ? entry.normal.z * 0.65 : 0),
        portrait ? entry.target.y + 0.7 : entry.target.y,
        entry.target.z + (portrait ? entry.normal.x * 0.65 : 0),
      );
    }
    if (mode === 'orbit') {
      camera.position.set(centreX + span * 0.85, span + elevation, centreZ - span * 1.1);
      controls.current?.target.set(centreX, elevation + 0.5, centreZ);
      controls.current?.update();
      route.current = null;
    }
    if (mode === 'walk') {
      transition.current = previous.current === 'entry' ? 0 : null;
      const pose = physicsSession.current?.feet ?? entry.inside;
      if (transition.current === null) {
        camera.position.set(pose.x, pose.y + 1.62, pose.z);
        camera.lookAt(pose.x + entry.normal.x, pose.y + 1.62, pose.z + entry.normal.z);
      }
      walkInput.yaw = camera.rotation.y;
      walkInput.pitch = camera.rotation.x;
    }
    walkInput.keys.clear();
    previous.current = mode;
  }, [camera, mode, compiled.building.id, epoch, size.width, size.height]);
  useEffect(() => {
    if (mode === 'orbit') {
      camera.position.set(centreX + span * 0.85, span + elevation, centreZ - span * 1.1);
      controls.current?.target.set(centreX, elevation + 0.5, centreZ);
      controls.current?.update();
    }
  }, [camera, elevation, mode, centreX, centreZ, span]);
  const focus = useProject((state) => state.focusRequest);
  useEffect(() => {
    if (!focus || mode !== 'orbit') return;
    const object = compiled.building.objects.find((value) => value.id === focus.objectId);
    if (!object) return;
    const y =
      (compiled.building.floors.find((value) => value.id === object.floorId)?.elevation ?? 0) +
      object.position.y +
      object.dimensions.height / 2;
    const distance = Math.max(3, Math.max(object.dimensions.width, object.dimensions.depth) * 2.2);
    camera.position.set(
      object.position.x +
        Math.sin(object.rotation) * distance +
        Math.cos(object.rotation) * distance * 0.35,
      y + distance * 0.65,
      object.position.z +
        Math.cos(object.rotation) * distance -
        Math.sin(object.rotation) * distance * 0.35,
    );
    controls.current?.target.set(object.position.x, y, object.position.z);
    controls.current?.update();
  }, [focus?.id, mode, camera]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target) || useProject.getState().mode !== 'walk') return;
      if (
        ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift'].includes(
          event.key,
        )
      ) {
        event.preventDefault();
        walkInput.keys.add(event.key.toLowerCase());
      }
      if (event.key === 'Escape') useProject.getState().setMode('orbit');
    };
    const up = (event: KeyboardEvent) => walkInput.keys.delete(event.key.toLowerCase()),
      blur = () => walkInput.keys.clear();
    let pointer: { x: number; y: number; moved: number } | null = null;
    const pointerDown = (event: PointerEvent) => {
      if (
        useProject.getState().mode === 'walk' &&
        !useProject.getState().interacting &&
        event.button === 0
      ) {
        walkInput.dragged = false;
        pointer = { x: event.clientX, y: event.clientY, moved: 0 };
      }
    };
    const pointerMove = (event: PointerEvent) => {
      if (!pointer || useProject.getState().interacting) return;
      const dx = event.clientX - pointer.x,
        dy = event.clientY - pointer.y;
      walkInput.yaw -= dx * 0.003;
      walkInput.pitch = MathUtils.clamp(walkInput.pitch - dy * 0.003, -1.3, 1.3);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.moved += Math.abs(dx) + Math.abs(dy);
      walkInput.dragged = pointer.moved > 4;
      if (walkInput.dragged) route.current = null;
    };
    const pointerUp = () => {
      pointer = null;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    gl.domElement.addEventListener('pointerdown', pointerDown);
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      gl.domElement.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
    };
  }, [gl]);
  useEffect(() => {
    if (!travel || mode !== 'walk') return;
    const world = physicsSession.current,
      state = useProject.getState();
    if (!world) return;
    const stair = compiled.stairs.find(
      (value) => value.lower.floorId === travel.floorId || value.upper.floorId === travel.floorId,
    );
    const destination = stair?.lower.floorId === travel.floorId ? stair.lower : stair?.upper;
    if (!destination) {
      state.notify('This floor has no connected staircase.');
      return;
    }
    const player = world.player,
      currentFloor = compiled.building.floors.find((value) => value.id === player.floorId);
    if (!currentFloor || Math.abs(player.position.y - currentFloor.elevation) > 0.1) {
      state.notify('Finish this flight before choosing another floor.');
      return;
    }
    const from = {
        floorId: player.floorId,
        position: { ...player.position, y: currentFloor.elevation },
      },
      path = findPath(buildNavigation(compiled), from, destination);
    if (!path) {
      state.notify('There is no clear route to that floor.');
      return;
    }
    for (const id of path.doorIds) if (!state.setDoor(id, true)) return;
    const next = useProject.getState().compiled,
      opened = findPath(buildNavigation(next, 'current'), from, destination);
    if (!opened) {
      state.notify('Open the passage before walking to this floor.');
      return;
    }
    route.current = { points: opened.points, index: 0, delay: 0.8, last: player.position, idle: 0 };
    state.notify('Following the staircase. Use WASD to take over.');
  }, [travel?.id]);
  useFrame((_state, delta) => {
    if (mode !== 'walk') return;
    if (interacting || document.activeElement?.closest('input, textarea, select, [role=dialog]')) {
      walkInput.keys.clear();
      route.current = null;
      return;
    }
    const world = physicsSession.current;
    if (!world) return;
    const dt = Math.min(delta, 0.05),
      feet = world.feet;
    if (transition.current !== null) {
      transition.current += dt;
      const t = MathUtils.smootherstep(transition.current, 0.5, 1.9);
      target.current.set(feet.x, feet.y + 1.62, feet.z);
      camera.position
        .set(entry.outside.x, entry.outside.y, entry.outside.z)
        .lerp(target.current, t);
      camera.lookAt(feet.x + entry.normal.x * 5, feet.y + 1.5, feet.z + entry.normal.z * 5);
      walkInput.yaw = camera.rotation.y;
      walkInput.pitch = camera.rotation.x;
      if (transition.current >= 1.9) transition.current = null;
      return;
    }
    let x = 0,
      z = 0;
    const keys = walkInput.keys,
      manual = keys.size > 0;
    if (manual) route.current = null;
    const active = route.current;
    if (active) {
      active.delay -= dt;
      if (active.delay <= 0) {
        let point = active.points[active.index];
        while (point && Math.hypot(point.x - feet.x, point.z - feet.z) < 0.025) {
          active.index++;
          point = active.points[active.index];
        }
        if (!point) {
          route.current = null;
          useProject.getState().notify('You’re here. Make yourself at home.');
        } else {
          const distance = Math.hypot(point.x - feet.x, point.z - feet.z);
          x = ((point.x - feet.x) / distance) * Math.min(1.5, distance / Math.max(dt, 0.001));
          z = ((point.z - feet.z) / distance) * Math.min(1.5, distance / Math.max(dt, 0.001));
          const desired = Math.atan2(-x, -z),
            difference = Math.atan2(
              Math.sin(desired - walkInput.yaw),
              Math.cos(desired - walkInput.yaw),
            );
          walkInput.yaw += difference * Math.min(1, dt * 3);
          if (Math.hypot(feet.x - active.last.x, feet.z - active.last.z) < 0.0001)
            active.idle += dt;
          else active.idle = 0;
          active.last = feet;
          if (active.idle > 1.5) {
            route.current = null;
            useProject
              .getState()
              .notify('The path is blocked. Use the movement controls to continue.');
          }
        }
      }
    } else {
      camera.rotation.set(walkInput.pitch, walkInput.yaw, 0, 'YXZ');
      camera.getWorldDirection(forward.current);
      forward.current.y = 0;
      forward.current.normalize();
      right.current.crossVectors(forward.current, new Vector3(0, 1, 0));
      const f =
          Number(keys.has('w') || keys.has('arrowup')) -
          Number(keys.has('s') || keys.has('arrowdown')),
        r =
          Number(keys.has('d') || keys.has('arrowright')) -
          Number(keys.has('a') || keys.has('arrowleft'));
      const length = Math.hypot(f, r) || 1,
        speed = keys.has('shift') ? 2.5 : 1.65;
      x = ((forward.current.x * f + right.current.x * r) / length) * speed;
      z = ((forward.current.z * f + right.current.z * r) / length) * speed;
    }
    world.step({ x, z }, dt);
    const next = world.feet;
    camera.position.set(next.x, next.y + 1.62, next.z);
    camera.rotation.set(walkInput.pitch, walkInput.yaw, 0, 'YXZ');
    const nextFloor = world.player.floorId;
    if (nextFloor && nextFloor !== useProject.getState().floorId)
      useProject.getState().setWalkFloor(nextFloor);
  }, -1);
  return mode === 'orbit' ? (
    <OrbitControls
      ref={controls}
      makeDefault
      target={[centreX, elevation + 0.5, centreZ]}
      enabled={!interacting}
      minDistance={3}
      maxDistance={35}
      maxPolarAngle={Math.PI / 2 - 0.07}
      enableDamping
      dampingFactor={0.08}
    />
  ) : null;
}
