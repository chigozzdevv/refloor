import type { Generation } from '@refloor/scene/contracts';

const labels = {
  queued: 'Waiting to start…',
  interpreting: 'Designing your room programme…',
  layout: 'Arranging rooms and stairs…',
  validating: 'Checking access and furniture clearances…',
  saving: 'Saving your new space…',
  complete: 'Your space is ready.',
  failed: 'This house could not be generated.',
};
export function GenerationProgress({ job }: { job: Generation | null }) {
  return (
    <p className="generation-status" role="status" aria-live="polite">
      {job ? labels[job.status] : 'Submitting your description…'}
    </p>
  );
}
