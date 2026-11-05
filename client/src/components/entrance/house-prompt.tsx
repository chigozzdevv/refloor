import { useEffect, useRef, useState } from 'react';
import { ArrowRight, LoaderCircle, Send } from 'lucide-react';
import type { Generation } from '@refloor/scene/contracts';
import { generationApi, persistGeneration, restoreGeneration } from '@/shared/refloor/progress';
import type { PendingGeneration } from '@/shared/refloor/progress';
import { useSavedProjects } from '@/shared/scene/scene-sync';
import { GenerationProgress } from '@/components/entrance/generation-progress';
import { ProjectApiError } from '@/shared/refloor/client';

const defaultPrompt =
  'Create a modern two-storey home with three bedrooms upstairs, a bathroom on each floor and stairs at the rear. Downstairs, include spacious open-plan living and dining, a separate kitchen and an office. Use cream interiors, oak floors and cabinetry, sage seating, black fittings, brick exterior walls and a dark flat asphalt roof. Add large windows, a TV with stereo speakers, dining furniture, planters, warm wall lights and a paved compound. Keep the main bedroom spacious and walkways clear.';

export function HousePrompt({
  close,
  resume,
  templates,
  canResume,
  choosingTemplate = false,
}: {
  close: () => void;
  resume: () => void;
  templates: () => void;
  canResume: boolean;
  choosingTemplate?: boolean;
}) {
  const [pending, setPending] = useState<PendingGeneration | null>(restoreGeneration);
  const [prompt, setPrompt] = useState(() => pending?.prompt ?? defaultPrompt);
  const [job, setJob] = useState<Generation | null>(null),
    [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0),
    [opening, setOpening] = useState(false),
    [starting, setStarting] = useState(false);
  const openingJob = useRef<string | null>(null),
    mounted = useRef(true),
    completed = useRef(close);
  completed.current = close;
  const busy = starting || opening || (pending !== null && job?.status !== 'failed');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const open = async (projectId: string) => {
    if (opening) return;
    setOpening(true);
    setError(null);
    if (!(await useSavedProjects.getState().preserve())) {
      if (mounted.current) {
        setOpening(false);
        setError(
          useSavedProjects.getState().error ??
            'Your existing house could not be saved. Try opening the new house again.',
        );
      }
      return;
    }
    if (!mounted.current) return;
    const success = await useSavedProjects.getState().open(projectId);
    if (!mounted.current) return;
    setOpening(false);
    if (success) {
      persistGeneration(null);
      completed.current();
    } else
      setError(
        useSavedProjects.getState().error ??
          'Your house is ready, but could not be opened. Try again.',
      );
  };
  useEffect(() => {
    if (!pending) return;
    let cancelled = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      current = pending;
    const poll = async () => {
      try {
        const next = current.jobId
          ? await generationApi.get(current.jobId)
          : await generationApi.create(current);
        if (cancelled) return;
        current = { ...current, jobId: next.id };
        persistGeneration(current);
        setJob(next);
        if (next.status === 'failed') {
          persistGeneration(null);
          setPending(null);
        }
        setError(
          next.error ??
            (next.status === 'failed'
              ? 'This house could not be generated. Please try again.'
              : null),
        );
        if (!['complete', 'failed'].includes(next.status))
          timer = setTimeout(() => {
            void poll();
          }, 1500);
      } catch (failure) {
        if (cancelled) return;
        if (
          failure instanceof ProjectApiError &&
          (!failure.retryable || failure.code === 'GENERATION_UNAVAILABLE')
        ) {
          persistGeneration(null);
          setPending(null);
          setJob(null);
        }
        setError(
          failure instanceof ProjectApiError && failure.code === 'GENERATION_NOT_FOUND'
            ? 'This generation is no longer available. You can try your description again.'
            : failure instanceof ProjectApiError && failure.code === 'GENERATION_UNAVAILABLE'
              ? 'House generation is unavailable. Choose a starting house.'
              : failure instanceof Error
                ? failure.message
                : 'Generation could not connect.',
        );
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pending, attempt]);
  useEffect(() => {
    if (
      choosingTemplate ||
      job?.status !== 'complete' ||
      !job.projectId ||
      openingJob.current === job.id
    )
      return;
    openingJob.current = job.id;
    void open(job.projectId);
  });
  const submit = async () => {
    if (busy || prompt.trim().length < 10) return;
    setStarting(true);
    setError(null);
    const preserved = await useSavedProjects.getState().preserve();
    if (!mounted.current) return;
    setStarting(false);
    if (!preserved) {
      setError(
        useSavedProjects.getState().error ?? 'Your existing house could not be saved. Try again.',
      );
      return;
    }
    const next = { requestId: crypto.randomUUID(), prompt: prompt.trim(), jobId: null };
    persistGeneration(next);
    setJob(null);
    setError(null);
    setPending(next);
  };
  return (
    <section className="prompt-home" aria-label="Create your house">
      <h1>Describe the home you imagine.</h1>
      <form
        className="prompt-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <textarea
          aria-label="Describe your house"
          placeholder="A two-bedroom bungalow with cream walls, oak floors and a bright living room…"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          minLength={10}
          maxLength={2000}
          required
          rows={3}
          disabled={busy}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="prompt-bottom">
          <button
            className="prompt-send"
            type="submit"
            aria-label="Generate house"
            disabled={busy || prompt.trim().length < 10}
          >
            {busy ? (
              <LoaderCircle size={20} className="spinning" />
            ) : (
              <Send size={20} strokeWidth={1.6} />
            )}
          </button>
        </div>
      </form>
      {starting && (
        <p className="generation-status" role="status">
          Saving your current house…
        </p>
      )}
      {pending && !starting && !opening && !error && <GenerationProgress job={job} />}
      {opening && (
        <p className="generation-status" role="status">
          Preparing your entrance…
        </p>
      )}
      {error && (
        <div className="prompt-error" role="alert">
          <p>{error}</p>
          {job?.status === 'complete' && job.projectId ? (
            <button
              onClick={() => {
                void open(job.projectId!);
              }}
              disabled={opening}
            >
              Open your house
            </button>
          ) : busy ? (
            <button
              onClick={() => {
                setError(null);
                setAttempt((value) => value + 1);
              }}
            >
              Retry connection
            </button>
          ) : null}
        </div>
      )}
      {!starting && !opening && (
        <div className="prompt-alternatives">
          {canResume && (
            <>
              <button
                onClick={() => {
                  if (job?.status === 'failed') persistGeneration(null);
                  resume();
                }}
              >
                Back to your house <ArrowRight size={14} />
              </button>
              <span />
            </>
          )}
          <button onClick={templates}>Choose a starting house</button>
        </div>
      )}
    </section>
  );
}
