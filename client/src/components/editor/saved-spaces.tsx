import { useMemo, useState } from 'react';
import { Cloud, Copy, FolderOpen, RefreshCw, Save } from 'lucide-react';
import { fingerprintBuilding } from '@refloor/scene';
import { fingerprintEditMemory } from '@refloor/scene/edit-memory';
import { useProject } from '@/shared/scene/scene-store';
import { useSavedProjects } from '@/shared/scene/scene-sync';

export function SavedSpaces() {
  const [expanded, setExpanded] = useState(false),
    [confirmId, setConfirmId] = useState<string | null>(null);
  const { compiled, memory, remote } = useProject();
  const {
    items,
    cursor,
    loading,
    saving,
    opening,
    error,
    listError,
    conflict,
    refresh,
    save,
    open,
  } = useSavedProjects();
  const digest = useMemo(() => fingerprintBuilding(compiled.building), [compiled.building]);
  const memoryDigest = useMemo(() => fingerprintEditMemory(memory), [memory]);
  const dirty =
    !remote || remote.savedFingerprint !== digest || remote.savedMemoryFingerprint !== memoryDigest;
  const busy = saving || opening;
  const openSpace = async (id: string) => {
    if (await open(id)) setConfirmId(null);
  };
  return (
    <div className="saved-spaces">
      <button
        className="file-action"
        disabled={busy || (!!remote && !dirty && !conflict)}
        onClick={() => {
          void save();
        }}
      >
        <Save size={16} />
        <span>
          {saving ? 'Saving space…' : remote ? 'Save changes' : 'Save this space'}
          <small>
            {remote
              ? dirty
                ? 'You have unsaved changes'
                : 'All changes saved'
              : 'Keep this space in your saved collection'}
          </small>
        </span>
      </button>
      {remote && (
        <button
          className="file-action"
          disabled={busy}
          onClick={() => {
            void save(true);
          }}
        >
          <Copy size={16} />
          <span>
            Save as a new space<small>Keep the existing saved version</small>
          </span>
        </button>
      )}
      {error && (
        <div className="save-error" role="status">
          <p>{error}</p>
          {conflict && remote && (
            <button
              className="button compact outline"
              disabled={busy}
              onClick={() => setConfirmId(remote.id)}
            >
              Open latest saved version
            </button>
          )}
        </div>
      )}
      <button
        className="file-action"
        aria-expanded={expanded}
        disabled={opening}
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded) void refresh();
        }}
      >
        <Cloud size={16} />
        <span>
          Saved spaces<small>Private to this browser session</small>
        </span>
      </button>
      {expanded && (
        <div className="saved-list" aria-label="Saved spaces">
          <div className="saved-list-heading">
            <span>
              {items.length} {items.length === 1 ? 'space' : 'spaces'}
            </span>
            <button
              className="icon-button"
              aria-label="Refresh saved spaces"
              disabled={loading || busy}
              onClick={() => {
                void refresh();
              }}
            >
              <RefreshCw size={13} />
            </button>
          </div>
          {loading && items.length === 0 && <p role="status">Loading your spaces…</p>}
          {!loading && items.length === 0 && !listError && (
            <p>Your saved spaces will appear here.</p>
          )}
          {listError && <p role="status">{listError}</p>}
          {items.map((item) => (
            <button
              key={item.id}
              className={`saved-space ${item.id === remote?.id ? 'current' : ''}`}
              disabled={busy}
              onClick={() => {
                if (dirty) setConfirmId(item.id);
                else void openSpace(item.id);
              }}
            >
              <FolderOpen size={14} />
              <span>
                {item.name}
                <small>
                  {item.storeys} {item.storeys === 1 ? 'storey' : 'storeys'} ·{' '}
                  {new Date(item.updatedAt).toLocaleDateString()}
                </small>
              </span>
            </button>
          ))}
          {cursor && (
            <button
              className="button compact outline"
              disabled={loading || busy}
              onClick={() => {
                void refresh(true);
              }}
            >
              {loading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
      {confirmId && (
        <div className="save-error" role="group" aria-label="Open saved space confirmation">
          <p>
            Opening a saved space replaces your current browser draft. Save or export your changes
            first if you want to keep them.
          </p>
          <div className="saved-confirm-actions">
            <button
              className="button compact outline"
              disabled={busy}
              onClick={() => setConfirmId(null)}
            >
              Keep editing
            </button>
            <button
              className="button compact primary"
              disabled={busy}
              onClick={() => {
                void openSpace(confirmId);
              }}
            >
              {opening ? 'Opening…' : 'Open saved space'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
