import { useState } from 'react';
import { ErrorBoundary } from '@/app/error-boundary';
import { StudioRoutes } from '@/app/routes';
import { World } from '@/components/scene/world';
import { StudioHeader } from '@/components/ui/studio-header';
import { Notice } from '@/components/ui/notice';
import { HouseOptions } from '@/components/entrance/house-options';
import { useProject } from '@/shared/scene/scene-store';
import { useCommandShortcuts } from '@/shared/editor/use-command';

export function App() {
  const { sceneReady, mode, lighting } = useProject();
  const [newHome, setNewHome] = useState(false),
    [libraryOpen, setLibraryOpen] = useState(false);
  useCommandShortcuts();
  return (
    <ErrorBoundary>
      <main className={`studio ${mode}-mode ${lighting}-lighting`}>
        <div className="viewport">
          <World />
        </div>
        {!sceneReady && (
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
          openNewHome={() => setNewHome(true)}
          openLibrary={() => setLibraryOpen(true)}
        />
        <Notice />
        <StudioRoutes libraryOpen={libraryOpen} closeLibrary={() => setLibraryOpen(false)} />
        <HouseOptions open={newHome} close={() => setNewHome(false)} />
      </main>
    </ErrorBoundary>
  );
}
