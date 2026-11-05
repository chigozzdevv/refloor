import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { joystickVector, walkInput } from '@/shared/navigation/input';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { useExperience } from '@/shared/scene/experience-store';
import { useProject } from '@/shared/scene/scene-store';

export function MovementPad() {
  const pad = useRef<HTMLButtonElement>(null);
  const pointer = useRef<number | null>(null);
  const keys = useRef(new Set<string>());
  const [vector, setVector] = useState({ x: 0, y: 0 });
  const { selection, interacting, mode } = useProject();
  const mapOpen = useNavigation((state) => state.mapOpen);
  const stage = useExperience((state) => state.stage);
  const enabled = mode === 'walk' && stage === 'ready' && !selection && !interacting && !mapOpen;
  const move = useCallback((value: { x: number; y: number }) => {
    walkInput.pad = value;
    setVector(value);
  }, []);
  const release = useCallback(() => {
    const id = pointer.current;
    pointer.current = null;
    if (id !== null && pad.current?.hasPointerCapture(id)) pad.current.releasePointerCapture(id);
    keys.current.clear();
    walkInput.turn = 0;
    move({ x: 0, y: 0 });
  }, [move]);
  useEffect(() => {
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
      walkInput.pad = { x: 0, y: 0 };
      walkInput.turn = 0;
    };
  }, [release]);
  useEffect(() => {
    if (!enabled) release();
  }, [enabled, release]);
  const drag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointer.current !== event.pointerId || !pad.current) return;
    const bounds = pad.current.getBoundingClientRect();
    move(
      joystickVector(
        event.clientX - bounds.left - bounds.width / 2,
        event.clientY - bounds.top - bounds.height / 2,
        bounds.width * 0.32,
      ),
    );
  };
  const updateKeys = () => {
    const active = keys.current;
    move({
      x: 0,
      y:
        Number(active.has('ArrowUp') || active.has(' ') || active.has('Enter')) -
        Number(active.has('ArrowDown')),
    });
    walkInput.turn = Number(active.has('ArrowRight')) - Number(active.has('ArrowLeft'));
  };
  if (!enabled) return null;
  return (
    <button
      ref={pad}
      className="movement-pad"
      aria-label="Drag to move in any direction"
      aria-description="Drag the scene to look around. Arrow keys move and turn."
      title="Move"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.button !== 0 || pointer.current !== null) return;
        event.preventDefault();
        event.stopPropagation();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        useNavigation.getState().stop();
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag(event);
      }}
      onPointerMove={drag}
      onPointerUp={(event) => {
        if (pointer.current === event.pointerId) release();
      }}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onBlur={release}
      onKeyDown={(event) => {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(event.key))
          return;
        event.preventDefault();
        event.stopPropagation();
        useNavigation.getState().stop();
        keys.current.add(event.key);
        updateKeys();
      }}
      onKeyUp={(event) => {
        if (!keys.current.has(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        keys.current.delete(event.key);
        updateKeys();
      }}
    >
      <ChevronUp className="pad-forward" size={16} aria-hidden="true" />
      <ChevronLeft className="pad-left" size={16} aria-hidden="true" />
      <ChevronRight className="pad-right" size={16} aria-hidden="true" />
      <ChevronDown className="pad-backward" size={16} aria-hidden="true" />
      <span
        className="pad-stick"
        style={{ transform: `translate(${vector.x * 24}px, ${-vector.y * 24}px)` }}
      >
        <span />
      </span>
    </button>
  );
}
