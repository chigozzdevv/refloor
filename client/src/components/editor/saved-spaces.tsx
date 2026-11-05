import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  Ellipsis,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { fingerprintBuilding } from '@refloor/scene';
import type { ProjectSummary } from '@refloor/scene/contracts';
import { fingerprintEditMemory } from '@refloor/scene/edit-memory';
import { useProject } from '@/shared/scene/scene-store';
import { useSavedProjects } from '@/shared/scene/scene-sync';
import { projectApi } from '@/shared/refloor/houses';
import { ProjectApiError } from '@/shared/refloor/client';
import type { RemoteLink } from '@/shared/scene/remote';
import { latestCollectionMetadata } from '@/shared/scene/remote';
import { SavedHousePreview } from '@/components/editor/saved-house-preview';
import '@/components/editor/saved-spaces.css';

export function SavedSpaces({
  opened,
  organizing,
  files,
}: {
  opened: () => void;
  organizing?: (busy: boolean) => void;
  files?: ReactNode;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [managing, setManaging] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<ProjectSummary[]>([]);
  const [deletedCursor, setDeletedCursor] = useState<string | null>(null);
  const [loadingDeleted, setLoadingDeleted] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<ProjectSummary | null>(null);
  const working = useRef(false);
  const detached = useRef<{ id: string; epoch: number; remote: RemoteLink } | null>(null);
  const rows = useRef<HTMLDivElement>(null);
  const { compiled, memory, remote } = useProject();
  const {
    items,
    cursor,
    loading,
    collectionEpoch,
    saving,
    opening,
    recovering,
    error,
    listError,
    conflict,
    refresh,
    save,
    open,
    preserve,
  } = useSavedProjects();
  const digest = useMemo(() => fingerprintBuilding(compiled.building), [compiled.building]);
  const memoryDigest = useMemo(() => fingerprintEditMemory(memory), [memory]);
  const dirty =
    !remote?.shared &&
    (!remote ||
      remote.deleted ||
      remote.savedFingerprint !== digest ||
      remote.savedMemoryFingerprint !== memoryDigest);
  const busy = saving || opening || recovering || managing || loading || loadingDeleted;
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    setDeleted([]);
    setDeletedCursor(null);
    setLastDeleted(null);
    setMenu(null);
    setRenaming(null);
    detached.current = null;
  }, [collectionEpoch]);
  useEffect(() => {
    organizing?.(managing);
    return () => organizing?.(false);
  }, [managing, organizing]);
  useEffect(() => {
    if (!menu) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('[data-saved-menu]'))
        setMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setMenu(null);
        rows.current?.querySelector<HTMLButtonElement>(`[data-house-options="${menu}"]`)?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    rows.current?.addEventListener('keydown', escape);
    const current = rows.current;
    return () => {
      document.removeEventListener('pointerdown', outside);
      current?.removeEventListener('keydown', escape);
    };
  }, [menu]);
  const openSpace = async (id: string, discard = false) => {
    if (!discard && !(await preserve())) return;
    if (await open(id)) opened();
  };
  const loadDeleted = async (more = false) => {
    if (loadingDeleted) return;
    setLoadingDeleted(true);
    setManageError(null);
    const collection = useSavedProjects.getState().collectionEpoch;
    try {
      const page = await projectApi.list(more ? (deletedCursor ?? undefined) : undefined, true);
      if (useSavedProjects.getState().collectionEpoch !== collection) return;
      setDeleted((previous) =>
        more
          ? [...new Map([...previous, ...page.items].map((item) => [item.id, item])).values()]
          : page.items,
      );
      setDeletedCursor(page.nextCursor);
    } catch (failure) {
      if (useSavedProjects.getState().collectionEpoch !== collection) return;
      setManageError(failure instanceof Error ? failure.message : 'Deleted houses could not load.');
    } finally {
      setLoadingDeleted(false);
    }
  };
  const update = async (item: ProjectSummary, change: { name?: string; deleted?: boolean }) => {
    if (
      working.current ||
      loadingDeleted ||
      useSavedProjects.getState().loading ||
      useSavedProjects.getState().saving ||
      useSavedProjects.getState().opening ||
      useSavedProjects.getState().recovering
    )
      return;
    working.current = true;
    setManaging(true);
    setManageError(null);
    setMenu(null);
    const collection = useSavedProjects.getState().collectionEpoch;
    let removedCurrent = false;
    try {
      if (change.deleted && useProject.getState().remote?.id === item.id) {
        if (!(await preserve())) return;
        const current = useProject.getState();
        if (current.remote?.id === item.id) {
          detached.current = { id: item.id, epoch: current.projectEpoch, remote: current.remote };
          useProject.setState({ remote: { ...current.remote, deleted: true } });
          removedCurrent = true;
        }
      }
      const result = await projectApi.updateCollection(item.id, {
        expectedCollectionVersion: item.collectionVersion ?? 0,
        ...change,
      });
      if (useSavedProjects.getState().collectionEpoch !== collection) return;
      if (result.deleted) {
        const current = useProject.getState();
        if (current.remote?.id === result.id)
          useProject.setState({
            remote: { ...current.remote, ...latestCollectionMetadata(result, current.remote) },
          });
        useSavedProjects.setState((state) => ({
          items: state.items.filter((value) => value.id !== item.id),
        }));
        setDeleted((previous) => [result, ...previous.filter((value) => value.id !== item.id)]);
        setLastDeleted(result);
      } else {
        useSavedProjects.setState((state) => ({
          items: [result, ...state.items.filter((value) => value.id !== item.id)],
        }));
        setDeleted((previous) => previous.filter((value) => value.id !== item.id));
        const current = useProject.getState();
        if (current.remote?.id === result.id)
          useProject.setState({
            remote: { ...current.remote, ...latestCollectionMetadata(result, current.remote) },
          });
        if (change.deleted === false) {
          setLastDeleted(null);
          const current = useProject.getState(),
            previous = detached.current;
          if (
            previous?.id === item.id &&
            previous.epoch === current.projectEpoch &&
            (!current.remote || current.remote.deleted) &&
            current.compiled.building.id === previous.remote.buildingId
          )
            useProject.setState({
              remote: { ...previous.remote, ...latestCollectionMetadata(result, previous.remote) },
            });
          else if (current.remote?.id === item.id && current.remote.deleted)
            useProject.setState({
              remote: { ...current.remote, ...latestCollectionMetadata(result, current.remote) },
            });
          else if (!current.remote) {
            const restored = await projectApi.get(item.id).catch(() => null);
            const now = useProject.getState();
            if (
              restored &&
              !now.remote &&
              collection === useSavedProjects.getState().collectionEpoch &&
              fingerprintBuilding(now.compiled.building) ===
                fingerprintBuilding(restored.building) &&
              restored.memory &&
              fingerprintEditMemory(now.memory) === fingerprintEditMemory(restored.memory)
            )
              useProject.setState({
                remote: {
                  id: restored.id,
                  ...latestCollectionMetadata(restored),
                  buildingId: restored.building.id,
                  version: restored.version,
                  savedFingerprint: fingerprintBuilding(restored.building),
                  savedMemoryFingerprint: fingerprintEditMemory(restored.memory),
                  updatedAt: restored.updatedAt,
                },
              });
          }
          detached.current = null;
        }
      }
      setRenaming(null);
    } catch (failure) {
      if (useSavedProjects.getState().collectionEpoch !== collection) return;
      if (removedCurrent && failure instanceof ProjectApiError && !failure.retryable) {
        const current = useProject.getState(),
          previous = detached.current;
        if (previous?.epoch === current.projectEpoch && (!current.remote || current.remote.deleted))
          useProject.setState({ remote: previous.remote });
        detached.current = null;
      }
      setManageError(
        failure instanceof Error ? failure.message : 'This house could not be updated.',
      );
    } finally {
      working.current = false;
      setManaging(false);
    }
  };
  return (
    <div className="saved-spaces">
      {(dirty || saving) && (
        <button className="file-action" disabled={busy} onClick={() => void save()}>
          <Save size={16} />
          {saving ? 'Saving…' : remote && !remote.deleted ? 'Save changes' : 'Save house'}
        </button>
      )}
      {error && (
        <div className="save-error" role="alert">
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
      {manageError && (
        <p className="save-error" role="alert">
          {manageError}
        </p>
      )}
      {lastDeleted && (
        <div className="saved-deletion" role="status">
          <span>House deleted</span>
          <button disabled={busy} onClick={() => void update(lastDeleted, { deleted: false })}>
            Undo
          </button>
        </div>
      )}
      <div className="saved-list" aria-label="Saved houses" ref={rows}>
        <div className="saved-list-heading">
          <span>Saved</span>
          <button
            className="icon-button"
            aria-label="Refresh saved houses"
            disabled={loading || busy}
            onClick={() => void refresh()}
          >
            <RefreshCw size={13} />
          </button>
        </div>
        {loading && items.length === 0 && <p role="status">Loading…</p>}
        {!loading && items.length === 0 && !listError && <p>No saved houses yet.</p>}
        {listError && <p role="status">{listError}</p>}
        {items.map((item) => (
          <div key={item.id} className="saved-space-row">
            {renaming === item.id ? (
              <form
                className="saved-house-rename"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (name.trim()) void update(item, { name: name.trim() });
                }}
              >
                <input
                  autoFocus
                  aria-label="House name"
                  value={name}
                  maxLength={160}
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                  onFocus={(event) => event.target.select()}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.stopPropagation();
                      setRenaming(null);
                    }
                  }}
                />
                <button
                  className="icon-button"
                  aria-label="Save house name"
                  disabled={busy || !name.trim()}
                >
                  <Check size={16} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Cancel rename"
                  disabled={busy}
                  onClick={() => setRenaming(null)}
                >
                  <X size={16} />
                </button>
              </form>
            ) : (
              <>
                <button
                  className={`saved-space ${item.id === remote?.id ? 'current' : ''}`}
                  disabled={busy || item.id === remote?.id}
                  onClick={() => void openSpace(item.id)}
                >
                  <SavedHousePreview preview={item.preview} />
                  <span>
                    {item.name}
                    <small>
                      {item.id === remote?.id
                        ? 'Current house'
                        : `${item.storeys} ${item.storeys === 1 ? 'storey' : 'storeys'} · ${new Date(item.updatedAt).toLocaleDateString()}`}
                    </small>
                  </span>
                </button>
                {!item.shared && (
                  <div className="saved-house-options" data-saved-menu>
                    <button
                      className="icon-button saved-options-toggle"
                      data-house-options={item.id}
                      aria-label={`Options for ${item.name}`}
                      aria-expanded={menu === item.id}
                      disabled={busy}
                      onClick={() => setMenu(menu === item.id ? null : item.id)}
                    >
                      <Ellipsis size={16} />
                    </button>
                    {menu === item.id && (
                      <div className="saved-house-menu">
                        <button
                          onClick={() => {
                            setRenaming(item.id);
                            setName(item.name);
                            setMenu(null);
                          }}
                        >
                          <Pencil size={14} />
                          Rename
                        </button>
                        <button onClick={() => void update(item, { deleted: true })}>
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {cursor && (
          <button
            className="button compact outline"
            disabled={loading || busy}
            onClick={() => void refresh(true)}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
      <details className="home-files">
        <summary>
          Files & recovery
          <ChevronDown size={14} />
        </summary>
        {files}
        <details
          className="deleted-houses"
          onToggle={(event) => {
            if (event.currentTarget.open) void loadDeleted();
          }}
        >
          <summary>Deleted houses</summary>
          {loadingDeleted && !deleted.length && <p role="status">Loading…</p>}
          {!loadingDeleted && !deleted.length && <p>No deleted houses.</p>}
          {deleted.map((item) => (
            <div className="deleted-house" key={item.id}>
              <SavedHousePreview preview={item.preview} />
              <span>{item.name}</span>
              <button
                className="icon-button"
                aria-label={`Restore ${item.name}`}
                title="Restore"
                disabled={busy}
                onClick={() => void update(item, { deleted: false })}
              >
                <RotateCcw size={15} />
              </button>
            </div>
          ))}
          {deletedCursor && (
            <button
              className="file-action"
              disabled={loadingDeleted || busy}
              onClick={() => void loadDeleted(true)}
            >
              Load more
            </button>
          )}
        </details>
      </details>
      {confirmId && (
        <div className="save-error" role="group" aria-label="Open saved house confirmation">
          <p>Opening this version discards your unsaved changes.</p>
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
              onClick={() => void openSpace(confirmId, true)}
            >
              {opening ? 'Opening…' : 'Open saved house'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
