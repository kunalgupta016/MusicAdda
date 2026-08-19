import { useEffect, useRef, useState } from "react";

export default function ChatPanel({ messages, clientId, onSend }) {
  const [text, setText] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <div className="board-frame-sm flex h-80 flex-col rounded-lg bg-tapri-paper">
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="font-chalk text-sm text-tapri-brown-light">Say something to the adda…</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.clientId === clientId ? "text-right" : ""}>
            <p className="text-xs text-tapri-brown-light">{m.clientId === clientId ? "You" : m.name}</p>
            <p
              className={`inline-block max-w-[90%] break-words rounded-lg px-2 py-1 text-sm ${
                m.clientId === clientId
                  ? "bg-tapri-terracotta text-tapri-cream"
                  : "bg-tapri-cream text-tapri-brown"
              }`}
            >
              {m.text}
            </p>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 border-t-2 border-tapri-brown p-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          maxLength={500}
          className="flex-1 rounded-lg bg-tapri-cream px-2 py-1.5 text-sm text-tapri-brown placeholder-tapri-brown-light/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="tapri-btn flex-shrink-0 rounded-lg bg-tapri-mustard px-3 py-1.5 text-sm font-heading font-semibold text-tapri-brown hover:bg-tapri-mustard-dark disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
