import { Square } from 'lucide-react';
import { useNavigation } from '@/shared/navigation/navigation-store';

export function JourneyControls() {
  const { request, stop } = useNavigation();
  return request ? (
    <button className="journey-stop" onClick={stop} aria-label="Stop moving" title="Stop">
      <Square size={15} fill="currentColor" />
    </button>
  ) : null;
}
