import { useEffect, useState } from 'react';
import { Square } from 'lucide-react';
import { useNavigation } from '@/shared/navigation/navigation-store';

export function JourneyControls() {
  const { request, stop } = useNavigation();
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
      {request && (
        <button className="journey-stop" onClick={stop} aria-label="Stop moving">
          <Square size={13} fill="currentColor" />
          Stop
        </button>
      )}
    </>
  );
}
