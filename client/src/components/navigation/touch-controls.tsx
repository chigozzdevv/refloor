import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { walkInput } from '@/shared/navigation/input';

export function TouchControls() {
  return (
    <div className="walk-pad" aria-label="Movement controls">
      {(
        [
          ['w', 'Walk forward', ArrowUp],
          ['a', 'Walk left', ArrowLeft],
          ['s', 'Walk backward', ArrowDown],
          ['d', 'Walk right', ArrowRight],
        ] as const
      ).map(([key, label, Icon]) => (
        <button
          key={key}
          className={`walk-key key-${key}`}
          aria-label={label}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            walkInput.keys.add(key);
          }}
          onPointerUp={(event) => {
            walkInput.keys.delete(key);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => walkInput.keys.delete(key)}
          onLostPointerCapture={() => walkInput.keys.delete(key)}
        >
          <Icon size={18} />
        </button>
      ))}
    </div>
  );
}
