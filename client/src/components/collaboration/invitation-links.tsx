import { useEffect, useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { collaborationApi } from '@/shared/collaboration/api';
type Link = { id: string; role: 'editor' | 'viewer'; expiresAt: string };
export function InvitationLinks({ projectId, disabled }: { projectId: string; disabled: boolean }) {
  const [items, setItems] = useState<Link[]>([]),
    [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [link, setLink] = useState<{ id: string; url: string } | null>(null),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let closed = false;
    void collaborationApi
      .invites(projectId)
      .then((result) => {
        if (!closed) setItems(result.items);
      })
      .catch((reason: unknown) => {
        if (!closed)
          setError(reason instanceof Error ? reason.message : 'Invitations could not load.');
      });
    return () => {
      closed = true;
    };
  }, [projectId]);
  const run = (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    void task()
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error ? reason.message : 'This invitation could not be changed.',
        ),
      )
      .finally(() => setBusy(false));
  };
  return (
    <div>
      <div className="collaboration-invite">
        <select
          aria-label="Invitation access"
          value={role}
          onChange={(event) => setRole(event.target.value as 'editor' | 'viewer')}
        >
          <option value="editor">Can edit</option>
          <option value="viewer">Can view</option>
        </select>
        <button
          disabled={busy || disabled}
          onClick={() =>
            run(async () => {
              const invitation = await collaborationApi.invite(projectId, role);
              setLink({ id: invitation.id, url: `${location.origin}/#invite=${invitation.token}` });
              setItems((current) => [...current, invitation]);
              setCopied(false);
            })
          }
        >
          <Link2 size={16} /> Create invite
        </button>
      </div>
      {link && (
        <div className="collaboration-link">
          <input
            aria-label="Invitation link"
            readOnly
            value={link.url}
            onFocus={(event) => event.target.select()}
          />
          <button
            className="icon-button"
            aria-label="Copy invitation"
            onClick={() =>
              run(async () => {
                await navigator.clipboard.writeText(link.url);
                setCopied(true);
              })
            }
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
          <small>This link opens only this house.</small>
        </div>
      )}
      {items.length > 0 && (
        <details className="collaboration-links">
          <summary>Active links · {items.length}</summary>
          {items.map((item) => (
            <div key={item.id}>
              <small>
                {item.role === 'editor' ? 'Editor' : 'Viewer'} · until{' '}
                {new Date(item.expiresAt).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                })}
              </small>
              <button
                className="collaboration-revoke"
                aria-label={`Revoke ${item.role} invitation ${item.id.slice(0, 8)}`}
                disabled={busy || disabled}
                onClick={() =>
                  run(async () => {
                    await collaborationApi.revoke(projectId, item.id);
                    setItems((current) => current.filter((value) => value.id !== item.id));
                    if (link?.id === item.id) setLink(null);
                  })
                }
              >
                Revoke
              </button>
            </div>
          ))}
        </details>
      )}
      {error && (
        <p role="alert" className="collaboration-error">
          {error}
        </p>
      )}
    </div>
  );
}
