import { useState } from 'react';
import {
  Armchair,
  Camera,
  DoorOpen,
  Footprints,
  LoaderCircle,
  Moon,
  Plus,
  Rotate3D,
  Sun,
  WandSparkles,
  X,
} from 'lucide-react';
import { ElementChat } from '@/components/editor/element-chat';
import { ProjectActions } from '@/components/editor/project-actions';
import { SavedActions } from '@/components/editor/saved-actions';
import { PanelTabs } from '@/components/ui/panel-tabs';
import { useCollaboration } from '@/shared/collaboration/store';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { useCapture } from '@/shared/scene/capture';
import { useProject } from '@/shared/scene/scene-store';

const tabs = [
  { value: 'chat', label: 'Chat' },
  { value: 'tools', label: 'Tools' },
] as const;

export function HousePanel({
  close,
  openNewHome,
  openLibrary,
  furnishing,
  complete,
}: {
  close: () => void;
  openNewHome: () => void;
  openLibrary: () => void;
  furnishing: boolean;
  complete: () => Promise<void>;
}) {
  const [tab, setTab] = useState<'chat' | 'tools'>('chat');
  const {
    compiled,
    projectEpoch,
    mode,
    setMode,
    enterHome,
    lighting,
    setLighting,
    quality,
    setQuality,
  } = useProject();
  const readonly = useCollaboration(
    (state) =>
      state.status !== 'idle' && (state.status !== 'live' || state.state?.self.role === 'viewer'),
  );
  const capturing = useCapture((state) => state.pending || state.capturing);
  return (
    <section className="house-menu" aria-label="House controls menu">
      <div className="panel-heading">
        <span>House</span>
        <button className="icon-button" aria-label="Close house controls" onClick={close}>
          <X size={17} />
        </button>
      </div>
      <PanelTabs label="House sections" tabs={tabs} value={tab} onChange={setTab}>
        <div hidden={tab !== 'chat'}>
          <ElementChat
            key={projectEpoch}
            target={{ kind: 'house', id: compiled.building.id }}
            label="Whole house"
            suggestions={['Cream walls throughout', 'Turn off all lights']}
            active={tab === 'chat'}
          />
        </div>
        {tab === 'tools' && (
          <>
            <div className="house-tool-section" role="group" aria-label="Explore">
              <h2>Explore</h2>
              <div className="house-view-controls">
                {(
                  [
                    ['walk', 'Walk', Footprints],
                    ['orbit', 'Overview', Rotate3D],
                    ['entry', 'Entrance', DoorOpen],
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
            </div>
            <div className="house-tool-section" role="group" aria-label="Furnish">
              <h2>Furnish</h2>
              <div className="house-actions">
                <button
                  disabled={readonly || furnishing}
                  onClick={() => {
                    if (mode === 'entry') setMode('orbit');
                    openLibrary();
                    close();
                  }}
                >
                  <Armchair size={16} /> Furniture
                </button>
                <button disabled={readonly || furnishing} onClick={() => void complete()}>
                  {furnishing ? (
                    <LoaderCircle size={16} className="spinning" />
                  ) : (
                    <WandSparkles size={16} />
                  )}
                  {furnishing ? 'Furnishing…' : 'Auto furnish'}
                </button>
              </div>
            </div>
            <SavedActions key={`actions:${projectEpoch}`} />
            <div className="house-tool-section" role="group" aria-label="Project">
              <h2>Project</h2>
              <div className="house-actions">
                <button
                  disabled={capturing}
                  onClick={() => {
                    useCapture.getState().request();
                    close();
                  }}
                >
                  <Camera size={16} />
                  {capturing ? 'Saving…' : 'Save view'}
                </button>
                <ProjectActions labeled />
                <button
                  className="house-new"
                  onClick={() => {
                    openNewHome();
                    close();
                  }}
                >
                  <Plus size={16} /> New house
                </button>
              </div>
            </div>
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
      </PanelTabs>
    </section>
  );
}
