import { useCollaboration } from '@/shared/collaboration/store';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { History, Lightbulb, LoaderCircle, Send, Undo2, X } from 'lucide-react';
import type { ChatTarget } from '@refloor/scene/chat';
import { useLanguageEdit } from '@/shared/editor/use-language-edit';

export function ElementChat({
  target,
  label,
  suggestions,
  status,
  close,
  active = true,
}: {
  target: ChatTarget;
  label: string;
  suggestions: string[];
  status?: string | null;
  close?: () => void;
  active?: boolean;
}) {
  const readonly = useCollaboration(
    (state) =>
      state.status !== 'idle' && (state.status !== 'live' || state.state?.self.role === 'viewer'),
  );
  const activity = useCollaboration((state) => state.state?.activity);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<{ message: string; turnIds: string[] } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const { send, busy, reply, history } = useLanguageEdit(target);
  useLayoutEffect(() => {
    if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [showHistory, history.length, reply, pending]);
  useLayoutEffect(() => {
    if (input.current) {
      input.current.style.height = 'auto';
      input.current.style.height = `${Math.min(96, input.current.scrollHeight)}px`;
    }
  }, [message]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (active && !readonly && !busy)
        useCollaboration.setState({ draft: message.trim() ? { target, text: message } : null });
    }, 120);
    return () => {
      clearTimeout(timer);
      useCollaboration.setState({ draft: null });
    };
  }, [message, target.kind, target.id, target.side, readonly, busy, active]);
  const submit = async (text: string) => {
    if (busy || readonly || !text.trim()) return;
    useCollaboration.setState({ draft: null });
    setShowSuggestions(false);
    setPending({ message: text.trim(), turnIds: history.map((turn) => turn.id) });
    setMessage('');
    try {
      if (!(await send(text))) setMessage(text);
    } finally {
      setPending(null);
    }
  };
  const previous = pending ? history.filter((turn) => pending.turnIds.includes(turn.id)) : history;
  const visibleHistory = showHistory ? previous : pending ? [] : previous.slice(-1);
  return (
    <section
      className="element-chat"
      aria-label={`${label} chat`}
      aria-busy={busy}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="chat-heading">
        <span title={label}>{label}</span>
        <div className="chat-heading-actions">
          {history.length > 0 && (
            <button
              className="icon-button"
              type="button"
              aria-label="Recent conversation"
              aria-expanded={showHistory}
              title="Recent conversation"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History size={14} />
            </button>
          )}
          {suggestions.length > 0 && (
            <button
              className="icon-button"
              type="button"
              aria-label={showSuggestions ? 'Hide suggestions' : 'Show suggestions'}
              aria-expanded={showSuggestions}
              title="Suggestions"
              onClick={() => setShowSuggestions(!showSuggestions)}
            >
              <Lightbulb size={14} />
            </button>
          )}
          {close && (
            <button className="icon-button" aria-label="Close chat" onClick={close}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      {(visibleHistory.length > 0 || pending) && (
        <div
          ref={conversation}
          className="chat-conversation"
          data-expanded={showHistory}
          role="log"
          aria-label="Recent conversation"
          aria-live="polite"
        >
          {visibleHistory.map((turn) => {
            const event = activity?.find((item) => item.id === turn.revisionId),
              reverted = Boolean(event?.revertedBy),
              attribution = event?.lastHistoryAction?.author.name,
              undoLabel = attribution ? `Undone by ${attribution}` : 'Undone';
            return (
              <div className="chat-turn" key={turn.id} data-reverted={reverted}>
                <p className="chat-user-message">
                  {reverted && (
                    <span
                      className="chat-turn-state"
                      title={undoLabel}
                      role="img"
                      aria-label={undoLabel}
                    >
                      <Undo2 size={13} />
                    </span>
                  )}
                  {turn.author && <small className="chat-author">{turn.author.name}</small>}
                  {turn.message}
                </p>
                {(!busy || showHistory) && (
                  <p className="chat-assistant-message" data-status={turn.status}>
                    {turn.reply}
                  </p>
                )}
              </div>
            );
          })}
          {pending && (
            <div className="chat-turn">
              <p className="chat-user-message">{pending.message}</p>
              <span className="typing-dots" role="status" aria-label="Applying change">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}
        </div>
      )}
      {status && status !== reply && (
        <p className="chat-reply" role="status">
          {status}
        </p>
      )}
      <form
        className="chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(message);
        }}
      >
        <textarea
          ref={input}
          rows={1}
          aria-label={`Message ${label}`}
          placeholder={readonly ? 'View access' : 'Describe a change…'}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={500}
          disabled={busy || readonly}
          autoComplete="off"
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || close) event.stopPropagation();
            if (event.key === 'Escape') close?.();
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit(message);
            }
          }}
        />
        <button
          className="chat-send"
          aria-label="Send request"
          disabled={busy || readonly || !message.trim()}
        >
          {busy ? <LoaderCircle size={16} className="spinning" /> : <Send size={15} />}
        </button>
      </form>
      {showSuggestions && (
        <div className="chat-suggestions">
          {suggestions.map((text) => (
            <button
              key={text}
              type="button"
              disabled={busy || readonly}
              onClick={() => {
                setMessage(text);
                setShowSuggestions(false);
                input.current?.focus();
              }}
            >
              {text}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
