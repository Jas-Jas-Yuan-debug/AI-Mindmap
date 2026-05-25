// Pure parsers for AI command output. Models sometimes wrap JSON in prose or
// ```json fences despite instructions, so these are defensive: extract the
// first JSON value, validate shape, and fall back gracefully. Unit-tested.

/** Pull the first balanced JSON array/object substring out of a model reply. */
export function extractJson(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  // Try a direct parse first.
  try {
    return JSON.parse(text);
  } catch {
    // Find the first [...] or {...} block.
    const start = text.search(/[[{]/);
    if (start === -1) return null;
    const open = text[start];
    const close = open === "[" ? "]" : "}";
    const end = text.lastIndexOf(close);
    if (end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/** 10b — parse an expand reply into 3-5 sub-topic strings. */
export function parseExpand(raw: string): string[] {
  const json = extractJson(raw);
  if (Array.isArray(json)) {
    return json.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 6);
  }
  // Fallback: split lines / bullets.
  return raw
    .split("\n")
    .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((l) => l.length > 0)
    .slice(0, 6);
}

export interface GeneratedGraph {
  nodes: { text: string }[];
  edges: { from: number; to: number; label?: string }[];
}

/** 10d — parse a generated subgraph. Drops malformed nodes/edges. */
export function parseGenerated(raw: string): GeneratedGraph {
  const json = extractJson(raw);
  const out: GeneratedGraph = { nodes: [], edges: [] };
  if (!json || typeof json !== "object") return out;
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj.nodes)) {
    for (const n of obj.nodes) {
      if (n && typeof n === "object" && typeof (n as { text?: unknown }).text === "string") {
        out.nodes.push({ text: (n as { text: string }).text });
      }
    }
  }
  if (Array.isArray(obj.edges)) {
    for (const e of obj.edges) {
      if (e && typeof e === "object") {
        const from = (e as { from?: unknown }).from;
        const to = (e as { to?: unknown }).to;
        if (
          typeof from === "number" &&
          typeof to === "number" &&
          from >= 0 &&
          to >= 0 &&
          from < out.nodes.length &&
          to < out.nodes.length &&
          from !== to
        ) {
          const label = (e as { label?: unknown }).label;
          out.edges.push({ from, to, ...(typeof label === "string" ? { label } : {}) });
        }
      }
    }
  }
  return out;
}

export interface Suggestion {
  from: string;
  to: string;
  label?: string;
}

/** 10c — parse suggested connections, keeping only ones referencing known ids. */
export function parseSuggestions(raw: string, knownIds: Set<string>): Suggestion[] {
  const json = extractJson(raw);
  if (!Array.isArray(json)) return [];
  const out: Suggestion[] = [];
  for (const s of json) {
    if (s && typeof s === "object") {
      const from = (s as { from?: unknown }).from;
      const to = (s as { to?: unknown }).to;
      if (
        typeof from === "string" &&
        typeof to === "string" &&
        from !== to &&
        knownIds.has(from) &&
        knownIds.has(to)
      ) {
        const label = (s as { label?: unknown }).label;
        out.push({ from, to, ...(typeof label === "string" ? { label } : {}) });
      }
    }
  }
  return out.slice(0, 8);
}

/** Rough token estimate (~4 chars/token) for the pre-execution cost hint. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
