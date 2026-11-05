import {
  Armchair,
  Box,
  Camera,
  DoorOpen,
  Ellipsis,
  Footprints,
  History,
  House,
  Moon,
  Sun,
  Users,
} from 'lucide-react';
import { ElementChat } from '@/components/editor/element-chat';
import { ProjectActions } from '@/components/editor/project-actions';
import { SavedActions } from '@/components/editor/saved-actions';
import { EditHistory } from '@/components/editor/edit-history';
import { CollaborationMenu } from '@/components/collaboration/collaboration-menu';
import { PanelHeading } from '@/components/ui/panel-heading';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { useCapture } from '@/shared/scene/capture';
import { useProject } from '@/shared/scene/scene-store';

export type HouseSection = 'chat' | 'homes' | 'history' | 'more' | 'share';

export function HousePanel({
  close,
  openNewHome,
  openLibrary,
  section,
  setSection,
}: {
  close: () => void;
  openNewHome: () => void;
  openLibrary: () => void;
  section: HouseSection;
  setSection: (section: HouseSection) => void;
}) {
  const { compiled, mode, setMode, enterHome, lighting, setLighting, quality, setQuality } =
    useProject();
  const capturing = useCapture((state) => state.pending || state.capturing);
  const back = () => setSection('chat');
  if (section === 'homes')
    return <ProjectActions close={close} back={back} openNewHome={openNewHome} />;
  if (section === 'history') return <EditHistory close={close} back={back} />;
  if (section === 'share') return <CollaborationMenu close={close} back={back} />;
  return (
    <section className="house-menu" aria-label="House controls menu">
      {section === 'chat' ? (
        <>
          <ElementChat
            target={{ kind: 'house', id: compiled.building.id }}
            label="House"
            suggestions={['Cream walls throughout', 'Turn off all lights']}
            suggestionsInitiallyOpen={false}
            close={close}
            closeLabel="Close house controls"
          />
          <div className="house-view-controls" role="group" aria-label="View">
            {(
              [
                ['walk', 'Walk', Footprints],
                ['orbit', 'Overview', Box],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                aria-pressed={mode === value}
                aria-label={value === 'orbit' ? 'House overview' : label}
                onClick={() => {
                  if (value === 'orbit') useNavigation.getState().resetOverview();
                  if (value === 'walk' && mode === 'entry') enterHome();
                  else setMode(value);
                  close();
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
          <nav className="house-shortcuts" aria-label="House shortcuts">
            <button onClick={() => setSection('homes')}>
              <House size={17} />
              Homes
            </button>
            <button
              onClick={() => {
                if (mode === 'entry') setMode('orbit');
                openLibrary();
              }}
            >
              <Armchair size={17} />
              Furniture
            </button>
            <button aria-label="Edit history" onClick={() => setSection('history')}>
              <History size={17} />
              History
            </button>
            <button onClick={() => setSection('more')}>
              <Ellipsis size={18} />
              More
            </button>
          </nav>
        </>
      ) : (
        <>
          <PanelHeading title="More" close={close} back={back} />
          <div className="house-secondary-actions">
            <button
              onClick={() => {
                setMode('entry');
                close();
              }}
            >
              <DoorOpen size={17} />
              Entrance
            </button>
            <button onClick={() => setSection('share')}>
              <Users size={17} />
              Share house
            </button>
            <button
              disabled={capturing}
              onClick={() => {
                useCapture.getState().request();
                close();
              }}
            >
              <Camera size={17} />
              {capturing ? 'Saving…' : 'Download image'}
            </button>
          </div>
          <SavedActions />
          <div className="house-utilities" role="group" aria-label="Appearance">
            <button
              aria-label={lighting === 'evening' ? 'Switch to daylight' : 'Switch to night'}
              onClick={() => setLighting(lighting === 'evening' ? 'day' : 'evening')}
            >
              {lighting === 'evening' ? <Moon size={15} /> : <Sun size={15} />}
              {lighting === 'evening' ? 'Night' : 'Daylight'}
            </button>
            <button
              aria-label={`Render quality: ${quality}`}
              onClick={() => setQuality(quality === 'high' ? 'balanced' : 'high')}
            >
              {quality === 'high' ? 'High quality' : 'Balanced'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
