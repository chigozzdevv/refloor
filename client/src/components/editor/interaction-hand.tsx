import { useEffect } from 'react';
import { useProject } from '@/shared/scene/scene-store';
import { useNavigation } from '@/shared/navigation/navigation-store';
import {
  handPointer,
  handTap,
  interactionHand,
  isHandSurface,
} from '@/shared/editor/interaction-hand';

export function InteractionHand() {
  useEffect(() => {
    let start: { x: number; y: number; id: number } | null = null,
      dragged = false,
      release: ReturnType<typeof setTimeout> | undefined;
    const place = (x: number, y: number) => {
      Object.assign(interactionHand, handPointer(x, y, window.innerWidth, window.innerHeight));
    };
    const settle = () => {
      clearTimeout(release);
      release = setTimeout(() => {
        interactionHand.pressed = false;
      }, 220);
    };
    const move = (event: PointerEvent) => {
      if (start?.id === event.pointerId && !handTap(start, { x: event.clientX, y: event.clientY }))
        dragged = true;
      if (dragged) interactionHand.pressed = false;
      if (
        event.pointerType !== 'mouse' ||
        !isHandSurface(event.target) ||
        useProject.getState().selection
      )
        return;
      place(event.clientX, event.clientY);
    };
    const down = (event: PointerEvent) => {
      start =
        event.pointerType === 'mouse' && event.button === 0 && isHandSurface(event.target)
          ? { x: event.clientX, y: event.clientY, id: event.pointerId }
          : null;
      dragged = false;
      const project = useProject.getState(),
        nav = useNavigation.getState();
      if (start && project.mode !== 'orbit' && !nav.panelOpen && !nav.mapOpen) {
        clearTimeout(release);
        place(event.clientX, event.clientY);
        interactionHand.pressed = true;
      }
    };
    const up = (event: PointerEvent) => {
      if (start?.id === event.pointerId) settle();
    };
    const click = (event: MouseEvent) => {
      if (!isHandSurface(event.target) || (event.detail !== 0 && (!start || dragged))) return;
      const project = useProject.getState(),
        nav = useNavigation.getState();
      if (project.mode === 'orbit' || nav.panelOpen || nav.mapOpen) return;
      const bounds = event.target instanceof Element ? event.target.getBoundingClientRect() : null;
      place(
        event.detail === 0 && bounds ? bounds.x + bounds.width / 2 : event.clientX,
        event.detail === 0 && bounds ? bounds.y + bounds.height / 2 : event.clientY,
      );
      clearTimeout(release);
      interactionHand.pressed = true;
      settle();
      start = null;
    };
    const reset = () => {
      clearTimeout(release);
      start = null;
      dragged = false;
      interactionHand.pressed = false;
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('click', click, true);
    document.addEventListener('pointercancel', reset, true);
    document.addEventListener('visibilitychange', reset);
    window.addEventListener('blur', reset);
    return () => {
      reset();
      interactionHand.x = 0.68;
      interactionHand.y = 0;
      interactionHand.pressed = false;
      interactionHand.turn = 0;
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('pointercancel', reset, true);
      document.removeEventListener('visibilitychange', reset);
      window.removeEventListener('blur', reset);
    };
  }, []);
  return null;
}
