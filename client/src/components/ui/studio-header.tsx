import { useEffect, useRef } from 'react';
import { House } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';
import { useCollaboration } from '@/shared/collaboration/store';
import { HousePanel } from '@/components/editor/house-panel';
import type { HouseSection } from '@/components/editor/house-panel';
import { PresenceActivity } from '@/components/collaboration/presence-activity';
import { SaveStatus } from '@/components/ui/save-status';
import { BrandLogo } from '@/components/ui/brand-mark';

export function StudioHeader({
  openNewHome,
  openLibrary,
  open,
  toggle,
  close,
  section,
  setSection,
  openRecovery,
  minimal = false,
}: {
  openNewHome: () => void;
  openLibrary: () => void;
  open: boolean;
  toggle: () => void;
  close: () => void;
  section: HouseSection;
  setSection: (section: HouseSection) => void;
  openRecovery: () => void;
  minimal?: boolean;
}) {
  const { projectEpoch, remote } = useProject();
  const status = useCollaboration((state) => state.status);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, close]);
  return (
    <header className="topbar">
      <a className="wordmark" href="/" aria-label="Refloor home">
        <BrandLogo />
      </a>
      {!minimal && (
        <div className="house-controls" ref={panel}>
          <SaveStatus openRecovery={openRecovery} />
          {!open && <PresenceActivity />}
          <button
            className="house-toggle collaboration-toggle"
            aria-label="House controls"
            title="House chat"
            aria-expanded={open}
            onClick={toggle}
          >
            <House size={22} strokeWidth={1.5} />
            {remote?.shared && <i data-status={status} />}
          </button>
          {open && (
            <HousePanel
              key={projectEpoch}
              section={section}
              setSection={setSection}
              close={close}
              openNewHome={openNewHome}
              openLibrary={openLibrary}
            />
          )}
        </div>
      )}
    </header>
  );
}
