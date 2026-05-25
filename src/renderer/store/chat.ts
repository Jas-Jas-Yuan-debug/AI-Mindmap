// Chat sidebar state (Phase 11). Conversation persists across restart via
// localStorage, keyed by the current document (path/name; "untitled" fallback).
//
// Persistence decision (plan §6 Phase 11): chat is stored in localStorage, NOT
// inside the `.aimap` file. Rationale: keeps the document file clean and
// portable (matches §5's "app-internal state lives outside the file"), and
// avoids coupling the persistence/serialize path to chat. The `.aimap` schema
// still reserves `chats?` for a future move if we want chat to travel with the
// file.

import { create } from "zustand";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatState {
  open: boolean;
  messages: ChatMessage[];
  /** Streaming-in-progress assistant text (not yet committed to `messages`). */
  streaming: string | null;
  busy: boolean;
  usage: ChatUsage;
  docKey: string;

  toggle(): void;
  setOpen(open: boolean): void;
  addMessage(m: ChatMessage): void;
  setStreaming(text: string | null): void;
  setBusy(busy: boolean): void;
  addUsage(u: Partial<ChatUsage>): void;
  /** Switch to a document's thread, loading it from localStorage. */
  loadFor(docKey: string): void;
  clear(): void;
}

const STORE_PREFIX = "aim.chat.";

interface Persisted {
  messages: ChatMessage[];
  usage: ChatUsage;
}

function load(docKey: string): Persisted {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + docKey);
    if (!raw) return { messages: [], usage: { inputTokens: 0, outputTokens: 0 } };
    const p = JSON.parse(raw) as Persisted;
    return {
      messages: Array.isArray(p.messages) ? p.messages : [],
      usage: p.usage ?? { inputTokens: 0, outputTokens: 0 },
    };
  } catch {
    return { messages: [], usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

function save(docKey: string, data: Persisted): void {
  try {
    localStorage.setItem(STORE_PREFIX + docKey, JSON.stringify(data));
  } catch {
    // storage full / unavailable — non-fatal
  }
}

export const useChat = create<ChatState>((set, get) => ({
  open: false,
  messages: [],
  streaming: null,
  busy: false,
  usage: { inputTokens: 0, outputTokens: 0 },
  docKey: "untitled",

  toggle: () => set((s) => ({ open: !s.open })),
  setOpen: (open) => set({ open }),
  addMessage: (m) => {
    set((s) => ({ messages: [...s.messages, m] }));
    const { docKey, messages, usage } = get();
    save(docKey, { messages, usage });
  },
  setStreaming: (text) => set({ streaming: text }),
  setBusy: (busy) => set({ busy }),
  addUsage: (u) => {
    set((s) => ({
      usage: {
        inputTokens: s.usage.inputTokens + (u.inputTokens ?? 0),
        outputTokens: s.usage.outputTokens + (u.outputTokens ?? 0),
      },
    }));
    const { docKey, messages, usage } = get();
    save(docKey, { messages, usage });
  },
  loadFor: (docKey) => {
    const { messages, usage } = load(docKey);
    set({ docKey, messages, usage, streaming: null });
  },
  clear: () => {
    const empty = { messages: [], usage: { inputTokens: 0, outputTokens: 0 } };
    set(empty);
    save(get().docKey, empty);
  },
}));
