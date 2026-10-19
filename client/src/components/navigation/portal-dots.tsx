import { ArrowDown, ArrowUp, DoorOpen } from 'lucide-react';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { useProject } from '@/shared/scene/scene-store';
import { useExperience } from '@/shared/scene/experience-store';

export function PortalDots() {
  const { portals, request, mapOpen, go } = useNavigation();
  const { mode, selection, interacting } = useProject();
  const stage = useExperience((state) => state.stage);
  if (
    stage !== 'ready' ||
    mode !== 'walk' ||
    request ||
    mapOpen ||
    selection ||
    interacting ||
    !portals.length
  )
    return null;
  return (
    <nav className="tour-portals" aria-label="Room navigation">
      {portals.map(({ destination, label }) => {
        const Icon =
          destination.kind === 'stairs'
            ? destination.direction === 'down'
              ? ArrowDown
              : ArrowUp
            : DoorOpen;
        return (
          <button
            key={destination.id}
            className="portal-action"
            data-navigation-cue={destination.id}
            data-direction={destination.direction}
            aria-label={destination.kind === 'door' ? label : destination.label}
            title={label}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
              useProject.getState().select(null);
              go(destination.target, destination.lookAt, destination.label, destination.doorId);
            }}
          >
            <Icon size={18} strokeWidth={1.7} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
