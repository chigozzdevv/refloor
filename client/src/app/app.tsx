import { useState } from 'react';
import { ErrorBoundary } from '@/app/error-boundary';
import { StudioRoutes } from '@/app/routes';
import { World } from '@/components/scene/world';
import { StudioHeader } from '@/components/ui/studio-header';
import { Notice } from '@/components/ui/notice';
import { HouseOptions } from '@/components/entrance/house-options';
import { HouseMap } from '@/components/navigation/house-map';
import { useProject } from '@/shared/scene/scene-store';
import { useCommandShortcuts } from '@/shared/editor/use-command';
import { HousePrompt } from '@/components/entrance/house-prompt';
import { useExperience } from '@/shared/scene/experience-store';
import { useNavigation } from '@/shared/navigation/navigation-store';

export function App() {
  const { sceneReady, mode, lighting, saved } = useProject();
  const { stage, compose, resume, reveal, skip } = useExperience();
  const [newHome, setNewHome] = useState(false),
    [libraryOpen, setLibraryOpen] = useState(false);
  useCommandShortcuts();
  return (
    <ErrorBoundary>
      <main className={`studio ${mode}-mode ${lighting}-lighting ${stage}-stage`}>
        <div className="viewport">
          <World />
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
        <HouseOptions
          open={newHome}
          close={() => setNewHome(false)}
          created={() => {
            setNewHome(false);
            reveal();
          }}
        />
      </main>
    </ErrorBoundary>
  );
}
