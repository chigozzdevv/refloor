import { CollaborationRuntime } from '@/components/collaboration/collaboration-runtime';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { ErrorBoundary } from '@/app/error-boundary';
import { StudioRoutes } from '@/app/routes';
import { StudioHeader } from '@/components/ui/studio-header';
import { BrandMark } from '@/components/ui/brand-mark';
import type { HouseSection } from '@/components/editor/house-panel';
import { OverviewControls } from '@/components/navigation/overview-controls';
import { RoomActions } from '@/components/editor/room-actions';
import { DesignStatus } from '@/components/editor/design-status';
import { InteractionHand } from '@/components/editor/interaction-hand';
import { Notice } from '@/components/ui/notice';
import { HouseMap } from '@/components/navigation/house-map';
import { useProject } from '@/shared/scene/scene-store';
import { useCommandShortcuts } from '@/shared/editor/use-command';
import { HousePrompt } from '@/components/entrance/house-prompt';
import { useExperience } from '@/shared/scene/experience-store';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { persistGeneration } from '@/shared/refloor/progress';

const World = lazy(() =>
  import('@/components/scene/world').then((module) => ({ default: module.World })),
);
const HouseOptions = lazy(() =>
  import('@/components/entrance/house-options').then((module) => ({
    default: module.HouseOptions,
  })),
);

export function App() {
  const { sceneReady, mode, lighting, saved, selection } = useProject();
  const { stage, compose, resume, reveal, skip } = useExperience();
  const [newHome, setNewHome] = useState(false),
    [panel, setPanel] = useState<'house' | 'furniture' | null>(null),
    [houseSection, setHouseSection] = useState<HouseSection>('chat'),
    [addingFurniture, setAddingFurniture] = useState(false);
  const closePanel = useCallback(() => setPanel(null), []);
  const openPanel = (next: typeof panel, adding = false, section: HouseSection = 'chat') => {
    useNavigation.getState().stop();
    useNavigation.getState().setMapOpen(false);
    useProject.getState().select(null);
    setAddingFurniture(adding);
    setHouseSection(section);
    setPanel(next);
  };
  const [worldStarted, setWorldStarted] = useState(stage !== 'prompt');
  useEffect(() => {
    useNavigation.setState({ panelOpen: panel !== null });
    return () => useNavigation.setState({ panelOpen: false });
  }, [panel]);
  useEffect(() => {
    if (stage !== 'prompt') setWorldStarted(true);
  }, [stage]);
  useCommandShortcuts();
  return (
    <ErrorBoundary>
      <main className={`studio ${mode}-mode ${lighting}-lighting ${stage}-stage`}>
        <div className="viewport">
          {worldStarted || stage !== 'prompt' ? (
            <Suspense fallback={null}>
              <World />
            </Suspense>
          ) : (
            <img className="prompt-poster" src="/images/house-poster.jpg" alt="" />
          )}
        </div>
        {!sceneReady && stage !== 'prompt' && (
          <div className="loading-overlay">
            <div className="scene-loading">
              <BrandMark className="loader-mark" />
              <span>Bringing your space to life</span>
              <div className="load-track">
                <i />
              </div>
            </div>
          </div>
        )}
        <StudioHeader
          minimal={stage !== 'ready'}
          open={panel === 'house'}
          section={houseSection}
          setSection={setHouseSection}
          openRecovery={() => openPanel('house', false, 'homes')}
          toggle={() => openPanel(panel === 'house' ? null : 'house')}
          close={closePanel}
          openNewHome={() => {
            useNavigation.getState().stop();
            useNavigation.getState().setMapOpen(false);
            useProject.getState().select(null);
            closePanel();
            compose();
          }}
          openLibrary={() => openPanel('furniture')}
        />
        <Notice />
        <CollaborationRuntime />
        {stage === 'prompt' && (
          <HousePrompt
            canResume={saved || worldStarted}
            choosingTemplate={newHome}
            close={reveal}
            resume={resume}
            templates={() => setNewHome(true)}
          />
        )}
        {stage === 'reveal' && sceneReady && (
          <button className="reveal-continue" onClick={() => useExperience.getState().approach()}>
            Approach the entrance
          </button>
        )}
        {stage === 'approach' && (
          <button className="reveal-skip" onClick={skip}>
            Skip approach
          </button>
        )}
        {stage === 'ready' && (
          <>
            <InteractionHand />
            {!panel && !selection && (
              <div className="studio-context">
                {mode === 'walk' && <RoomActions add={() => openPanel('furniture', true)} />}
                {mode === 'orbit' && <OverviewControls />}
                <DesignStatus />
              </div>
            )}
            <HouseMap obscured={panel !== null} />
            <StudioRoutes
              panelOpen={panel !== null}
              libraryOpen={panel === 'furniture'}
              addingFurniture={addingFurniture}
              closeLibrary={closePanel}
            />
          </>
        )}
        {newHome && (
          <Suspense fallback={null}>
            <HouseOptions
              open={newHome}
              close={() => setNewHome(false)}
              created={() => {
                persistGeneration(null);
                setNewHome(false);
                reveal();
              }}
            />
          </Suspense>
        )}
      </main>
    </ErrorBoundary>
  );
}
