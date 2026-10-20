import { useState } from 'react';
import { Download, KeyRound } from 'lucide-react';
import { sessionApi } from '@/shared/refloor/sessions';
import { useSavedProjects } from '@/shared/scene/scene-sync';
import { downloadText } from '@/shared/scene/files';

export function ProjectRecovery() {
  const syncing = useSavedProjects((state) => state.saving || state.opening || state.recovering);
  const [open, setOpen] = useState(false),
    [key, setKey] = useState(''),
    [created, setCreated] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await sessionApi.createRecoveryKey();
      setCreated(result.key);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The recovery key could not be created.');
    } finally {
      setBusy(false);
    }
  };
  const recover = async () => {
    if (syncing) return;
    setBusy(true);
    setMessage(null);
    try {
      if (!(await useSavedProjects.getState().restoreCollection(key.trim())))
        throw new Error(
          useSavedProjects.getState().error ?? 'The collection could not be restored.',
        );
      setKey('');
      setCreated(null);
      setMessage('Collection restored. Your current draft is still open.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The collection could not be restored.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="project-recovery">
      <button className="file-action" aria-expanded={open} onClick={() => setOpen(!open)}>
        <KeyRound size={16} />
        <span>
          Collection recovery<small>Open your saved spaces on another device</small>
        </span>
      </button>
      {open && (
        <section className="recovery-panel" aria-label="Collection recovery">
          <p>Keep a recovery key to reopen this collection after changing browsers or devices.</p>
          <button
            className="button compact outline"
            disabled={busy || syncing}
            onClick={() => void create()}
          >
            {busy ? 'Working…' : 'Create recovery key'}
          </button>
          <small>
            Creating a new key replaces your previous key. Anyone with it can open your collection.
          </small>
          {created && (
            <div className="recovery-key">
              <code>{created}</code>
              <button
                className="file-action"
                onClick={() =>
                  downloadText(
                    JSON.stringify({ format: 'refloor-collection-key', key: created }, null, 2),
                    'refloor-collection-key.json',
                  )
                }
              >
                <Download size={14} /> Save recovery key
              </button>
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void recover();
            }}
          >
            <label htmlFor="collection-recovery-key">Have a recovery key?</label>
            <input
              id="collection-recovery-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="rf_…"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              disabled={busy || syncing}
              maxLength={80}
            />
            <button
              className="button compact outline"
              disabled={busy || syncing || !/^rf_[a-f0-9]{64}$/.test(key.trim())}
            >
              Open collection
            </button>
          </form>
          {message && <p role="status">{message}</p>}
        </section>
      )}
    </div>
  );
}
