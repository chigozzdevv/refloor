import { InvitationLinks } from '@/components/collaboration/invitation-links';
import { collaborationBridge } from '@/shared/collaboration/bridge';
import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Users, X } from 'lucide-react';
import { useCollaboration } from '@/shared/collaboration/store';
import { collaborationApi } from '@/shared/collaboration/api';
import { remoteShared } from '@/shared/collaboration/runtime';
import { useProject } from '@/shared/scene/scene-store';
import { useSavedProjects } from '@/shared/scene/scene-sync';

export function CollaborationMenu({ onOpen }: { onOpen: () => void }) {
  const { state, status, peers, pending, error } = useCollaboration();
  const shared = useProject((project) => project.remote?.shared);
  const [open, setOpen] = useState(false),
    [name, setName] = useState('');
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  const run = (task: () => Promise<void>) => {
    setBusy(true);
    setFailure(null);
    void task()
      .catch((reason: unknown) =>
        setFailure(reason instanceof Error ? reason.message : 'Sharing could not be updated.'),
      )
      .finally(() => setBusy(false));
  };
  const live = shared && state && state.project.id === useProject.getState().remote?.id;
  const online = new Set(peers.map((peer) => peer.member.id));
  return (
    <div className="collaboration-controls" ref={panel}>
      <button
        className="house-toggle collaboration-toggle"
        aria-label="Collaborate"
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen();
          setOpen(!open);
        }}
      >
        <Users size={20} strokeWidth={1.5} />
        {shared && <i data-status={status} />}
      </button>
      {open && (
        <section className="collaboration-menu" aria-label="Collaboration">
          <div className="panel-heading">
            <span>Share this house</span>
            <button
              className="icon-button"
              aria-label="Close collaboration"
              onClick={() => setOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          {shared && status === 'denied' ? null : live ? (
            <>
              <div className="collaboration-sync" role="status">
                <i data-status={status} />
                {pending
                  ? `Syncing ${pending} change${pending === 1 ? '' : 's'}…`
                  : status === 'live'
                    ? 'All changes saved'
                    : status === 'denied'
                      ? 'Access removed'
                      : 'Reconnecting…'}
              </div>
              <ul className="collaboration-members">
                {state.members.map((member) => (
                  <li key={member.id}>
                    <span className="collaboration-avatar" style={{ background: member.color }}>
                      {member.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <strong>
                        {member.name}
                        {member.id === state.self.id ? ' (you)' : ''}
                      </strong>
                      <small>
                        {member.active === false
                          ? 'Access removed'
                          : status === 'live' &&
                              (online.has(member.id) || member.id === state.self.id)
                            ? 'Here now'
                            : 'Offline'}
                      </small>
                    </div>
                    {state.self.role === 'owner' && member.role !== 'owner' ? (
                      <select
                        aria-label={`Access for ${member.name}`}
                        value={member.active === false ? 'removed' : member.role}
                        disabled={busy || status !== 'live'}
                        onChange={(event) =>
                          run(async () => {
                            const next = await collaborationApi.manage(
                              state.project.id,
                              member.id,
                              event.target.value as 'editor' | 'viewer' | 'removed',
                            );
                            useCollaboration.setState({ state: next });
                          })
                        }
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                        <option value="removed">Remove</option>
                      </select>
                    ) : (
                      <small>{member.role}</small>
                    )}
                  </li>
                ))}
              </ul>
              {state.self.role === 'owner' && (
                <InvitationLinks projectId={state.project.id} disabled={status !== 'live'} />
              )}
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!name.trim()) return;
                run(async () => {
                  collaborationBridge.preparing = true;
                  try {
                    const saved = useSavedProjects.getState();
                    if (!(await saved.preserve()))
                      throw new Error(
                        useSavedProjects.getState().error ?? 'Wait for your house to save.',
                      );
                    if (!useProject.getState().remote) await useSavedProjects.getState().save();
                    const remote = useProject.getState().remote;
                    if (!remote) throw new Error('Save this house before inviting someone.');
                    const sharedState = await collaborationApi.enable(
                      remote.id,
                      name.trim(),
                      remote.version,
                    );
                    useCollaboration.setState({ state: sharedState });
                    useProject.setState({ remote: remoteShared(sharedState) });
                  } finally {
                    collaborationBridge.preparing = false;
                  }
                });
              }}
            >
              <p>Explore and edit the same house, each with your own view.</p>
              <label>
                Your name
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={40}
                  autoComplete="nickname"
                />
              </label>
              <button
                className="collaboration-primary"
                disabled={busy || !name.trim()}
                type="submit"
              >
                {busy ? <LoaderCircle size={16} className="spinning" /> : <Users size={16} />} Start
                sharing
              </button>
            </form>
          )}
          {(failure || (shared && error)) && (
            <p className="collaboration-error" role="alert">
              {failure ?? error}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
