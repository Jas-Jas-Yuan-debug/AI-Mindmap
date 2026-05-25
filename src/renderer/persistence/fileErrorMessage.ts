// Map a raw file-error message (the string `fileActions.reportFileError`
// forwards to `window.__aimReportFileError`) to a friendly, user-facing
// message + heading.
//
// Phase 5 (PR 3/3, sibling subagent C). Plan §6 Phase 5 exit criterion:
// "Corrupt JSON shows error, doesn't crash; partial-corrupt (valid JSON, fails
// Zod) shows specific field error."
//
// The error surfaces as a plain string because the `__aimReportFileError`
// contract (defined by sibling B in fileActions) is `(op, message) => void`.
// The two corrupt-file cases are distinguishable from that string:
//   (a) invalid JSON   → a `SyntaxError` from `JSON.parse` in the platform
//       adapter. Its message looks like "Unexpected token ... in JSON",
//       "Unexpected end of JSON input", or "... is not valid JSON".
//   (b) valid JSON but Zod-invalid → a `MigrationError` whose message embeds
//       `parseAimapFile`'s structured error, e.g.
//       "Document failed validation after migration: Invalid .aimap file:
//        nodes.0.width: Expected number, received string". We surface the
//       field path + message verbatim so the user sees the specific field.
//
// Pure module — unit-testable without a DOM.

export interface FriendlyFileError {
  /** Short dialog heading. */
  title: string;
  /** Body copy shown under the heading. */
  body: string;
  /** Optional monospace detail (the specific Zod field path + message). */
  detail?: string;
}

/** Heuristic: does this message come from a JSON.parse SyntaxError? */
function isJsonSyntaxError(message: string): boolean {
  return (
    /Unexpected token/i.test(message) ||
    /Unexpected end of JSON/i.test(message) ||
    /is not valid JSON/i.test(message) ||
    /JSON\.parse/i.test(message) ||
    /in JSON at position/i.test(message)
  );
}

/**
 * Extract the human part of a validation error message, stripping the
 * `MigrationError` / "Invalid .aimap file:" envelopes so the dialog shows just
 * the field path + reason (e.g. "nodes.0.width: Expected number, received
 * string").
 */
function extractValidationDetail(message: string): string {
  let detail = message;
  // Strip the migration envelope if present.
  const migMatch = detail.match(/failed validation after migration:\s*(.*)$/is);
  if (migMatch && migMatch[1]) detail = migMatch[1].trim();
  // Strip the "Invalid .aimap file:" prefix that parseAimapFile adds.
  detail = detail.replace(/^Invalid \.aimap file:\s*/i, "").trim();
  return detail;
}

/**
 * Turn a raw error message into a friendly dialog payload. `op` is "open" or
 * "save" — open errors are almost always corrupt-file cases; save errors are
 * rarer (disk / refused-invalid) and get a generic-but-honest message.
 */
export function friendlyFileError(
  op: "open" | "save",
  message: string,
): FriendlyFileError {
  if (op === "open") {
    if (isJsonSyntaxError(message)) {
      return {
        title: "Can't open file",
        body: "This file isn't a valid .aimap file.",
      };
    }
    // Anything else on open is a validation / migration failure: show the
    // specific field path + message so the user can see what's wrong.
    const detail = extractValidationDetail(message);
    return {
      title: "Can't open file",
      body: "This .aimap file has a problem and couldn't be loaded.",
      detail: detail || message,
    };
  }

  // Save errors.
  return {
    title: "Can't save file",
    body: "The document couldn't be saved.",
    detail: message,
  };
}
