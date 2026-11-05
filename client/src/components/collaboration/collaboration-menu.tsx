import { InvitationLinks } from '@/components/collaboration/invitation-links';
import { collaborationBridge } from '@/shared/collaboration/bridge';
import { useState } from 'react';
import { ChevronDown, LoaderCircle, Users } from 'lucide-react';
import { PanelHeading } from '@/components/ui/panel-heading';
import type { SharedMember } from '@refloor/scene/collaboration';
import { PanelTabs } from '@/components/ui/panel-tabs';
import { useCollaboration } from '@/shared/collaboration/store';
import { collaborationApi } from '@/shared/collaboration/api';
import { remoteShared } from '@/shared/collaboration/runtime';
import { useProject } from '@/shared/scene/scene-store';
import { useSavedProjects } from '@/shared/scene/scene-sync';
import { activePresence, presencePhase } from '@/shared/collaboration/presence';

export function CollaborationMenu({ close, back }: { close: () => void; back: () => void }) {
  const { state, status, peers, pending, error } = useCollaboration();
  const shared = useProject((project) => project.remote?.shared);
  const [tab, setTab] = useState<'people' | 'invite'>('people');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<string | null>(null);
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
  const activity = new Map(
    activePresence(peers).map((peer) => [peer.member.id, presencePhase(peer)]),
  );
  const renderMembers = (members: SharedMember[]) => {
    if (!state) return null;
    return (
      <ul className="collaboration-members">
        {members.map((member) => (
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
                  : activity.has(member.id)
                    ? activity.get(member.id) === 'applying'
                      ? 'Applying a change…'
                      : 'Typing…'
                    : status === 'live' && (online.has(member.id) || member.id === state.self.id)
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
    );
  };
  const removed = state?.members.filter((member) => member.active === false) ?? [];
  const people = state && (
    <>
      {renderMembers(state.members.filter((member) => member.active !== false))}
      {removed.length > 0 && (
        <details className="collaboration-removed">
          <summary>
            Removed access <span>{removed.length}</span>
            <ChevronDown size={14} />
          </summary>
          {renderMembers(removed)}
        </details>
      )}
    </>
  );
  return (
    <section className="collaboration-menu" aria-label="Collaboration">
      <PanelHeading
        title="Share house"
        close={close}
        back={back}
        closeLabel="Close collaboration"
      />
      {shared && status === 'denied' ? (
        <p className="collaboration-error" role="status">
          {failure ?? error ?? 'Access removed'}
        </p>
      ) : live ? (
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
          {state.self.role === 'owner' ? (
            <PanelTabs
              label="Collaboration sections"
              tabs={
                [
                  { value: 'people', label: 'People' },
                  { value: 'invite', label: 'Invite' },
                ] as const
              }
              value={tab}
              onChange={setTab}
            >
              <div hidden={tab !== 'people'}>{people}</div>
              <div hidden={tab !== 'invite'}>
                <InvitationLinks projectId={state.project.id} disabled={status !== 'live'} />
              </div>
            </PanelTabs>
          ) : (
            people
          )}
        </>
      ) : shared ? (
        <div className="collaboration-sync" role="status">
          <LoaderCircle size={14} className="spinning" /> Connecting…
        </div>
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
                if (!useProject.getState().remote || useProject.getState().remote?.deleted)
                  await useSavedProjects.getState().save();
                const remote = useProject.getState().remote;
                if (!remote || remote.deleted)
                  throw new Error('Save this house before inviting someone.');
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
          <button className="collaboration-primary" disabled={busy || !name.trim()} type="submit">
            {busy ? <LoaderCircle size={16} className="spinning" /> : <Users size={16} />} Start
            sharing
          </button>
        </form>
      )}
      {status !== 'denied' && (failure || (shared && error)) && (
        <p className="collaboration-error" role="alert">
          {failure ?? error}
        </p>
      )}
    </section>
  );
}
