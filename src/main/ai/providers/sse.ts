// sse.ts — parse a streaming fetch Response as Server-Sent Events.
//
// Buffers raw bytes across chunk boundaries, splits on newlines, and yields
// the payload string for every "data: <payload>" line. Stops on "[DONE]"
// (the OpenAI-style stream sentinel) or when the body is exhausted.
//
// Only used inside the main process — the renderer never sees a raw Response.

/**
 * Async generator that yields SSE data payloads from a fetch Response.
 *
 * - Skips blank lines and comment lines (starting with ":").
 * - Stops when a payload equals "[DONE]" (OpenAI-style sentinel) or the
 *   body stream ends.
 * - Uses res.body!.getReader() + TextDecoder for zero-copy, streaming
 *   processing compatible with both Electron/Node 18+ and browser targets.
 */
export async function* sseData(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode the chunk (keepalive=true preserves incomplete sequences).
      buffer += decoder.decode(value, { stream: true });

      // Process every complete line (split on \n; keep the tail that has no \n yet).
      const lines = buffer.split("\n");
      // The last element is the incomplete tail — keep it for next iteration.
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trimEnd(); // tolerate \r\n too
        if (!trimmed || trimmed.startsWith(":")) continue; // blank / comment

        if (trimmed.startsWith("data: ")) {
          const payload = trimmed.slice(6); // substring after "data: "
          if (payload === "[DONE]") return;
          yield payload;
        }
        // Other field types (event:, id:, retry:) are intentionally ignored.
      }
    }

    // Flush any partial line that had no trailing newline.
    if (buffer) {
      const trimmed = buffer.trimEnd();
      if (trimmed.startsWith("data: ")) {
        const payload = trimmed.slice(6);
        if (payload !== "[DONE]") yield payload;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
