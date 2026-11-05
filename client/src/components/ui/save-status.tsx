import { AlertCircle, CloudUpload, LoaderCircle } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';
import { useSavedProjects } from '@/shared/scene/scene-sync';

export function SaveStatus({ openRecovery }: { openRecovery: () => void }) {
  const localError = useProject((state) => state.saveError);
  const { saveError: error, conflict, retrying, saving } = useSavedProjects();
  if (!localError && !error && !retrying) return null;
  const recover = localError || conflict || !retrying;
  return (
    <button
      className="save-status"
      onClick={recover ? openRecovery : () => void useSavedProjects.getState().retrySave()}
      disabled={!recover && saving}
      title={localError ?? error ?? 'Retrying save'}
      aria-label={
        localError
          ? 'Open save recovery'
          : conflict
            ? 'Resolve save conflict'
            : recover
              ? 'Open save options'
              : 'Retry saving'
      }
    >
      {recover ? (
        <AlertCircle size={15} />
      ) : saving ? (
        <LoaderCircle size={15} className="spinning" />
      ) : (
        <CloudUpload size={15} />
      )}
      {localError
        ? 'Save issue'
        : conflict
          ? 'Save conflict'
          : retrying
            ? 'Retrying save…'
            : 'Save issue'}
    </button>
  );
}
