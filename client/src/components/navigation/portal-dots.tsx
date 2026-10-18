import { ArrowDown, ArrowUp, DoorOpen } from 'lucide-react';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { useProject } from '@/shared/scene/scene-store';

export function PortalDots() {
  const { edgePortals, request, mapOpen, go } = useNavigation();
  const { mode, selection } = useProject();
  if (mode !== 'walk' || request || mapOpen || selection) return null;
  return (
    <div className="tour-portals" aria-label="Tour exits">
      {edgePortals.map(({ destination, x, y }) => {
        const Icon =
          destination.kind === 'stairs'
            ? destination.direction === 'down'
              ? ArrowDown
              : ArrowUp
            : DoorOpen;
        return (
          <button
            key={destination.id}
            className="navigation-marker marker-portal marker-edge"
            style={{ left: x, top: y }}
            aria-label={destination.label}
            onClick={() => {
              if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
              useProject.getState().select(null);
              go(destination.target, destination.lookAt, destination.label);
            }}
          >
            <span className="marker-symbol">
              <Icon size={17} />
            </span>
            <span className="marker-caption">{destination.caption ?? destination.label}</span>
          </button>
        );
      })}
    </div>
  );
}
