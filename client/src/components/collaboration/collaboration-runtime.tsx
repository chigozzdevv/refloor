import { useEffect, useState } from 'react';
import { LoaderCircle, Users, X } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';
import { startCollaboration, openShared } from '@/shared/collaboration/runtime';
import { collaborationApi } from '@/shared/collaboration/api';
import { useSavedProjects } from '@/shared/scene/scene-sync';
import { useExperience } from '@/shared/scene/experience-store';
export function CollaborationRuntime() {
  const remote = useProject((state) => state.remote);
  const [token, setToken] = useState(() =>
    new URLSearchParams(location.hash.slice(1)).get('invite'),
  );
  const [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const change = () => setToken(new URLSearchParams(location.hash.slice(1)).get('invite'));
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    if (remote?.shared) return startCollaboration(remote.id);
  }, [remote?.id, remote?.shared]);
  const close = () => {
    history.replaceState(null, '', location.pathname + location.search);
    setToken(null);
  };
  if (!token) return null;
  return (
    <div className="collaboration-backdrop">
      <form
        className="collaboration-join"
        aria-label="Join shared house"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim() || busy) return;
          setBusy(true);
          setError(null);
          void (async () => {
            if (!(await useSavedProjects.getState().preserve()))
              throw new Error(
                useSavedProjects.getState().error ?? 'Your current house must finish saving first.',
              );
            const state = await collaborationApi.join(token, name.trim());
            openShared(state);
            useExperience.getState().finish();
            close();
          })()
            .catch((reason: unknown) =>
              setError(
                reason instanceof Error ? reason.message : 'This house could not be joined.',
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        <div className="panel-heading">
          <span>
            <Users size={18} /> Join a shared house
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Close invitation"
            disabled={busy}
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        <p>Explore together. Your name appears beside the items you select.</p>
        <label>
          Your name
          <input
            autoFocus
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="nickname"
          />
        </label>
        {error && (
          <p role="alert" className="collaboration-error">
            {error}
          </p>
        )}
        <button type="submit" className="collaboration-primary" disabled={busy || !name.trim()}>
          {busy ? <LoaderCircle size={16} className="spinning" /> : <Users size={16} />}{' '}
          {busy ? 'Joining…' : 'Join house'}
        </button>
      </form>
    </div>
  );
}
