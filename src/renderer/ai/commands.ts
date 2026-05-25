// Phase 10 AI command runners. Each gathers canvas context, calls the provider
// (one-shot complete), parses the structured reply, and applies the result to
// the stores inside a single useHistory.transact() so the whole AI action is
// ONE undo step. All commands are gated on a configured API key.
//
// One-shot vs streaming: these produce structured graph edits (nodes/edges),
// so a single complete() call is the right shape — "cancel mid-stream" (the
// per-sub-phase criterion) is the chat sidebar's pattern (Phase 11); here a
// command either lands atomically or is undone. Documented in plan §6.

import { useNodes, makeNodeId } from "../store/nodes.js";
import type { TextNode } from "../store/nodes.js";
import { useEdges, makeEdgeId } from "../store/edges.js";
import { useSelection } from "../store/selection.js";
import { useViewport } from "../store/viewport.js";
import { useHistory } from "../store/history.js";
import { useAiStatus } from "../store/aiStatus.js";
import { aiComplete, aiHasKey } from "./aiClient.js";
import { buildSummarize, buildExpand, buildGenerate, buildSuggest } from "./prompts.js";
import { parseExpand, parseGenerated, parseSuggestions, estimateTokens } from "./aiParse.js";
import type { AIRequest } from "../../shared/platform.js";

const CARD_W = 240;
const CARD_H = 96;

function reportError(message: string) {
  const w = window as unknown as { __aimReportFileError?: (t: string, d?: string) => void };
  if (w.__aimReportFileError) w.__aimReportFileError("AI", message);
  else console.error("AI:", message);
}

function viewportCenter(): { x: number; y: number } {
  const v = useViewport.getState();
  const w = typeof window !== "undefined" ? window.innerWidth : 1200;
  const h = typeof window !== "undefined" ? window.innerHeight : 800;
  return { x: Math.round((w / 2 - v.x) / v.zoom), y: Math.round((h / 2 - v.y) / v.zoom) };
}

function selectedTextNodes(): TextNode[] {
  const sel = useSelection.getState().ids;
  return useNodes
    .getState()
    .nodes.filter((n): n is TextNode => n.type === "text" && Boolean(sel[n.id]));
}

function reqText(req: AIRequest): string {
  return (req.system ?? "") + req.messages.map((m) => m.content).join("\n");
}

/** Confirm with a rough token-cost estimate before spending. Returns false to abort. */
function confirmCost(req: AIRequest, action: string): boolean {
  const est = estimateTokens(reqText(req));
  return window.confirm(`${action}\n\nEstimated input: ~${est} tokens. Proceed?`);
}

async function guardKey(): Promise<boolean> {
  if (await aiHasKey()) return true;
  reportError("No Anthropic API key configured. Add one in Settings to use AI features.");
  return false;
}

async function withBusy<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  useAiStatus.getState().setBusy(true, label);
  try {
    return await fn();
  } catch (err) {
    reportError(err instanceof Error ? err.message : String(err));
    return undefined;
  } finally {
    useAiStatus.getState().setBusy(false);
  }
}

function addTextNode(x: number, y: number, text: string): string {
  const id = makeNodeId();
  const node: TextNode = { id, type: "text", x, y, width: CARD_W, height: CARD_H, text };
  useNodes.getState().addNode(node);
  return id;
}

function addEdge(fromNode: string, toNode: string, label?: string) {
  useEdges.getState().addEdge({
    id: makeEdgeId(),
    fromNode,
    toNode,
    toEnd: "arrow",
    ...(label ? { label } : {}),
  });
}

