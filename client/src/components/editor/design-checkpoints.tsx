import { useMemo, useState } from 'react';
import { ArrowLeftRight, BookmarkPlus, Check, Eye, Trash2 } from 'lucide-react';
import { fingerprintBuilding } from '@refloor/scene';
import { maxDesigns } from '@refloor/scene/design-checkpoint';
import { useProject } from '@/shared/scene/scene-store';

export function DesignCheckpoints() {
  const [name, setName] = useState(''),
    [removing, setRemoving] = useState<string | null>(null);
  const { compiled, memory, chatPending, saveDesign, viewDesign, returnToWorking, removeDesign } =
    useProject();
  const designs = memory.designs,
    items = designs?.items ?? [],
    comparison = designs?.comparison,
    current = useMemo(() => fingerprintBuilding(compiled.building), [compiled.building]),
    active = comparison && items.find((item) => item.id === comparison.checkpointId);
  return (
    <section className="design-checkpoints" aria-label="Saved designs">
      <div className="design-heading">
        <h3>Designs</h3>
        <span>
          {items.length}/{maxDesigns}
        </span>
      </div>
      <form
        className="design-save"
        onSubmit={(event) => {
          event.preventDefault();
          if (saveDesign(name)) setName('');
        }}
      >
        <input
          aria-label="Design name"
          placeholder="Name this design"
          value={name}
          maxLength={64}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          className="icon-button"
          aria-label="Save current design"
          title="Save current design"
          disabled={!name.trim() || !!chatPending || items.length >= maxDesigns}
        >
          <BookmarkPlus size={18} />
        </button>
      </form>
      {active && (
        <div className="design-comparison">
          <p>
            Viewing <strong>{active.name}</strong>
          </p>
          <button disabled={!!chatPending} onClick={returnToWorking}>
            <ArrowLeftRight size={15} />
            Return to working design
          </button>
        </div>
      )}
      {!items.length && (
        <p className="design-empty">Save a version to compare changes from the same view.</p>
      )}
      <ul className="design-list">
        {items.map((item) => {
          const matches = current === fingerprintBuilding(item.building),
            selected = comparison?.checkpointId === item.id;
          return (
            <li key={item.id} data-active={selected || undefined}>
              <button
                className="design-view"
                aria-label={`View ${item.name}`}
                disabled={!!chatPending || (selected && matches)}
                onClick={() => viewDesign(item.id)}
              >
                {selected && matches ? <Check size={16} /> : <Eye size={16} />}
                <span>
                  <strong>{item.name}</strong>
                  <time dateTime={item.at}>
                    {new Date(item.at).toLocaleString([], {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </time>
                </span>
              </button>
              {removing === item.id ? (
                <div className="design-remove-confirm">
                  <span>Remove this design?</span>
                  <button onClick={() => setRemoving(null)}>Keep</button>
                  <button
                    onClick={() => {
                      if (removeDesign(item.id)) setRemoving(null);
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  className="icon-button"
                  aria-label={`Remove ${item.name}`}
                  title={selected ? 'Return to your working design first' : 'Remove saved design'}
                  disabled={!!chatPending || selected}
                  onClick={() => setRemoving(item.id)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
