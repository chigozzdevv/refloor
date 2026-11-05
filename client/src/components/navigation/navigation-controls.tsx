import { useEffect, useMemo, useRef } from 'react';
import type { ComponentRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { useProject } from '@/shared/scene/scene-store';
import { entryPose } from '@/shared/navigation/entry';
import { physicsSession } from '@/shared/navigation/physics-session';
import {
  isTyping,
  movementInput,
  resetWalkInput,
  turningInput,
  walkInput,
} from '@/shared/navigation/input';
import { StairWalker } from '@/shared/navigation/stair-assist';
import { entranceArrival } from '@/shared/navigation/arrival';
import { exteriorCamera } from '@/shared/scene/exterior';
import { Walkthrough } from '@/shared/navigation/walkthrough';
import { useExperience } from '@/shared/scene/experience-store';
import {
  applySceneView,
  flushSceneView,
  rememberSceneView,
  takeSceneView,
} from '@/shared/scene/view';
import { resizeOrbitCamera } from '@/shared/scene/orbit-framing';
import { navigationPace } from '@/shared/navigation/pacing';

export function NavigationControls() {
  const { camera, gl, size } = useThree(),
    controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const compiled = useProject((state) => state.compiled),
    epoch = useProject((state) => state.projectEpoch),
    mode = useProject((state) => state.mode),
    interacting = useProject((state) => state.interacting),
    selection = useProject((state) => state.selection);
  const overview = useNavigation((state) => state.overview);
  const stage = useExperience((state) => state.stage);
  const outside = exteriorCamera(compiled, size.width / size.height);
  const exteriorPosition = outside.position;
  const previous = useRef(mode),
    walkthrough = useRef(new Walkthrough()),
    framing = useRef<{
      mode: typeof mode;
      buildingId: string;
      epoch: number;
      aspect: number;
    } | null>(null),
    stairs = useRef(new StairWalker()),
    transition = useRef<number | null>(null),
    entry = entryPose(compiled);
  const entryFacing = useMemo(() => entranceArrival(compiled), [compiled]);
  const forward = useRef(new Vector3()),
    right = useRef(new Vector3()),
    target = useRef(new Vector3());
  useEffect(() => {
    if (stage !== 'ready') {
      framing.current = null;
      return;
    }
    const savedView = takeSceneView(compiled);
    if (savedView) {
      applySceneView(savedView, camera, controls.current);
      const world = physicsSession.current;
      if (
        savedView.player &&
        world?.compiled === compiled &&
        Math.hypot(
          world.feet.x - savedView.player.position.x,
          world.feet.y - savedView.player.position.y,
          world.feet.z - savedView.player.position.z,
        ) > 0.03
      )
        world.teleport(savedView.player.position);
      walkInput.yaw = camera.rotation.y;
      walkInput.pitch = camera.rotation.x;
      resetWalkInput();
      transition.current = null;
      walkthrough.current.reset();
      stairs.current.reset();
      walkthrough.current.doors.clear();
      walkthrough.current.doors.recover(compiled, useProject.getState().memory);
      previous.current = mode;
      framing.current = {
        mode,
        buildingId: compiled.building.id,
        epoch,
        aspect: size.width / size.height,
      };
      return;
    }
    const framed = framing.current;
    if (
      framed?.mode === mode &&
      framed.buildingId === compiled.building.id &&
      framed.epoch === epoch
    ) {
      const aspect = size.width / size.height;
      if (
        mode === 'orbit' &&
        camera instanceof PerspectiveCamera &&
        controls.current &&
        Math.abs(framed.aspect - aspect) > 1e-6
      ) {
        resizeOrbitCamera(camera, controls.current.target, framed.aspect);
        controls.current.update();
      }
      framed.aspect = aspect;
      return;
    }
    framing.current = {
      mode,
      buildingId: compiled.building.id,
      epoch,
      aspect: size.width / size.height,
    };
    camera.rotation.order = 'YXZ';
    if (mode !== 'walk') useNavigation.getState().stop();
    walkthrough.current.reset();
    if (mode === 'entry') {
      walkthrough.current.doors.clear();
      const portrait = size.width / size.height < 0.8;
      if (camera instanceof PerspectiveCamera) {
        camera.fov = portrait ? 55 : 45;
        camera.updateProjectionMatrix();
      }
      camera.position.set(entry.outside.x, entry.outside.y, entry.outside.z);
      camera.lookAt(entry.target.x, entry.target.y, entry.target.z);
    }
    if (mode === 'orbit') {
      if (camera instanceof PerspectiveCamera) {
        camera.fov = 45;
        camera.updateProjectionMatrix();
      }
      camera.position.set(exteriorPosition.x, exteriorPosition.y, exteriorPosition.z);
      controls.current?.target.set(outside.target.x, outside.target.y, outside.target.z);
      controls.current?.update();
      walkthrough.current.reset();
    }
    if (mode === 'walk') {
      if (previous.current === 'entry') {
        walkthrough.current.doors.recover(compiled, useProject.getState().memory);
        const door = compiled.doors.find((value) => value.id === entry.doorId);
        if (door?.open) walkthrough.current.doors.entrance(door, entry.outside);
      }
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
    resetWalkInput();
    stairs.current.reset();
    previous.current = mode;
  }, [camera, mode, stage, compiled.building.id, epoch, size.width, size.height]);
  const previousOverview = useRef(overview);
  useEffect(() => {
    if (previousOverview.current === overview) return;
    previousOverview.current = overview;
    if (mode === 'orbit') {
      camera.position.set(exteriorPosition.x, exteriorPosition.y, exteriorPosition.z);
      controls.current?.target.set(outside.target.x, outside.target.y, outside.target.z);
      controls.current?.update();
    }
  }, [
    camera,
    mode,
    exteriorPosition.x,
    exteriorPosition.y,
    exteriorPosition.z,
    outside.target.x,
    outside.target.y,
    outside.target.z,
    overview,
  ]);
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
        useExperience.getState().stage !== 'ready' ||
        useProject.getState().mode !== 'walk' ||
        useNavigation.getState().mapOpen ||
        useNavigation.getState().panelOpen
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
        resetWalkInput();
        pointerUp();
      };
    let pointer: { id: number; x: number; y: number; dragging: boolean } | null = null;
    const pointerDown = (event: PointerEvent) => {
      if (
        useProject.getState().mode === 'walk' &&
        useExperience.getState().stage === 'ready' &&
        !useNavigation.getState().panelOpen &&
        !useProject.getState().interacting &&
        event.button === 0
      ) {
        useNavigation.getState().stop();
        gl.domElement.setPointerCapture(event.pointerId);
        pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
      }
    };
    const pointerMove = (event: PointerEvent) => {
      if (
        !pointer ||
        pointer.id !== event.pointerId ||
        useProject.getState().interacting ||
        useExperience.getState().stage !== 'ready'
      )
        return;
      if (!(event.buttons & 1)) {
        pointer = null;
        return;
      }
      const dx = event.clientX - pointer.x,
        dy = event.clientY - pointer.y;
      if (!pointer.dragging && Math.hypot(dx, dy) < 5) return;
      pointer.dragging = true;
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
      resetWalkInput();
    };
  }, [gl]);
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === 'hidden') flushSceneView();
    };
    window.addEventListener('pagehide', flushSceneView);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', flushSceneView);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  useFrame((_state, delta) => {
    if (stage !== 'ready') return;
    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    forward.current.normalize();
    walkInput.view = { x: forward.current.x, z: forward.current.z };
    if (mode !== 'walk') return;
    if (
      interacting ||
      selection ||
      useNavigation.getState().mapOpen ||
      useNavigation.getState().panelOpen ||
      isTyping(document.activeElement)
    ) {
      resetWalkInput();
      stairs.current.reset();
      walkthrough.current.reset();
      if (useNavigation.getState().request) useNavigation.getState().stop();
      return;
    }
    const world = physicsSession.current;
    if (!world || world.compiled !== compiled) return;
    const dt = Math.min(delta, 0.05),
      feet = world.feet;
    if (transition.current !== null) {
      transition.current += Math.min(delta, 0.12);
      const t = MathUtils.smootherstep(transition.current, 0.04, 0.72);
      target.current.set(entry.threshold.x, entry.threshold.y + 1.62, entry.threshold.z);
      if (t < 0.65)
        camera.position
          .set(entry.outside.x, entry.outside.y, entry.outside.z)
          .lerp(target.current, t / 0.65);
      else
        camera.position
          .copy(target.current)
          .lerp(new Vector3(feet.x, feet.y + 1.62, feet.z), (t - 0.65) / 0.35);
      const facing = entryFacing;
      camera.lookAt(
        MathUtils.lerp(feet.x + entry.normal.x * 5, facing?.x ?? feet.x + entry.normal.x * 5, t),
        MathUtils.lerp(feet.y + 0.9, facing?.y ?? feet.y + 0.9, t),
        MathUtils.lerp(feet.z + entry.normal.z * 5, facing?.z ?? feet.z + entry.normal.z * 5, t),
      );
      walkInput.yaw = camera.rotation.y;
      walkInput.pitch = camera.rotation.x;
      if (transition.current >= 0.72) transition.current = null;
      return;
    }
    const keys = walkInput.keys;
    const input = movementInput(),
      f = input.y,
      r = input.x;
    const turn = turningInput();
    walkInput.yaw -= turn * dt * 1.7;
    const request = useNavigation.getState().request;
    const step = walkthrough.current.step(
      world,
      request,
      walkInput,
      dt,
      useProject.getState().memory,
    );
    if (step.commands.length) {
      if (!useProject.getState().edit(step.commands, { source: 'navigation' }))
        useNavigation.getState().stop();
      return;
    }
    if (request) {
      stairs.current.reset();
      walkInput.yaw = step.yaw;
      walkInput.pitch = step.pitch;
      if (step.status === 'arrived' || step.status === 'blocked') {
        useNavigation.getState().stop();
        if (step.status === 'blocked')
          useProject
            .getState()
            .notify('This route is obstructed. Move the blocking item to continue.');
      }
    } else {
      const assisted = stairs.current.step(
        world,
        { forward: f, sideways: r, turn },
        walkInput.yaw,
        dt,
      );
      if (assisted) {
        const { yaw, status, ascending } = assisted;
        walkInput.yaw = yaw;
        walkInput.pitch = MathUtils.damp(walkInput.pitch, ascending ? 0.08 : -0.3, 4, dt);
        if (status === 'blocked')
          useProject
            .getState()
            .notify('The stairs are obstructed. Move away or choose a stair marker.');
      } else {
        camera.rotation.set(walkInput.pitch, walkInput.yaw, 0, 'YXZ');
        camera.getWorldDirection(forward.current);
        forward.current.y = 0;
        forward.current.normalize();
        right.current.crossVectors(forward.current, new Vector3(0, 1, 0));
        const length = Math.max(1, Math.hypot(f, r)),
          speed = keys.has('shift') ? navigationPace.fastWalk : navigationPace.walk;
        const x = ((forward.current.x * f + right.current.x * r) / length) * speed,
          z = ((forward.current.z * f + right.current.z * r) / length) * speed;
        world.step({ x, z }, dt);
      }
    }
    const next = world.feet;
    camera.position.set(next.x, MathUtils.damp(camera.position.y, next.y + 1.62, 12, dt), next.z);
    camera.rotation.set(walkInput.pitch, walkInput.yaw, 0, 'YXZ');
    const nextFloor = world.player.floorId;
    if (nextFloor && nextFloor !== useProject.getState().floorId)
      useProject.getState().setWalkFloor(nextFloor);
  }, -1);
  useFrame(({ clock }) => {
    if (stage !== 'ready' || transition.current !== null) return;
    const state = useProject.getState(),
      world = physicsSession.current;
    if (state.mode === 'walk' && world?.compiled !== state.compiled) return;
    const player = world?.compiled === state.compiled ? world.player : null;
    rememberSceneView(
      {
        version: 1,
        buildingId: state.compiled.building.id,
        mode: state.mode,
        floorId: state.mode === 'walk' && player ? player.floorId : state.floorId,
        lighting: state.lighting,
        cutaway: state.cutaway,
        camera: {
          position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          rotation: { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z },
          fov: camera instanceof PerspectiveCamera ? camera.fov : 45,
          ...(camera instanceof PerspectiveCamera ? { aspect: camera.aspect } : {}),
        },
        target:
          mode === 'orbit' && controls.current
            ? {
                x: controls.current.target.x,
                y: controls.current.target.y,
                z: controls.current.target.z,
              }
            : null,
        player,
      },
      clock.elapsedTime * 1000,
    );
  }, -0.2);
  return mode === 'orbit' ? (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={stage === 'ready' && !interacting}
      minDistance={3}
      maxDistance={Math.max(35, outside.distance * 2)}
      maxPolarAngle={Math.PI / 2 - 0.07}
      enableDamping
      dampingFactor={0.08}
    />
  ) : null;
}