/** 10a — summarize the selected cards into a new card, linked from each source. */
export async function runSummarize(): Promise<void> {
  if (!(await guardKey())) return;
  const sources = selectedTextNodes();
  if (sources.length < 1) {
    reportError("Select one or more text cards to summarize.");
    return;
  }
  const req = buildSummarize(sources.map((n) => n.text));
  if (!confirmCost(req, `Summarize ${sources.length} card(s)`)) return;
  await withBusy("Summarizing…", async () => {
    const res = await aiComplete(req);
    const text = res.text.trim();
    if (!text) return;
    // Place the summary below the centroid of the selection.
    const cx = Math.round(sources.reduce((s, n) => s + n.x, 0) / sources.length);
    const cy = Math.max(...sources.map((n) => n.y + n.height)) + 80;
    useHistory.getState().transact(() => {
      const id = addTextNode(cx, cy, text);
      for (const s of sources) addEdge(s.id, id, "summary");
      useSelection.getState().select(id);
    });
  });
}

/** 10b — expand the single selected card into 3-5 child cards. */
export async function runExpand(): Promise<void> {
  if (!(await guardKey())) return;
  const sources = selectedTextNodes();
  if (sources.length !== 1) {
    reportError("Select exactly one text card to expand.");
    return;
  }
  const parent = sources[0]!;
  const req = buildExpand(parent.text);
  if (!confirmCost(req, "Expand this card")) return;
  await withBusy("Expanding…", async () => {
    const res = await aiComplete(req);
    const topics = parseExpand(res.text);
    if (topics.length === 0) return;
    // Fan the children out to the right of the parent.
    const baseX = parent.x + parent.width + 120;
    const startY = parent.y - ((topics.length - 1) * (CARD_H + 24)) / 2;
    useHistory.getState().transact(() => {
      const ids: string[] = [];
      topics.forEach((t, i) => {
        const id = addTextNode(baseX, Math.round(startY + i * (CARD_H + 24)), t);
        addEdge(parent.id, id);
        ids.push(id);
      });
      useSelection.getState().set(ids);
    });
  });
}

/** 10d — generate a small subgraph about a prompt near the viewport center. */
export async function runGenerate(): Promise<void> {
  if (!(await guardKey())) return;
  const topic = window.prompt("Generate a mind-map about:");
  if (!topic || !topic.trim()) return;
  const req = buildGenerate(topic.trim());
  if (!confirmCost(req, `Generate a mind-map about "${topic.trim()}"`)) return;
  await withBusy("Generating…", async () => {
    const res = await aiComplete(req);
    const graph = parseGenerated(res.text);
    if (graph.nodes.length === 0) {
      reportError("The model didn't return a usable mind-map. Try rephrasing.");
      return;
    }
    const center = viewportCenter();
    // Simple grid layout around the center.
    const cols = Math.ceil(Math.sqrt(graph.nodes.length));
    useHistory.getState().transact(() => {
      const ids = graph.nodes.map((n, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = center.x + (col - cols / 2) * (CARD_W + 60);
        const y = center.y + (row - cols / 2) * (CARD_H + 60);
        return addTextNode(Math.round(x), Math.round(y), n.text);
      });
      for (const e of graph.edges) {
        const from = ids[e.from];
        const to = ids[e.to];
        if (from && to) addEdge(from, to, e.label);
      }
      useSelection.getState().set(ids);
    });
  });
}

/** 10c — suggest edges between existing cards; adds them in one undoable step. */
export async function runSuggest(): Promise<void> {
  if (!(await guardKey())) return;
  const sel = selectedTextNodes();
  const pool =
    sel.length >= 2
      ? sel
      : useNodes.getState().nodes.filter((n): n is TextNode => n.type === "text");
  if (pool.length < 2) {
    reportError("Need at least two text cards to suggest connections.");
    return;
  }
  const req = buildSuggest(pool.map((n) => ({ id: n.id, text: n.text })));
  if (!confirmCost(req, `Suggest connections among ${pool.length} card(s)`)) return;
  await withBusy("Finding connections…", async () => {
    const res = await aiComplete(req);
    const known = new Set(pool.map((n) => n.id));
    const suggestions = parseSuggestions(res.text, known);
    if (suggestions.length === 0) {
      reportError("No connections suggested.");
      return;
    }
    useHistory.getState().transact(() => {
      for (const s of suggestions) addEdge(s.from, s.to, s.label);
    });
  });
}
