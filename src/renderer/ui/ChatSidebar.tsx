// Phase 11 chat sidebar: a collapsible right-side panel. Renders the
// conversation (with the in-progress streaming reply), an input, a cost
// readout, and a clear button. Talks to the provider via sendChat.

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Send, X, Trash2 } from "lucide-react";
import { useChat } from "../store/chat.js";
import { sendChat } from "../ai/chatRunner.js";
import "./ChatSidebar.css";

export function ChatSidebar() {
  const open = useChat((s) => s.open);
  const setOpen = useChat((s) => s.setOpen);
  const messages = useChat((s) => s.messages);
  const streaming = useChat((s) => s.streaming);
  const busy = useChat((s) => s.busy);
  const usage = useChat((s) => s.usage);
  const clear = useChat((s) => s.clear);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the latest message / streaming text.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, open]);

  if (!open) return null;

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void sendChat(text);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const totalTokens = usage.inputTokens + usage.outputTokens;

  return (
    <aside className="aim-chat" aria-label="AI chat">
      <header className="aim-chat__header">
        <span className="aim-chat__title">Chat</span>
        <span className="aim-chat__cost" title="Estimated tokens this conversation">
          {totalTokens > 0 ? `~${totalTokens} tok` : ""}
        </span>
        <button
          type="button"
          className="aim-chat__icon"
          aria-label="Clear conversation"
          title="Clear"
          onClick={clear}
        >
          <Trash2 size={16} />
        </button>
        <button
          type="button"
          className="aim-chat__icon"
          aria-label="Close chat"
          onClick={() => setOpen(false)}
        >
          <X size={16} />
        </button>
      </header>

      <div className="aim-chat__messages" ref={scrollRef}>
        {messages.length === 0 && !streaming ? (
          <p className="aim-chat__empty">
            Ask about your canvas. The assistant sees your text cards as context.
          </p>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={`aim-chat__msg aim-chat__msg--${m.role}`}>
            {m.content}
          </div>
        ))}
        {streaming !== null ? (
          <div className="aim-chat__msg aim-chat__msg--assistant aim-chat__msg--streaming">
            {streaming || "…"}
          </div>
        ) : null}
      </div>

      <div className="aim-chat__input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={busy ? "Thinking…" : "Message (Enter to send)…"}
          rows={2}
          disabled={busy}
        />
        <button
          type="button"
          className="aim-chat__send"
          aria-label="Send"
          onClick={submit}
          disabled={busy || !input.trim()}
        >
          <Send size={16} />
        </button>
      </div>
    </aside>
  );
}
