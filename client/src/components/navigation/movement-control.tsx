import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { walkInput } from '@/shared/navigation/input';
import { useProject } from '@/shared/scene/scene-store';

export function MovementControl() {
  const [thumb, setThumb] = useState({ x: 0, y: 0 });
  const pad = useRef<HTMLDivElement>(null),
    pointer = useRef<number | null>(null);
  const begin = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    useProject.getState().select(null);
  };
  const reset = () => {
    walkInput.axis = { forward: 0, right: 0 };
    pointer.current = null;
    setThumb({ x: 0, y: 0 });
  };
  useEffect(() => {
    const stop = () => {
      walkInput.keys.clear();
      reset();
    };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    return () => {
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', stop);
      walkInput.axis = { forward: 0, right: 0 };
      walkInput.keys.clear();
    };
  }, []);
  const update = (x: number, y: number) => {
    const rect = pad.current!.getBoundingClientRect(),
      dx = x - rect.left - rect.width / 2,
      dy = y - rect.top - rect.height / 2;
    const length = Math.hypot(dx, dy),
      scale = length > 34 ? 34 / length : 1;
    setThumb({ x: dx * scale * 0.7, y: dy * scale * 0.7 });
    walkInput.axis = { right: (dx * scale) / 34, forward: (-dy * scale) / 34 };
  };
  return (
    <div className="movement-control" aria-label="Movement controls" ref={pad}>
      {(
        [
          ['w', 'Move forward', ChevronUp, 'w'],
          ['turn-left', 'Turn left', ChevronLeft, 'a'],
          ['s', 'Move backward', ChevronDown, 's'],
          ['turn-right', 'Turn right', ChevronRight, 'd'],
        ] as const
      ).map(([key, label, Icon, position]) => (
        <button
          key={key}
          className={`movement-arrow movement-${position}`}
          aria-label={label}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            begin();
            walkInput.keys.add(key);
          }}
          onPointerUp={(event) => {
            walkInput.keys.delete(key);
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => walkInput.keys.delete(key)}
          onLostPointerCapture={() => walkInput.keys.delete(key)}
          onKeyDown={(event) => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault();
              walkInput.keys.add(key);
            }
          }}
          onKeyUp={() => walkInput.keys.delete(key)}
          onBlur={() => walkInput.keys.delete(key)}
        >
          <Icon size={23} strokeWidth={2.2} />
        </button>
      ))}
      <div
        className="movement-thumb"
        role="slider"
        tabIndex={0}
        aria-label="Drag to move"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((Math.hypot(thumb.x, thumb.y) / 23.8) * 100)}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          pointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          begin();
          update(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (pointer.current === event.pointerId) update(event.clientX, event.clientY);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          reset();
        }}
        onPointerCancel={reset}
        onLostPointerCapture={reset}
      >
        <span style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)` }} />
      </div>
    </div>
  );
}
