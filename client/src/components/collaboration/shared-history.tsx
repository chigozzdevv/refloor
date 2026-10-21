import { useState } from 'react';
import { LoaderCircle, Redo2, Undo2, X } from 'lucide-react';
import { useCollaboration } from '@/shared/collaboration/store';
import { collaborationBridge } from '@/shared/collaboration/bridge';
import { collaborationApi } from '@/shared/collaboration/api';
export function SharedHistory({ close }: { close: () => void }) {
  const { state, pending, status, error } = useCollaboration();
  const [loading, setLoading] = useState(false);
  if (!state)
    return (
      <section className="edit-history">
        <p>Connecting shared history…</p>
      </section>
    );
  const events = state.activity
    .filter((event) => event.source !== 'navigation' || event.undoable)
    .toReversed();
  return (
    <section className="edit-history shared-history" aria-label="Shared edit history">
      <div className="panel-heading">
        <span>House history</span>
        <button className="icon-button" aria-label="Close history" onClick={close}>
          <X size={17} />
        </button>
      </div>
      <p className="shared-history-note">
        Roll back one change. Later edits to other properties stay.
      </p>
      {error && (
        <p className="collaboration-error" role="alert">
          {error}
        </p>
      )}
      {!events.length && (
        <p className="history-empty">Accepted changes appear here for everyone in this house.</p>
      )}
      <ol className="shared-history-list">
        {events.map((event) => (
          <li key={event.id} data-reverted={Boolean(event.revertedBy)}>
            <div className="shared-history-author">
              <span style={{ background: event.author.color }} />
              {event.author.name}
              <time dateTime={event.at}>
                {new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </time>
            </div>
            <div className="shared-history-bubble">
              <p>{event.message ?? event.label}</p>
              {event.reply && <small>{event.reply}</small>}
              {event.revertedBy && <small className="shared-history-state">Rolled back</small>}
              {event.kind === 'edit' && event.undoable && state.self.role !== 'viewer' && (
                <button
                  className="icon-button"
                  disabled={pending > 0 || status !== 'live'}
                  aria-label={`${event.revertedBy ? 'Restore' : 'Roll back'} ${event.label}`}
                  title={event.revertedBy ? 'Restore this change' : 'Roll back only this change'}
                  onClick={() =>
                    collaborationBridge.current?.rollback(event.id, Boolean(event.revertedBy))
                  }
                >
                  {event.revertedBy ? <Redo2 size={15} /> : <Undo2 size={15} />}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {state.hasEarlier && (
        <button
          className="shared-history-earlier"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void collaborationApi
              .history(state.project.id, state.activity[0]?.version ?? Number.MAX_SAFE_INTEGER)
              .then((page) =>
                useCollaboration.setState((current) =>
                  current.state
                    ? {
                        state: {
                          ...current.state,
                          activity: [...page.items, ...current.state.activity],
                          hasEarlier: page.hasEarlier,
                        },
                      }
                    : {},
                ),
              )
              .catch((reason: unknown) =>
                useCollaboration.setState({
                  error: reason instanceof Error ? reason.message : 'History could not load.',
                }),
              )
              .finally(() => setLoading(false));
          }}
        >
          {loading && <LoaderCircle className="spinning" size={14} />} Earlier changes
        </button>
      )}
    </section>
  );
}
