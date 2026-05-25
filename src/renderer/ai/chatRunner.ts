// Phase 11 chat send logic: builds canvas context, streams the assistant
// reply via the provider, and updates the chat store as deltas arrive.
//
// Context injection (V1): the contents of all text cards are summarized into
// the system prompt (truncated to a char budget). Explicit `@`-mention of
// specific nodes is a documented follow-up — V1 always passes the whole canvas
// as context, which is simpler and good enough for small/medium boards.

import { useChat } from "../store/chat.js";
import { useNodes } from "../store/nodes.js";
import { aiHasKey, aiStream } from "./aiClient.js";
import { estimateTokens } from "./aiParse.js";
import type { AIRequest } from "../../shared/platform.js";

const CONTEXT_CHAR_BUDGET = 6000;

function canvasContext(): string {
  const texts: string[] = [];
  let used = 0;
  for (const n of useNodes.getState().nodes) {
    if (n.type !== "text") continue;
    const line = `- ${n.text.replace(/\s+/g, " ").slice(0, 200)}`;
    if (used + line.length > CONTEXT_CHAR_BUDGET) break;
    texts.push(line);
    used += line.length;
  }
  return texts.join("\n");
}

function reportError(message: string) {
  const w = window as unknown as { __aimReportFileError?: (t: string, d?: string) => void };
  if (w.__aimReportFileError) w.__aimReportFileError("AI chat", message);
  else console.error("AI chat:", message);
}

/** Send a user message and stream the assistant reply into the chat store. */
export async function sendChat(text: string): Promise<void> {
  const content = text.trim();
  if (!content) return;
  const chat = useChat.getState();
  if (chat.busy) return;

  if (!(await aiHasKey())) {
    reportError("No Anthropic API key configured. Add one in Settings to chat.");
    return;
  }

  chat.addMessage({ role: "user", content });
  chat.setBusy(true);
  chat.setStreaming("");

  const ctx = canvasContext();
  const req: AIRequest = {
    system:
      "You are an assistant inside an infinite-canvas mind-mapping app. Help the user think about and organize the cards on their canvas. Be concise.\n\n" +
      (ctx ? `The canvas currently contains these cards:\n${ctx}` : "The canvas is currently empty."),
    messages: useChat
      .getState()
      .messages.map((m) => ({ role: m.role, content: m.content })),
    maxTokens: 2048,
  };

  let acc = "";
  try {
    for await (const chunk of aiStream(req)) {
      if (chunk.delta) {
        acc += chunk.delta;
        useChat.getState().setStreaming(acc);
      }
      if (chunk.done) break;
    }
    if (acc.trim()) {
      useChat.getState().addMessage({ role: "assistant", content: acc.trim() });
      // The stream API doesn't return usage; estimate for the cost display.
      useChat.getState().addUsage({
        inputTokens: estimateTokens((req.system ?? "") + content),
        outputTokens: estimateTokens(acc),
      });
    }
  } catch (err) {
    reportError(err instanceof Error ? err.message : String(err));
  } finally {
    useChat.getState().setStreaming(null);
    useChat.getState().setBusy(false);
  }
}
