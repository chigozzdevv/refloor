import { useEffect, useRef } from 'react';
import { useProject } from '@/shared/scene/scene-store';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { interactionHand } from '@/shared/editor/interaction-hand';
import '@/components/editor/interaction-hand.css';

export function InteractionHand() {
  const hand = useRef<HTMLDivElement>(null),
    selection = useProject((state) => state.selection),
    mode = useProject((state) => state.mode),
    panelOpen = useNavigation((state) => state.panelOpen),
    mapOpen = useNavigation((state) => state.mapOpen);
  useEffect(() => {
    const element = hand.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0,
      release: ReturnType<typeof setTimeout> | undefined;
    const move = (event: PointerEvent) => {
      if (
        event.pointerType !== 'mouse' ||
        !(event.target instanceof HTMLCanvasElement) ||
        useProject.getState().selection ||
        reduced.matches
      )
        return;
      const x = (event.clientX / window.innerWidth - 0.5) * 120,
        y = (event.clientY / window.innerHeight - 0.5) * 28;
      interactionHand.x = 0.68 + x / window.innerWidth;
      interactionHand.y = y;
      interactionHand.turn = x * 0.09;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        element.style.setProperty('--hand-x', `${x}px`);
        element.style.setProperty('--hand-y', `${y}px`);
        element.style.setProperty('--hand-turn', `${x * 0.09}deg`);
      });
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !(event.target instanceof HTMLCanvasElement)) return;
      clearTimeout(release);
      element.dataset.pressed = 'true';
      interactionHand.pressed = true;
    };
    const up = () => {
      clearTimeout(release);
      release = setTimeout(() => {
        delete element.dataset.pressed;
        interactionHand.pressed = false;
      }, 150);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(release);
      interactionHand.x = 0.68;
      interactionHand.y = 0;
      interactionHand.pressed = false;
      interactionHand.turn = 0;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
    };
  }, []);
  return (
    <div
      ref={hand}
      className="interaction-hand"
      aria-hidden="true"
      data-hidden={mode === 'orbit' || panelOpen || mapOpen}
      data-selected={Boolean(selection)}
    ></div>
  );
}
