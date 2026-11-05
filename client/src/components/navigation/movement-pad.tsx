import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import { joystickVector, walkInput } from '@/shared/navigation/input';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { useExperience } from '@/shared/scene/experience-store';
import { useProject } from '@/shared/scene/scene-store';

const directions = [
  { name: 'forward', key: 'ArrowUp', label: 'Walk forward', x: 0, y: 1, Icon: ChevronUp },
  { name: 'left', key: 'ArrowLeft', label: 'Walk left', x: -1, y: 0, Icon: ChevronLeft },
  { name: 'right', key: 'ArrowRight', label: 'Walk right', x: 1, y: 0, Icon: ChevronRight },
  { name: 'backward', key: 'ArrowDown', label: 'Walk backward', x: 0, y: -1, Icon: ChevronDown },
] as const;
const turns = [
  { name: 'left', label: 'Turn left', value: -1, Icon: RotateCcw },
  { name: 'right', label: 'Turn right', value: 1, Icon: RotateCw },
] as const;
type Channel = 'move' | 'turn';
type ActivePointer = { id: number; element: HTMLButtonElement; stick: boolean };

export function MovementPad() {
  const pad = useRef<HTMLDivElement>(null);
  const pointers = useRef<Record<Channel, ActivePointer | null>>({ move: null, turn: null });
  const stickKeys = useRef(new Set<string>());
  const [vector, setVector] = useState({ x: 0, y: 0 });
  const [turning, setTurning] = useState(0);
  const { selection, interacting, mode } = useProject();
  const mapOpen = useNavigation((state) => state.mapOpen);
  const stage = useExperience((state) => state.stage);
  const enabled = mode === 'walk' && stage === 'ready' && !selection && !interacting && !mapOpen;
  const move = useCallback((value: { x: number; y: number }) => {
    walkInput.pad = value;
    setVector(value);
  }, []);
  const turn = useCallback((value: number) => {
    walkInput.turn = value;
    setTurning(value);
  }, []);
  const release = useCallback(
    (channel?: Channel, pointerId?: number) => {
      for (const key of channel ? [channel] : (['move', 'turn'] as const)) {
        const active = pointers.current[key];
        if (pointerId !== undefined && active?.id !== pointerId) continue;
        pointers.current[key] = null;
        if (active?.element.hasPointerCapture(active.id))
          active.element.releasePointerCapture(active.id);
        if (key === 'move') {
          stickKeys.current.clear();
          move({ x: 0, y: 0 });
        } else turn(0);
      }
    },
    [move, turn],
  );
  useEffect(() => {
    const reset = () => release();
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', reset);
    return () => {
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', reset);
      walkInput.pad = { x: 0, y: 0 };
      walkInput.turn = 0;
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
    const active = pointers.current.move;
    if (!active?.stick || active.id !== event.pointerId || !pad.current) return;
    const bounds = pad.current.getBoundingClientRect();
    move(
      joystickVector(
        event.clientX - bounds.left - bounds.width / 2,
        event.clientY - bounds.top - bounds.height / 2,
        bounds.width * 0.3,
      ),
    );
  };
  const capture = (
    event: ReactPointerEvent<HTMLButtonElement>,
    channel: Channel,
    stick = false,
  ) => {
    if (event.button !== 0 || pointers.current[channel]) return false;
    event.preventDefault();
    event.stopPropagation();
    begin();
    pointers.current[channel] = { id: event.pointerId, element: event.currentTarget, stick };
    event.currentTarget.setPointerCapture(event.pointerId);
    return true;
  };
  const updateStickKeys = () => {
    const keys = stickKeys.current;
    const x = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
    const y = Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown'));
    const length = Math.max(1, Math.hypot(x, y));
    move({ x: x / length, y: y / length });
  };
  if (!enabled) return null;
  return (
    <div
      ref={pad}
      className="movement-pad"
      role="group"
      aria-label="Move and look around"
      onContextMenu={(event) => event.preventDefault()}
    >
      {directions.map(({ name, label, x, y, Icon }) => (
        <button
          key={name}
          className={`pad-direction pad-${name}`}
          aria-label={label}
          title={label}
          onPointerDown={(event) => {
            if (capture(event, 'move')) move({ x, y });
          }}
          onPointerUp={(event) => release('move', event.pointerId)}
          onPointerCancel={(event) => release('move', event.pointerId)}
          onLostPointerCapture={(event) => release('move', event.pointerId)}
          onKeyDown={(event) => {
            if (event.key !== ' ' && event.key !== 'Enter') return;
            event.preventDefault();
            event.stopPropagation();
            begin(false);
            move({ x, y });
          }}
          onKeyUp={(event) => {
            if (event.key !== ' ' && event.key !== 'Enter') return;
            event.preventDefault();
            event.stopPropagation();
            release('move');
          }}
          onBlur={() => release('move')}
        >
          <Icon size={20} strokeWidth={1.7} />
        </button>
      ))}
      <button
        className="pad-stick"
        aria-label="Drag to move in any direction"
        title="Drag to move in any direction"
        style={{ transform: `translate(${vector.x * 23}px, ${-vector.y * 23}px)` }}
        onPointerDown={(event) => {
          if (capture(event, 'move', true)) drag(event);
        }}
        onPointerMove={drag}
        onPointerUp={(event) => release('move', event.pointerId)}
        onPointerCancel={(event) => release('move', event.pointerId)}
        onLostPointerCapture={(event) => release('move', event.pointerId)}
        onBlur={() => release('move')}
        onKeyDown={(event) => {
          if (!directions.some((value) => value.key === event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          begin(false);
          stickKeys.current.add(event.key);
          updateStickKeys();
        }}
        onKeyUp={(event) => {
          if (!directions.some((value) => value.key === event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          stickKeys.current.delete(event.key);
          updateStickKeys();
        }}
      >
        <span />
      </button>
      <div className="pad-turns">
        {turns.map(({ name, label, value, Icon }) => (
          <button
            key={name}
            className={`pad-turn pad-turn-${name}`}
            aria-label={label}
            title={label}
            data-active={turning === value || undefined}
            onPointerDown={(event) => {
              if (capture(event, 'turn')) turn(value);
            }}
            onPointerUp={(event) => release('turn', event.pointerId)}
            onPointerCancel={(event) => release('turn', event.pointerId)}
            onLostPointerCapture={(event) => release('turn', event.pointerId)}
            onKeyDown={(event) => {
              if (event.key !== ' ' && event.key !== 'Enter') return;
              event.preventDefault();
              event.stopPropagation();
              begin(false);
              turn(value);
            }}
            onKeyUp={(event) => {
              if (event.key !== ' ' && event.key !== 'Enter') return;
              event.preventDefault();
              event.stopPropagation();
              release('turn');
            }}
            onBlur={() => release('turn')}
          >
            <Icon size={20} strokeWidth={1.7} />
          </button>
        ))}
      </div>
    </div>
  );
}
