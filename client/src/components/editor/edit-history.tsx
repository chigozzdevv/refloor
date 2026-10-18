import { MessageCircle, Redo2, RotateCcw, Undo2, X } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';

export function EditHistory({ close }: { close: () => void }) {
  const { past, future, undo, redo, undoTo } = useProject();
  const records = past.filter((record) => record.source !== 'navigation').toReversed(),
    canRedo = future.some((record) => record.source !== 'navigation');
  return (
    <section className="edit-history" aria-label="Edit history">
      <div className="panel-heading">
        <span>History</span>
        <button className="icon-button" aria-label="Close history" onClick={close}>
          <X size={17} />
        </button>
      </div>
      <div className="history-actions">
        <button disabled={!records.length} onClick={undo}>
          <Undo2 size={15} />
          Undo
        </button>
        <button disabled={!canRedo} onClick={redo}>
          <Redo2 size={15} />
          Redo
        </button>
      </div>
      {!records.length && (
        <p className="history-empty">
          Your changes will appear here and stay with this browser draft.
        </p>
      )}
      <ol className="history-list">
        {records.map((record) => (
          <li key={record.revision.id}>
            <span className="history-kind">
              {record.source === 'chat' ? <MessageCircle size={15} /> : <RotateCcw size={15} />}
            </span>
            <div>
              <p>{record.label}</p>
              {record.target && <small className="history-target">{record.target}</small>}
              <time dateTime={record.revision.at}>
                {new Date(record.revision.at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </div>
            <button
              className="icon-button"
              title="Undo this change and the changes after it"
              aria-label={`Undo before ${record.label}`}
              onClick={() => undoTo(record.revision.id)}
            >
              <Undo2 size={15} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
