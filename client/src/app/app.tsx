import { CollaborationRuntime } from '@/components/collaboration/collaboration-runtime';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ErrorBoundary } from '@/app/error-boundary';
import { StudioRoutes } from '@/app/routes';
import { StudioHeader } from '@/components/ui/studio-header';
import { Notice } from '@/components/ui/notice';
import { HouseMap } from '@/components/navigation/house-map';
import { useProject } from '@/shared/scene/scene-store';
import { useCommandShortcuts } from '@/shared/editor/use-command';
import { HousePrompt } from '@/components/entrance/house-prompt';
import { useExperience } from '@/shared/scene/experience-store';
import { useNavigation } from '@/shared/navigation/navigation-store';

const World = lazy(() =>
  import('@/components/scene/world').then((module) => ({ default: module.World })),
);
const HouseOptions = lazy(() =>
  import('@/components/entrance/house-options').then((module) => ({
    default: module.HouseOptions,
  })),
);

export function App() {
  const { sceneReady, mode, lighting, saved } = useProject();
  const { stage, compose, resume, reveal, skip } = useExperience();
  const [newHome, setNewHome] = useState(false),
    [libraryOpen, setLibraryOpen] = useState(false);
  const [worldStarted, setWorldStarted] = useState(stage !== 'prompt');
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
              <span className="loader-mark">r.</span>
              <span>Bringing your space to life</span>
              <div className="load-track">
                <i />
              </div>
            </div>
          </div>
        )}
        <StudioHeader
          minimal={stage !== 'ready'}
          openNewHome={() => {
            useNavigation.getState().stop();
            useNavigation.getState().setMapOpen(false);
            useProject.getState().select(null);
            compose();
          }}
          openLibrary={() => setLibraryOpen(true)}
        />
        <Notice />
        <CollaborationRuntime />
        {stage === 'prompt' && (
          <HousePrompt
            canResume={saved}
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
            <HouseMap />
            <StudioRoutes libraryOpen={libraryOpen} closeLibrary={() => setLibraryOpen(false)} />
          </>
        )}
        {newHome && (
          <Suspense fallback={null}>
            <HouseOptions
              open={newHome}
              close={() => setNewHome(false)}
              created={() => {
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
