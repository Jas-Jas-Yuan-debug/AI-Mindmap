// Pure prompt builders for the Phase 10 AI commands. Each returns an AIRequest
// (system + messages). Kept pure (no stores/DOM) so they're unit-testable; the
// command runners gather the node context and pass it in.

import type { AIRequest } from "../../shared/platform.js";

const JSON_ONLY = "Respond with ONLY valid JSON, no prose, no markdown fences.";

/** 10a — summarize the given node texts into one concise paragraph. */
export function buildSummarize(texts: string[]): AIRequest {
  return {
    system:
      "You are a concise summarizer for a mind-mapping app. Given several note cards, write a single short paragraph (2-4 sentences) capturing the core idea. Plain text only.",
    messages: [
      {
        role: "user",
        content: `Summarize these ${texts.length} cards into one paragraph:\n\n${texts
          .map((t, i) => `${i + 1}. ${t}`)
          .join("\n")}`,
      },
    ],
    maxTokens: 512,
  };
}

/** 10b — expand a node into 3-5 sub-topic titles. Expects a JSON string array. */
export function buildExpand(text: string): AIRequest {
  return {
    system: `You expand a mind-map idea into 3-5 distinct sub-topics. ${JSON_ONLY} Output a JSON array of 3-5 short strings (each a sub-topic title, <= 8 words).`,
    messages: [{ role: "user", content: `Expand this idea into sub-topics:\n\n${text}` }],
    maxTokens: 512,
  };
}

/** 10d — generate a small subgraph about a prompt. Expects {nodes,edges} JSON. */
export function buildGenerate(prompt: string): AIRequest {
  return {
    system: `You generate a small mind-map (5-15 nodes) about a topic. ${JSON_ONLY} Output: {"nodes":[{"text":"..."}], "edges":[{"from":<nodeIndex>,"to":<nodeIndex>,"label":"..."}]}. Node indices are 0-based into the nodes array. Keep node text short (<= 10 words). Edges are optional but encouraged to show structure.`,
    messages: [{ role: "user", content: `Generate a mind-map about: ${prompt}` }],
    maxTokens: 2048,
  };
}

/** 10c — suggest edges between existing nodes. Expects a JSON array of pairs. */
export function buildSuggest(nodes: { id: string; text: string }[]): AIRequest {
  return {
    system: `You suggest connections between mind-map cards. ${JSON_ONLY} Given a list of cards with ids, output a JSON array of suggested links: [{"from":"<id>","to":"<id>","label":"<short relation>"}]. Only suggest links between semantically related cards. Use the EXACT ids given. Max 8 suggestions.`,
    messages: [
      {
        role: "user",
        content: `Cards:\n${nodes.map((n) => `- ${n.id}: ${n.text}`).join("\n")}`,
      },
    ],
    maxTokens: 1024,
  };
}
