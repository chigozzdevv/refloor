import { useEffect, useState } from 'react';
import type { Generation } from '@refloor/scene/contracts';
import { generationApi, persistGeneration, restoreGeneration } from '@/shared/refloor/progress';
import type { PendingGeneration } from '@/shared/refloor/progress';
import { useSavedProjects } from '@/shared/scene/scene-sync';
import { GenerationProgress } from '@/components/entrance/generation-progress';

export function HousePrompt({ close }: { close: () => void }) {
  const [pending, setPending] = useState<PendingGeneration | null>(restoreGeneration);
  const [prompt, setPrompt] = useState(
    () =>
      restoreGeneration()?.prompt ??
      'A modern two-bedroom bungalow with an open living and dining area, a separate kitchen, a bathroom and a workspace. Cream walls and oak floors.',
  );
  const [job, setJob] = useState<Generation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const opening = useSavedProjects((state) => state.opening);
  const terminal = job?.status === 'complete' || job?.status === 'failed';
  const busy = pending !== null && !terminal;
  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current = pending;
    const poll = async () => {
      try {
        const next = current.jobId
          ? await generationApi.get(current.jobId)
          : await generationApi.create(current);
        if (cancelled) return;
        current = { ...current, jobId: next.id };
        persistGeneration(current);
        setJob(next);
        setError(next.error);
        if (!['complete', 'failed'].includes(next.status))
          timer = setTimeout(() => {
            void poll();
          }, 1500);
      } catch (failure) {
        if (!cancelled)
          setError(failure instanceof Error ? failure.message : 'Generation could not connect.');
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pending, attempt]);

  return (
    <form
      className="house-prompt"
      onSubmit={(event) => {
        event.preventDefault();
        const next = { requestId: crypto.randomUUID(), prompt: prompt.trim(), jobId: null };
        persistGeneration(next);
        setJob(null);
        setError(null);
        setPending(next);
      }}
    >
      <label className="field-caption" htmlFor="house-description">
        DESCRIBE YOUR HOME
      </label>
      <textarea
        id="house-description"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        minLength={10}
        maxLength={2000}
        required
        disabled={busy}
        rows={5}
      />
      <p className="prompt-hint">One or two storeys. Choose your rooms, colours and finishes.</p>
      {pending && <GenerationProgress job={job} />}
      {error && (
        <p className="generation-error" role="alert">
          {error}
        </p>
      )}
      {error && busy && (
        <button
          type="button"
          className="home-option"
          onClick={() => {
            setError(null);
            setAttempt((value) => value + 1);
          }}
        >
          Retry connection
        </button>
      )}
      {!busy && (
        <button className="home-option" type="submit">
          <strong>{terminal ? 'Generate another house' : 'Generate my house'}</strong>
        </button>
      )}
      {job?.status === 'complete' && job.projectId && (
        <button
          type="button"
          className="home-option"
          disabled={opening}
          onClick={async () => {
            if (await useSavedProjects.getState().open(job.projectId!)) {
              persistGeneration(null);
              close();
            } else setError(useSavedProjects.getState().error);
          }}
        >
          <strong>{opening ? 'Opening…' : 'Open generated house'}</strong>
        </button>
      )}
    </form>
  );
}
