import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { isTyping, walkInput } from '@/shared/navigation/input';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { useProject } from '@/shared/scene/scene-store';
import { useExperience } from '@/shared/scene/experience-store';
import { usePlayback } from '@/shared/behaviours/television';
import { scenePresentation } from '@/shared/scene/presentation';
import { renderActivity } from '@/shared/scene/render-activity';
import { showInteractionHand } from '@/shared/editor/interaction-hand';

export function RenderCadence() {
  const invalidate = useThree((state) => state.invalidate),
    canvas = useThree((state) => state.gl.domElement),
    wakeUntil = useRef(0),
    pressed = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const cancel = () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
    const wake = () => {
      cancel();
      wakeUntil.current = performance.now() + 900;
      if (!document.hidden) invalidate();
    };
    const down = (event: PointerEvent) => {
      if (event.target === canvas) pressed.current = true;
      wake();
    };
    const up = () => {
      pressed.current = false;
      wake();
    };
    const key = (event: KeyboardEvent) => {
      if (!isTyping(event.target)) wake();
    };
    const wheel = (event: WheelEvent) => {
      if (event.target === canvas) wake();
    };
    const move = (event: PointerEvent) => {
      if (
        (pressed.current && event.buttons) ||
        (event.target === canvas &&
          useProject.getState().mode !== 'orbit' &&
          showInteractionHand(canvas.clientWidth, canvas.clientHeight))
      )
        wake();
    };
    const visibility = () => {
      pressed.current = false;
      cancel();
      if (!document.hidden) wake();
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    document.addEventListener('keydown', key);
    document.addEventListener('keyup', key);
    document.addEventListener('wheel', wheel, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', visibility);
    window.addEventListener('focus', wake);
    const unsubscribe = useExperience.subscribe(wake);
    wake();
    return () => {
      cancel();
      unsubscribe();
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      document.removeEventListener('keydown', key);
      document.removeEventListener('keyup', key);
      document.removeEventListener('wheel', wheel);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', visibility);
      window.removeEventListener('focus', wake);
    };
  }, [canvas, invalidate]);
  useFrame(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const project = useProject.getState(),
      stage = useExperience.getState().stage;
    if (document.hidden || stage === 'prompt') return;
    renderActivity.continuous = Boolean(
      !project.sceneReady ||
      stage !== 'ready' ||
      project.interacting ||
      pressed.current ||
      performance.now() < wakeUntil.current ||
      walkInput.keys.size ||
      walkInput.pad.x ||
      walkInput.pad.y ||
      walkInput.turn ||
      useNavigation.getState().request ||
      scenePresentation.animating(project.compiled.building.id) ||
      scenePresentation.pending(project.compiled.building.id),
    );
    if (renderActivity.continuous) invalidate();
    else {
      const playing =
        Object.values(usePlayback.getState().players).some(
          (player) => player.status === 'playing',
        ) ||
        project.compiled.building.objects.some((object) =>
          object.behaviours.some((behaviour) =>
            behaviour.kind === 'water'
              ? behaviour.state.powered && behaviour.state.flow > 0
              : behaviour.kind === 'cooker'
                ? behaviour.state.powered &&
                  behaviour.state.heat > 0 &&
                  behaviour.state.burners.some(Boolean)
                : false,
          ),
        );
      // Keep ambient motion alive without running the full game loop at rest.
      timer.current = setTimeout(invalidate, 1000 / (playing ? 30 : 12));
    }
  }, -101);
  return null;
}
