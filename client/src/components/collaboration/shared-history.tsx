import { targetIdentity } from '@/shared/editor/identity';
import { useLayoutEffect, useRef, useState } from 'react';
import { LoaderCircle, Redo2, Undo2 } from 'lucide-react';
import { PanelHeading } from '@/components/ui/panel-heading';
import { useCollaboration } from '@/shared/collaboration/store';
import { collaborationBridge } from '@/shared/collaboration/bridge';
import { collaborationApi } from '@/shared/collaboration/api';
import { mergeActivity } from '@/shared/collaboration/history';

export function SharedHistory({
  close,
  back,
}: {
  close: () => void;
  back?: (() => void) | undefined;
}) {
  const { state, pending, status, error } = useCollaboration();
  const [loading, setLoading] = useState(false);
  const messages = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const earlierPosition = useRef<{ height: number; top: number } | null>(null);
  const events = state?.activity.filter(
    (event) => event.kind === 'edit' && (event.source !== 'navigation' || event.undoable),
  );

  useLayoutEffect(() => {
    const list = messages.current;
    if (!list) return;
    const position = earlierPosition.current;
    if (position) {
      list.scrollTop = position.top + list.scrollHeight - position.height;
      earlierPosition.current = null;
    } else if (followLatest.current) list.scrollTop = list.scrollHeight;
  }, [state?.activity]);

  function loadEarlier() {
    if (!state || loading) return;
    const projectId = state.project.id;
    setLoading(true);
    void collaborationApi
      .history(projectId, state.activity[0]?.version ?? Number.MAX_SAFE_INTEGER)
      .then((page) => {
        if (useCollaboration.getState().state?.project.id !== projectId) return;
        if (messages.current)
          earlierPosition.current = {
            height: messages.current.scrollHeight,
            top: messages.current.scrollTop,
          };
        useCollaboration.setState((current) =>
          current.state
            ? {
                state: {
                  ...current.state,
                  activity: mergeActivity(page.items, current.state.activity),
                  hasEarlier: page.hasEarlier,
                },
              }
            : {},
        );
      })
      .catch((reason: unknown) =>
        useCollaboration.setState({
          error: reason instanceof Error ? reason.message : 'History could not load.',
        }),
      )
      .finally(() => setLoading(false));
  }

  return (
    <section className="edit-history shared-history" aria-label="Shared edit history">
      <PanelHeading title="History" close={close} back={back} />
      {error && (
        <p className="collaboration-error" role="alert">
          {error}
        </p>
      )}
      <div
        className="shared-history-messages"
        ref={messages}
        onScroll={(event) => {
          const list = event.currentTarget;
          followLatest.current = list.scrollHeight - list.scrollTop - list.clientHeight < 32;
        }}
      >
        {!state && <LoaderCircle className="spinning" size={18} aria-label="Loading history" />}
        {state?.hasEarlier && (
          <button className="shared-history-earlier" disabled={loading} onClick={loadEarlier}>
            {loading && <LoaderCircle className="spinning" size={14} />} Older messages
          </button>
        )}
        {state && !events?.length && <p className="history-empty">No messages yet.</p>}
        <ol className="shared-history-list" aria-label="Messages">
          {state &&
            events?.map((event) => {
              const identity = event.target
                ? targetIdentity(state.project.building, event.target)
                : null;
              const action = event.lastHistoryAction;
              const attribution = action
                ? `${action.kind === 'rollback' ? 'Undone' : 'Restored'} by ${action.author.name}`
                : null;
              return (
                <li
                  key={event.id}
                  data-own={event.author.id === state.self.id}
                  data-reverted={Boolean(event.revertedBy)}
                >
                  <div className="shared-history-author">
                    <span style={{ background: event.author.color }} />
                    <span className="shared-history-name">
                      {event.author.id === state.self.id ? 'You' : event.author.name}
                    </span>
                    {action && (
                      <details className="shared-history-attribution">
                        <summary title={attribution!} aria-label={attribution!}>
                          {action.kind === 'rollback' ? <Undo2 size={12} /> : <Redo2 size={12} />}
                        </summary>
                        <span>
                          {attribution}
                          <time dateTime={action.at}>
                            {new Date(action.at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        </span>
                      </details>
                    )}
                    <time dateTime={event.at}>
                      {new Date(event.at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  <div className="shared-history-message">
                    <div className="shared-history-bubble">
                      {identity && <small title={identity.location}>{identity.label}</small>}
                      <p>{event.message ?? event.label}</p>
                    </div>
                    {event.undoable && state.self.role !== 'viewer' && (
                      <button
                        className="icon-button"
                        disabled={pending > 0 || status !== 'live'}
                        aria-label={`${event.revertedBy ? 'Restore' : 'Roll back'} ${event.label}`}
                        title={event.revertedBy ? 'Restore' : 'Undo'}
                        onClick={() =>
                          collaborationBridge.current?.rollback(event.id, Boolean(event.revertedBy))
                        }
                      >
                        {event.revertedBy ? <Redo2 size={15} /> : <Undo2 size={15} />}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
        </ol>
      </div>
    </section>
  );
}
