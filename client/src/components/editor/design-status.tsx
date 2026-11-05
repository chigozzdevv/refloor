import { useEffect, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';
import { designPreviewNeedsSpace } from '@/shared/editor/design-checkpoints';

export function DesignDiscardPrompt({
  cancel,
  confirm,
}: {
  cancel: () => void;
  confirm: () => void;
}) {
  return (
    <div className="design-discard" role="group" aria-label="Discard preview changes">
      <span>Saved designs are full. Discard preview edits?</span>
      <div>
        <button onClick={cancel}>Keep editing</button>
        <button onClick={confirm}>Discard & continue</button>
      </div>
    </div>
  );
}

export function DesignStatus() {
  const { memory, chatPending, projectEpoch, returnToWorking } = useProject();
  const [confirming, setConfirming] = useState(false);
  const comparison = memory.designs?.comparison;
  const active = memory.designs?.items.find((item) => item.id === comparison?.checkpointId);
  useEffect(() => setConfirming(false), [projectEpoch, comparison?.checkpointId]);
  if (!active) return null;
  return (
    <div className="design-status" aria-label={`Viewing design ${active.name}`}>
      <span title={active.name}>Viewing {active.name}</span>
      <button
        disabled={!!chatPending}
        onClick={() => {
          if (designPreviewNeedsSpace(useProject.getState())) setConfirming(true);
          else returnToWorking();
        }}
      >
        <ArrowLeftRight size={14} />
        Return
      </button>
      {confirming && (
        <DesignDiscardPrompt
          cancel={() => setConfirming(false)}
          confirm={() => {
            if (returnToWorking(true)) setConfirming(false);
          }}
        />
      )}
    </div>
  );
}
