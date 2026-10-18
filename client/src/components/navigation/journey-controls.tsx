import { useEffect, useState } from 'react';
import { ArrowLeft, LocateFixed, Square } from 'lucide-react';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { useProject } from '@/shared/scene/scene-store';

export function JourneyControls() {
  const { request, stop, location, nextStop, look, exit, go } = useNavigation();
  const [hint, setHint] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setHint(false), 8000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (request) setHint(false);
  }, [request]);
  return (
    <>
      {hint && !request && <p className="tour-hint">Dots move you · Drag to look</p>}
      <div className="tour-place" aria-label="Tour location">
        {!request && exit && (
          <button
            className="tour-exit"
            aria-label="Leave room"
            onClick={() => {
              if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
              useProject.getState().select(null);
              go(exit.target, exit.lookAt, 'Leaving room');
            }}
          >
            <ArrowLeft size={14} />
            Leave room
          </button>
        )}
        <span role="status">{request?.label ?? location}</span>
        {request ? (
          <button onClick={stop} aria-label="Stop moving">
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            disabled={!nextStop}
            aria-label="Find next stop"
            title="Find next stop"
            onClick={() => {
              useProject.getState().select(null);
              look();
            }}
          >
            <LocateFixed size={16} />
          </button>
        )}
      </div>
    </>
  );
}
