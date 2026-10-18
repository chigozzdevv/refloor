import { useState } from 'react';
import { ArrowUp, LoaderCircle, X } from 'lucide-react';
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
  const { send, busy, reply } = useLanguageEdit(target);
  const submit = async (text: string) => {
    if (await send(text)) setMessage('');
  };
  return (
    <section
      className="element-chat"
      aria-label={`${label} chat`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="chat-heading">
        <span>{label}</span>
        {close && (
          <button className="icon-button" aria-label="Close chat" onClick={close}>
            <X size={14} />
          </button>
        )}
      </div>
      {reply && (
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
        <input
          aria-label={`Message ${label}`}
          placeholder="What would you like to change?"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={500}
          disabled={busy}
          autoComplete="off"
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') close?.();
          }}
        />
        <button className="chat-send" aria-label="Send request" disabled={busy || !message.trim()}>
          {busy ? <LoaderCircle size={16} className="spinning" /> : <ArrowUp size={16} />}
        </button>
      </form>
      {!reply && (
        <div className="chat-suggestions">
          {suggestions.map((text) => (
            <button
              key={text}
              type="button"
              disabled={busy}
              onClick={() => {
                void submit(text);
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
