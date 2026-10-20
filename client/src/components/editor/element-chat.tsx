import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, History, Lightbulb, LoaderCircle, X } from 'lucide-react';
import type { ChatTarget } from '@refloor/scene/chat';
import { useLanguageEdit } from '@/shared/editor/use-language-edit';

export function ElementChat({
  target,
  label,
  suggestions,
  close,
}: {
  target: ChatTarget;
  label: string;
  suggestions: string[];
  close?: () => void;
}) {
  const [message, setMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(
    target.kind === 'wall' && target.side === 'exterior',
  );
  const input = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const { send, busy, reply, history } = useLanguageEdit(target);
  useLayoutEffect(() => {
    if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [showHistory, history.length, reply]);
  useLayoutEffect(() => {
    if (input.current) {
      input.current.style.height = 'auto';
      input.current.style.height = `${Math.min(96, input.current.scrollHeight)}px`;
    }
  }, [message]);
  const submit = async (text: string) => {
    if (busy || !text.trim()) return;
    setShowSuggestions(false);
    if (await send(text)) setMessage('');
  };
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
              aria-label="Show suggestions"
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
      {showHistory && (
        <div
          ref={conversation}
          className="chat-conversation"
          role="log"
          aria-label="Recent conversation"
        >
          {history.map((turn) => (
            <div className="chat-turn" key={turn.id}>
              <p className="chat-user-message">{turn.message}</p>
              <p className="chat-assistant-message" data-status={turn.status}>
                {turn.reply}
              </p>
            </div>
          ))}
        </div>
      )}
      {!showHistory && reply && (
        <p className="chat-reply" role="status">
          {reply}
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
          placeholder="Describe a change…"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={500}
          disabled={busy}
          autoComplete="off"
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') close?.();
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit(message);
            }
          }}
        />
        <button className="chat-send" aria-label="Send request" disabled={busy || !message.trim()}>
          {busy ? <LoaderCircle size={16} className="spinning" /> : <ArrowUp size={16} />}
        </button>
      </form>
      {showSuggestions && (
        <div className="chat-suggestions">
          {suggestions.map((text) => (
            <button
              key={text}
              type="button"
              disabled={busy}
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
