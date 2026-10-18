import { Plus } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';
import { ProjectActions } from '@/components/editor/project-actions';

export function StudioHeader({ openNewHome }: { openNewHome: () => void }) {
  const { compiled, remote } = useProject();
  return (
    <header className="topbar">
      <a className="wordmark" href="/" aria-label="Refloor home">
        refloor<span className="brand-dot">®</span>
      </a>
      <span className="header-divider" />
      <span className="project-name">
        {compiled.building.name}
        <span className="local-badge">{remote ? 'SAVED SPACE' : 'BROWSER DRAFT'}</span>
      </span>
      <div className="topbar-actions">
        <ProjectActions />
        <button
          className="button subtle new-space"
          aria-label="New space"
          onClick={() => openNewHome()}
        >
          <Plus size={15} />
          <span>New space</span>
        </button>
      </div>
    </header>
  );
}
