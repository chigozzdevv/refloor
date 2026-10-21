import { CollaborationMenu } from '@/components/collaboration/collaboration-menu';
import { useEffect, useRef, useState } from 'react';
import { Globe2, History } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { EditHistory } from '@/components/editor/edit-history';
import { HousePanel } from '@/components/editor/house-panel';
import { useFurnishings } from '@/shared/editor/use-furnishings';

export function StudioHeader({
  openNewHome,
  openLibrary,
  minimal = false,
}: {
  openNewHome: () => void;
  openLibrary: () => void;
  minimal?: boolean;
}) {
  const { projectEpoch, select } = useProject();
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const furnishings = useFurnishings();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) {
        setOpen(false);
        setHistoryOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setHistoryOpen(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  return (
    <header className="topbar">
      <a className="wordmark" href="/" aria-label="Refloor home">
        refloor<span className="brand-dot">®</span>
      </a>
      {!minimal && (
        <div className="house-controls" ref={panel}>
          <CollaborationMenu
            showActivity={!open && !historyOpen}
            onOpen={() => {
              setHistoryOpen(false);
              setOpen(false);
              select(null);
              useNavigation.getState().stop();
              useNavigation.getState().setMapOpen(false);
            }}
          />
          <button
            className="house-toggle"
            aria-label="Edit history"
            aria-expanded={historyOpen}
            onClick={() => {
              useNavigation.getState().stop();
              useNavigation.getState().setMapOpen(false);
              select(null);
              setOpen(false);
              setHistoryOpen(!historyOpen);
            }}
          >
            <History size={20} strokeWidth={1.5} />
          </button>
          <button
            className="house-toggle"
            aria-label="House controls"
            aria-expanded={open}
            onClick={() => {
              useNavigation.getState().stop();
              useNavigation.getState().setMapOpen(false);
              setHistoryOpen(false);
              select(null);
              setOpen(!open);
            }}
          >
            <Globe2 size={22} strokeWidth={1.5} />
          </button>
          {historyOpen && <EditHistory close={() => setHistoryOpen(false)} />}
          {open && (
            <HousePanel
              key={projectEpoch}
              close={() => setOpen(false)}
              openNewHome={openNewHome}
              openLibrary={openLibrary}
              {...furnishings}
            />
          )}
        </div>
      )}
    </header>
  );
}
