import { useEffect, useRef } from 'react';
import type { ComponentRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { CompiledBuilding } from '@refloor/engine';
import { destinationRoute, smoothRoute } from '@/shared/navigation/destinations';
import { createJourney, stepJourney } from '@/shared/navigation/journey';
import type { Journey } from '@/shared/navigation/journey';
import { useNavigation } from '@/shared/navigation/navigation-store';
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
    selection = useProject((state) => state.selection);
  const overview = useNavigation((state) => state.overview);
  const previous = useRef(mode),
    transition = useRef<number | null>(null),
    entry = entryPose(compiled),
    route = useRef<{ id: string; compiled: CompiledBuilding; journey: Journey } | null>(null);
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
    if (mode !== 'walk') useNavigation.getState().stop();
    route.current = null;
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
      if (camera instanceof PerspectiveCamera) {
        camera.fov = 65;
        camera.updateProjectionMatrix();
      }
      transition.current = previous.current === 'entry' ? 0 : null;
      const pose = physicsSession.current?.feet ?? entry.inside;
      if (transition.current === null) {
        camera.position.set(pose.x, pose.y + 1.62, pose.z);
        if (previous.current === 'orbit')
          camera.rotation.set(walkInput.pitch, walkInput.yaw, 0, 'YXZ');
        else camera.lookAt(pose.x + entry.normal.x * 5, pose.y + 0.9, pose.z + entry.normal.z * 5);
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
  }, [camera, elevation, mode, centreX, centreZ, span, overview]);
  useEffect(() => {
    if (selection || interacting) useNavigation.getState().stop();
  }, [selection, interacting]);
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
      if (
        isTyping(event.target) ||
        useProject.getState().mode !== 'walk' ||
        useNavigation.getState().mapOpen
      )
        return;
      const key = event.key.toLowerCase();
      if (
        ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(
          key,
        )
      ) {
        event.preventDefault();
        useNavigation.getState().stop();
        useProject.getState().select(null);
        walkInput.keys.add(key);
      }
      if (event.key === 'Escape') {
        useProject.getState().select(null);
        useNavigation.getState().stop();
      }
    };
    const up = (event: KeyboardEvent) => walkInput.keys.delete(event.key.toLowerCase()),
      blur = () => {
        walkInput.keys.clear();
        useNavigation.getState().stop();
        pointerUp();
      };
    let pointer: { id: number; x: number; y: number } | null = null;
    const pointerDown = (event: PointerEvent) => {
      if (
        useProject.getState().mode === 'walk' &&
        !useProject.getState().interacting &&
        event.button === 0
      ) {
        useNavigation.getState().stop();
        gl.domElement.setPointerCapture(event.pointerId);
        pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }
    };
    const pointerMove = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId || useProject.getState().interacting) return;
      if (!(event.buttons & 1)) {
        pointer = null;
        return;
      }
      const dx = event.clientX - pointer.x,
        dy = event.clientY - pointer.y;
      const sensitivity =
        Math.PI / Math.max(480, Math.min(gl.domElement.clientWidth, gl.domElement.clientHeight));
      walkInput.yaw -= dx * sensitivity;
      walkInput.pitch = MathUtils.clamp(walkInput.pitch - dy * sensitivity, -1.1, 1.1);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    const pointerUp = () => {
      if (pointer && gl.domElement.hasPointerCapture(pointer.id))
        gl.domElement.releasePointerCapture(pointer.id);
      pointer = null;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', blur);
    gl.domElement.addEventListener('pointerdown', pointerDown);
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerUp);
    gl.domElement.addEventListener('lostpointercapture', pointerUp);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', blur);
      gl.domElement.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', pointerUp);
      gl.domElement.removeEventListener('lostpointercapture', pointerUp);
      useNavigation.getState().stop();
    };
  }, [gl]);
  useFrame((_state, delta) => {
    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    forward.current.normalize();
    walkInput.view = { x: forward.current.x, z: forward.current.z };
    if (mode !== 'walk') return;
    if (interacting || isTyping(document.activeElement)) {
      walkInput.keys.clear();
      route.current = null;
      if (useNavigation.getState().request) useNavigation.getState().stop();
      return;
    }
    const world = physicsSession.current;
    if (!world || world.compiled !== compiled) return;
    const dt = Math.min(delta, 0.05),
      feet = world.feet;
    if (transition.current !== null) {
      transition.current += dt;
      const t = MathUtils.smootherstep(transition.current, 0.5, 1.9);
      target.current.set(feet.x, feet.y + 1.62, feet.z);
      camera.position
        .set(entry.outside.x, entry.outside.y, entry.outside.z)
        .lerp(target.current, t);
      camera.lookAt(feet.x + entry.normal.x * 5, feet.y + 0.9, feet.z + entry.normal.z * 5);
      walkInput.yaw = camera.rotation.y;
      walkInput.pitch = camera.rotation.x;
      if (transition.current >= 1.9) transition.current = null;
      return;
    }
    const keys = walkInput.keys;
    const f =
      Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
    const r = Number(keys.has('d')) - Number(keys.has('a'));
    const turn = Number(keys.has('arrowright')) - Number(keys.has('arrowleft'));
    walkInput.yaw -= turn * dt * 1.7;
    const request = useNavigation.getState().request;
    if (request && (route.current?.id !== request.id || route.current.compiled !== compiled)) {
      const state = useProject.getState(),
        openable = destinationRoute(compiled, world.player, request.target, 'openable');
      if (openable?.doorIds.length) {
        if (
          !state.edit(
            openable.doorIds.map((doorId) => ({ type: 'set-door', doorId, open: true })),
            { source: 'navigation' },
          )
        )
          useNavigation.getState().stop();
        return;
      }
      const path = destinationRoute(compiled, world.player, request.target, 'current');
      if (!path) {
        state.notify('That spot is blocked. Choose another marker.');
        useNavigation.getState().stop();
        return;
      }
      route.current = {
        id: request.id,
        compiled,
        journey: createJourney(smoothRoute(compiled, path.points)),
      };
    }
    const active = request ? route.current?.journey : null;
    if (active && request) {
      const status = stepJourney(world, active, dt);
      let heading = active.heading;
      const remaining = Math.hypot(
        world.feet.x - request.target.position.x,
        world.feet.z - request.target.position.z,
      );
      if (
        request?.lookAt &&
        remaining < 1.4 &&
        Math.hypot(request.lookAt.x - world.feet.x, request.lookAt.z - world.feet.z) > 0.5
      ) {
        const facing = Math.atan2(world.feet.x - request.lookAt.x, world.feet.z - request.lookAt.z);
        heading =
          heading === null
            ? facing
            : heading +
              Math.atan2(Math.sin(facing - heading), Math.cos(facing - heading)) *
                (1 - remaining / 1.4);
      }
      let angle = 0;
      if (heading !== null) {
        angle = Math.atan2(Math.sin(heading - walkInput.yaw), Math.cos(heading - walkInput.yaw));
        walkInput.yaw += MathUtils.clamp(angle, -dt * 2.4, dt * 2.4);
      }
      walkInput.pitch = MathUtils.damp(walkInput.pitch, -0.14, 4, dt);
      if (status === 'blocked' || (status === 'arrived' && Math.abs(angle) < 0.04)) {
        useNavigation.getState().stop();
        if (status === 'blocked')
          useProject.getState().notify('The path changed. Choose another marker.');
      }
    } else {
      camera.rotation.set(walkInput.pitch, walkInput.yaw, 0, 'YXZ');
      camera.getWorldDirection(forward.current);
      forward.current.y = 0;
      forward.current.normalize();
      right.current.crossVectors(forward.current, new Vector3(0, 1, 0));
      const length = Math.max(1, Math.hypot(f, r)),
        speed = keys.has('shift') ? 2.5 : 1.65;
      const x = ((forward.current.x * f + right.current.x * r) / length) * speed,
        z = ((forward.current.z * f + right.current.z * r) / length) * speed;
      world.step({ x, z }, dt);
    }
    const next = world.feet;
    camera.position.set(next.x, MathUtils.damp(camera.position.y, next.y + 1.62, 12, dt), next.z);
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
