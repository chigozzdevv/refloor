import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { joystickVector, walkInput } from '@/shared/navigation/input';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { useProject } from '@/shared/scene/scene-store';

const directions = [
  { name: 'forward', x: 0, y: 1, Icon: ChevronUp },
  { name: 'left', x: -1, y: 0, Icon: ChevronLeft },
  { name: 'right', x: 1, y: 0, Icon: ChevronRight },
  { name: 'backward', x: 0, y: -1, Icon: ChevronDown },
] as const;

export function MovementPad() {
  const pad = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; element: HTMLButtonElement; stick: boolean } | null>(null);
  const [vector, setVector] = useState({ x: 0, y: 0 });
  const { selection, interacting, mode } = useProject();
  const mapOpen = useNavigation((state) => state.mapOpen);
  const enabled = mode === 'walk' && !selection && !interacting && !mapOpen;
  const move = useCallback((value: { x: number; y: number }) => {
    walkInput.pad = value;
    setVector(value);
  }, []);
  const release = useCallback(() => {
    const active = pointer.current;
    pointer.current = null;
    if (active?.element.hasPointerCapture(active.id))
      active.element.releasePointerCapture(active.id);
    move({ x: 0, y: 0 });
  }, [move]);
  useEffect(() => {
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
      walkInput.pad = { x: 0, y: 0 };
    };
  }, [release]);
  useEffect(() => {
    if (!enabled) release();
  }, [enabled, release]);
  const begin = (blur = true) => {
    if (blur && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    useNavigation.getState().stop();
  };
  const drag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pointer.current?.stick || pointer.current.id !== event.pointerId) return;
    const bounds = pad.current!.getBoundingClientRect();
    move(
      joystickVector(
        event.clientX - bounds.left - bounds.width / 2,
        event.clientY - bounds.top - bounds.height / 2,
        bounds.width * 0.3,
      ),
    );
  };
  const capture = (event: ReactPointerEvent<HTMLButtonElement>, stick: boolean) => {
    if (event.button !== 0 || pointer.current) return false;
    event.preventDefault();
    event.stopPropagation();
    begin();
    pointer.current = { id: event.pointerId, element: event.currentTarget, stick };
    event.currentTarget.setPointerCapture(event.pointerId);
    return true;
  };
  if (!enabled) return null;
  return (
    <div
      ref={pad}
      className="movement-pad"
      role="group"
      aria-label="Walk controls"
      onContextMenu={(event) => event.preventDefault()}
    >
      {directions.map(({ name, x, y, Icon }) => (
        <button
          key={name}
          className={`pad-direction pad-${name}`}
          aria-label={`Walk ${name}`}
          onPointerDown={(event) => {
            if (capture(event, false)) move({ x, y });
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
          onKeyDown={(event) => {
            if (event.key !== ' ' && event.key !== 'Enter') return;
            event.preventDefault();
            event.stopPropagation();
            begin(false);
            move({ x, y });
          }}
          onKeyUp={release}
          onBlur={release}
        >
          <Icon size={20} strokeWidth={1.7} />
        </button>
      ))}
      <button
        className="pad-stick"
        aria-label="Drag to walk in any direction"
        style={{ transform: `translate(${vector.x * 23}px, ${-vector.y * 23}px)` }}
        onPointerDown={(event) => {
          if (capture(event, true)) drag(event);
        }}
        onPointerMove={drag}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onBlur={release}
        onKeyDown={(event) => {
          const direction = directions.find(
            (value) =>
              `Arrow${value.name === 'forward' ? 'Up' : value.name === 'backward' ? 'Down' : value.name === 'left' ? 'Left' : 'Right'}` ===
              event.key,
          );
          if (!direction) return;
          event.preventDefault();
          event.stopPropagation();
          begin(false);
          move(direction);
        }}
        onKeyUp={(event) => {
          event.stopPropagation();
          release();
        }}
      >
        <span />
      </button>
    </div>
  );
}
