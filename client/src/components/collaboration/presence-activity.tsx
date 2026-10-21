import { LoaderCircle } from 'lucide-react';
import { useCollaboration } from '@/shared/collaboration/store';
import { activePresence, presencePhase } from '@/shared/collaboration/presence';
import { targetIdentity } from '@/shared/editor/identity';

export function PresenceActivity() {
  const { peers, status, state } = useCollaboration();
  const active = activePresence(peers);
  if (status !== 'live' || !state || !active.length) return null;
  return (
    <div
      className="collaboration-activity"
      role="status"
      aria-live="polite"
      aria-label="Live collaborator activity"
    >
      {active.slice(0, 3).map((peer) => {
        const identity = peer.selection
          ? targetIdentity(state.project.building, peer.selection)
          : null;
        return (
          <div
            key={peer.member.id}
            title={identity ? `${identity.label} · ${identity.location}` : undefined}
          >
            <i style={{ background: peer.member.color }} />
            <span>
              <strong>{peer.member.name}</strong>{' '}
              {presencePhase(peer) === 'applying' ? 'is applying a change' : 'is typing'}
            </span>
            {presencePhase(peer) === 'applying' ? (
              <LoaderCircle className="spinning" size={12} />
            ) : (
              <span className="typing-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
          </div>
        );
      })}
      {active.length > 3 && <small>+{active.length - 3}</small>}
    </div>
  );
}
