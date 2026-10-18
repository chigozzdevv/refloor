import { ArrowUp } from 'lucide-react';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { useProject } from '@/shared/scene/scene-store';

export function PortalDots() {
  const { edgePortals, request, mapOpen, go } = useNavigation();
  const { mode, selection } = useProject();
  if (mode !== 'walk' || request || mapOpen || selection) return null;
  return (
    <div className="tour-portals" aria-label="Tour exits">
      {edgePortals.map(({ destination, x, y, angle }) => {
        return (
          <button
            key={destination.id}
            className={`navigation-marker marker-edge ${x < 30 ? 'edge-left' : 'edge-right'}`}
            style={{ left: x, top: y }}
            aria-label={destination.label}
            title={destination.label}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
              useProject.getState().select(null);
              go(destination.target, destination.lookAt, destination.label);
            }}
          >
            <ArrowUp size={19} strokeWidth={1.7} style={{ transform: `rotate(${angle}deg)` }} />
            <span className="marker-caption">{destination.caption ?? destination.label}</span>
          </button>
        );
      })}
    </div>
  );
}
