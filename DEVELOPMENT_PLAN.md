# AI-Mindmap — Development Plan

> **Mandatory reading for both AI agents at the start of every session.**
> If this plan and `CLAUDE.md` conflict on workflow, `CLAUDE.md` wins. If they conflict on product or architecture, this plan wins.
> Update this file (via a PR) whenever a phase ships, a decision changes, or scope shifts. Don't let it rot.

---

## 1. Product vision

**AI-Mindmap is an AI-augmented infinite whiteboard, modeled on Obsidian Canvas.**

Users place **cards** (text/markdown, images, files, links) on an **infinite 2D canvas**, connect them with **labeled arrows**, and organize them with **group containers**. AI features (summarize, expand, suggest connections, generate nodes from prompts, chat-with-canvas) are layered on **after** the core whiteboard is fully usable as a standalone, AI-free tool.

### Why this order
1. A whiteboard with no AI is still useful. AI on top of a broken whiteboard is useless.
2. The whiteboard interactions (drag, multi-select, undo, persistence, file format) are the hard, slow part — get them right before adding LLM complexity.
3. AI features depend on a stable file format and node model. Defining those without a working canvas leads to retrofitting.

### What we are NOT building (V1)
- Mobile or web versions (Electron desktop only)
- Real-time multi-user collaboration
- Plugin / extension system
- Custom theme engine beyond dark/light
- A built-in markdown editor outside of card content (no separate notes pane)
- Hand-drawn freeform strokes (this is a node-and-edge whiteboard, not Excalidraw)

---

## 2. Non-negotiable principles

1. **Whiteboard works fully without AI.** AI is additive. If you remove the AI module, the app must still launch and let the user build a mindmap.
2. **Phase-gated.** Don't start Phase N+1 until every exit criterion in Phase N passes. Skipping ahead creates dependency chains that break later.
3. **Two-agent collaboration through PRs only.** See `CLAUDE.md`. No agent unilaterally rewrites another's recently-merged work without a PR that explains why.
4. **Security defaults stay strict.** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, strict CSP. Any relaxation requires a dedicated PR that calls it out in the title and body.
5. **No secrets in renderer.** API keys live in the OS keychain (via main process); the renderer asks main to make AI calls, never holds keys.
6. **Local-first.** Files live on the user's disk. No mandatory cloud, no telemetry, no account.
7. **Types as contracts.** TypeScript strict mode. Shared types between main/preload/renderer live in `src/shared/`.

---

## 3. Tech stack (locked decisions)

| Layer | Choice | Why |
|---|---|---|
| Shell | **Electron** (already in repo, currently v33, bumping to v42) | Desktop, file system access, established |
| Language | **TypeScript (strict)** | Two async agents need types as a contract; catches drift |
| Renderer framework | **React 18** | Interaction-heavy UI (drag, multi-select, undo, nested groups, modals); huge ecosystem |
| Bundler / dev server | **Vite** | Fast HMR for renderer; good TS + React story |
| State management | **Zustand** | Tiny API, no boilerplate, plays well with undo middleware; Redux is overkill |
| Canvas surface | **Konva.js + react-konva** | Mature 2D scene graph; handles thousands of nodes; built-in hit testing, drag, transforms |
| Markdown rendering | **react-markdown** + **remark-gfm** | Standard, safe (no `dangerouslySetInnerHTML`) |
| Persistence format | **JSON files** (`.aimap.json`) | Human-diffable, future-proof, easy to migrate |
| File I/O | **Electron `fs/promises`** via IPC | Renderer never touches `fs` directly |
| Keychain (for AI keys) | **keytar** | Cross-platform OS keychain |
| AI SDK (first provider) | **@anthropic-ai/sdk** | Project is Anthropic-built; can add others later behind the provider interface |
| Unit tests | **Vitest** | Native TS, fast, Vite-aligned |
| E2E tests | **Playwright for Electron** | Drives the real app, including IPC |
| Lint / format | **ESLint** + **Prettier** | Standard; config committed |
| Packaging | **electron-builder** | Cross-platform installers |

### Locked decisions that need active enforcement
- **No `dangerouslySetInnerHTML`** anywhere. Markdown goes through `react-markdown`.
- **No `eval`, no `new Function`.** CSP would block it anyway, but don't write it.
- **No `require('electron')` in the renderer.** Use the preload `contextBridge` `api` only.
- **All IPC channels typed.** Shared types in `src/shared/ipc.ts`.

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ Electron Main Process (Node.js)                                      │
│  - App lifecycle, BrowserWindow                                      │
│  - File I/O (open/save .aimap.json, image imports)                   │
│  - AI provider calls (keys from keychain, never sent to renderer)    │
│  - Recent files, app settings (electron-store)                       │
│  - Auto-update (later)                                               │
└──────────────────────────────────────────────────────────────────────┘
                            ▲
                            │ IPC (typed channels, src/shared/ipc.ts)
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Preload (sandboxed, contextBridge)                                   │
│  - Exposes window.api: { files, ai, settings } — typed wrappers      │
│  - No direct Node API leakage                                        │
└──────────────────────────────────────────────────────────────────────┘
                            ▲
                            │ window.api.*
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Renderer (React + Konva, sandboxed)                                  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ React UI layer (HTML/CSS)                                      │  │
│  │  - Top bar, menus, toolbars, dialogs, sidebars, context menus │  │
│  │  - Floating overlays positioned over the canvas               │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Konva canvas (whole viewport)                                  │  │
│  │  - Stage, Layer, Node shapes (Rect/Image/Text), Edge lines    │  │
│  │  - Pan/zoom transform, hit testing, drag                      │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Zustand store (single source of truth)                         │  │
│  │  - { nodes, edges, viewport, selection, history }              │  │
│  │  - All mutations go through actions; actions push to history   │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Directory layout (target — Phase 0 establishes this)

```
AI-Mindmap/
├── package.json
├── tsconfig.json
├── tsconfig.main.json          # main process compile config
├── vite.config.ts              # renderer dev/build
├── electron-builder.yml        # packaging (added in later phase)
├── .eslintrc.cjs
├── .prettierrc
├── src/
│   ├── main/                   # Electron main process (TS, compiled to dist-main/)
│   │   ├── main.ts             # app lifecycle, window creation
│   │   ├── preload.ts          # contextBridge
│   │   ├── ipc/                # IPC handlers, one file per channel group
│   │   │   ├── files.ts
│   │   │   ├── ai.ts
│   │   │   └── settings.ts
│   │   └── ai/
│   │       ├── provider.ts     # interface
│   │       └── anthropic.ts    # impl
│   ├── renderer/               # React app (TS, bundled by Vite)
│   │   ├── index.html
│   │   ├── main.tsx            # entrypoint
│   │   ├── App.tsx
│   │   ├── canvas/             # Konva-based whiteboard
│   │   │   ├── Canvas.tsx
│   │   │   ├── nodes/          # one file per node type
│   │   │   ├── edges/
│   │   │   ├── interactions/   # pan, zoom, select, drag, lasso
│   │   │   └── layout.ts
│   │   ├── ui/                 # React UI overlays (menus, toolbars, dialogs)
│   │   ├── store/              # Zustand slices
│   │   │   ├── nodes.ts
│   │   │   ├── edges.ts
│   │   │   ├── viewport.ts
│   │   │   ├── selection.ts
│   │   │   └── history.ts      # undo/redo
│   │   └── styles/
│   └── shared/                 # used by both main and renderer
│       ├── ipc.ts              # IPC channel names + payload types
│       ├── fileFormat.ts       # .aimap.json schema + Zod validators
│       └── types.ts            # Node, Edge, Viewport types
├── tests/
│   ├── unit/
│   └── e2e/
└── assets/
```

---

## 5. File format (`.aimap.json`)

Locked schema for V1. Migrations handled by `version` field. Validated with **Zod** in `src/shared/fileFormat.ts`.

```ts
type Aimap = {
  version: 1;
  meta: {
    createdAt: string;        // ISO timestamp
    updatedAt: string;
    app: { name: "AI-Mindmap"; version: string };  // app version, semver
  };
  viewport: {
    x: number;                // canvas-space pan offset
    y: number;
    zoom: number;             // 0.1 .. 4.0
  };
  nodes: Node[];
  edges: Edge[];
};

type NodeBase = {
  id: string;                 // uuid v4
  x: number;                  // top-left in canvas space
  y: number;
  w: number;
  h: number;
  color?: string;             // hex like "#5b8def", optional palette index later
  parentId?: string;          // id of containing GroupNode, if any
};

type TextNode  = NodeBase & { type: "text";  text: string };           // markdown
type FileNode  = NodeBase & { type: "file";  path: string; name: string };
type ImageNode = NodeBase & { type: "image"; path: string; alt?: string };
type LinkNode  = NodeBase & { type: "link";  url: string; title?: string; favicon?: string };
type GroupNode = NodeBase & { type: "group"; label?: string };

type Node = TextNode | FileNode | ImageNode | LinkNode | GroupNode;

type Edge = {
  id: string;
  from: { node: string; side: "top" | "right" | "bottom" | "left" };
  to:   { node: string; side: "top" | "right" | "bottom" | "left" };
  label?: string;
  color?: string;
  arrow?: "none" | "end" | "both"; // default "end"
};
```

### Format rules
- Unknown fields are **preserved** on load and re-saved (forward compat).
- `version` mismatch newer-than-known: refuse to open, show clear error.
- `version` older-than-known: run migration in `src/shared/migrations/`.
- File paths in `FileNode` / `ImageNode` are stored **relative to the `.aimap.json` file** when possible, absolute otherwise. Migration writes them as relative.

---

## 6. Phases

Each phase has: **scope**, **deliverables**, **exit criteria**, **estimated PR count**. PRs within a phase can ship independently; the phase is "done" only when all exit criteria pass.

### Phase 0 — Toolchain & scaffolding upgrade
**Goal:** turn the vanilla-JS Electron scaffold into a TypeScript + React + Vite + Konva foundation **without losing what's already there**.

**Deliverables**
- Add TS config (`tsconfig.json`, separate `tsconfig.main.json` for main process).
- Add Vite for renderer bundling; dev mode runs `vite` and Electron loads from `http://localhost:5173`; prod loads from built `dist-renderer/index.html`.
- Convert `main.js` → `main.ts`, `preload.js` → `preload.ts`. Keep existing security config exactly.
- Add React, Konva, Zustand, Zod, react-markdown, remark-gfm to deps.
- Add ESLint + Prettier configs, wire `npm run lint` and `npm run format`.
- Add Vitest + Playwright skeletons; one smoke test each.
- Replace the demo "Root" rect drawing in `renderer.js` with a minimal React app that mounts a Konva `Stage` showing the same Root rect (parity check).
- Update `package.json` scripts: `dev`, `build`, `start` (runs built app), `lint`, `format`, `test`, `test:e2e`, `typecheck`.
- Bump Electron to v42 (already in flight on `claude-jjy/bump-electron-42` — coordinate, do not duplicate).

**Exit criteria**
- [ ] `npm run dev` opens the app with the React+Konva root rect rendered
- [ ] `npm run build && npm start` opens the packaged-style app, same rendering
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run lint` passes
- [ ] One Vitest unit test runs and passes
- [ ] One Playwright e2e test launches the app and asserts the window title
- [ ] CSP unchanged (still strict); preload contextBridge still in place
- [ ] CLAUDE.md "Tech stack" section updated to reflect TS/React/Vite/Konva

**Estimated PRs:** 3–5 (one for TS+Vite, one for React mount + Konva parity, one for lint/format, one for test infra, one for the Electron bump if not already merged)

---

### Phase 1 — Infinite canvas surface
**Goal:** pannable, zoomable infinite canvas with grid. No nodes yet beyond a debug marker at origin.

**Deliverables**
- `Canvas.tsx` component: Konva `Stage` filling viewport, responsive resize.
- Pan: mouse drag on empty space, touchpad two-finger scroll, spacebar+drag.
- Zoom: wheel (centered on cursor), pinch (touchpad), `Cmd/Ctrl + =/-`, `Cmd/Ctrl + 0` reset.
- Grid overlay: dotted grid, scales with zoom, toggleable via View menu.
- Origin indicator: small crosshair at (0,0) for debugging (hideable in settings).
- Viewport state in Zustand `viewport` slice: `{ x, y, zoom }`.
- Status bar (bottom-right): current zoom %, cursor canvas coords.
- "Fit to content" command (no-op until Phase 2 lands nodes).

**Exit criteria**
- [ ] Pan/zoom feels smooth at 60fps on a 2019 MacBook
- [ ] Zoom range clamped 0.1×–4.0×; can't pan into invalid state
- [ ] Grid renders correctly at all zoom levels (no Moiré, scales with zoom)
- [ ] Viewport state survives reload-from-file (saved in `.aimap.json`)
- [ ] Unit tests cover viewport math (screen↔canvas coord conversion)

**Estimated PRs:** 2–3

---

### Phase 2 — Text/markdown cards (the foundational node type)
**Goal:** create, move, resize, edit, and delete text cards. This is the single most important phase — everything else builds on the node model.

**Deliverables**
- `TextNode` shape: rounded rect, title-less, markdown body.
- Create: double-click empty canvas → new card at cursor, focused into edit mode.
- Move: drag card body.
- Resize: 8 handles (corners + edges), min size enforced.
- Edit: double-click card → enter edit mode (HTML `<textarea>` overlay positioned over the Konva node), Esc / click outside to commit.
- Render: markdown via `react-markdown` in an HTML overlay; Konva draws only the card background/border.
- Delete: `Delete` / `Backspace` with card selected.
- Selection: click selects, click empty deselects.
- Single-card color: right-click → color picker (8-color palette).
- Zustand `nodes` slice with `addNode`, `updateNode`, `deleteNode`, `moveNode`, `resizeNode` actions.

**Exit criteria**
- [ ] Create 100 cards, no visible lag during pan/zoom
- [ ] Edit-mode textarea always aligns with the Konva node (zoom + pan synced)
- [ ] Markdown renders: headers, lists, bold/italic, code blocks, links, inline images via URL
- [ ] Round-trip save/load preserves every text card field
- [ ] Unit tests for node store actions
- [ ] E2E test: create card, edit it, save file, reload, content preserved

**Estimated PRs:** 4–6

---

### Phase 3 — Edges (connections between cards)
**Goal:** draw labeled arrows between cards.

**Deliverables**
- Card edge anchors: 4 small dots (top/right/bottom/left) visible on hover or when card is selected.
- Drag from anchor → either to another card's anchor (snaps) or to empty space (cancels).
- Edge shape: Bezier curve between anchors, default `arrow: "end"`.
- Edges follow when either endpoint card moves/resizes.
- Edge selection: click an edge → selected; `Delete` removes it.
- Edge label: double-click edge → inline text input → commits on Esc/click-outside.
- Edge color: right-click → palette.
- Zustand `edges` slice; mutations bound to history.

**Exit criteria**
- [ ] 100 cards × 200 edges renders at 60fps during pan/zoom
- [ ] Edges never visually disconnect from their anchors during card move/resize/zoom
- [ ] Save/load preserves edges with labels, colors, arrow style
- [ ] Deleting a card also deletes its connected edges (in one undoable step)
- [ ] Unit tests for edge anchor geometry

**Estimated PRs:** 3–4

---

### Phase 4 — Multi-select, clipboard, undo/redo
**Goal:** the bulk-edit operations users expect from any modern editor.

**Deliverables**
- **Multi-select:** lasso (drag on empty canvas), Shift+click toggle, `Cmd/Ctrl + A` select all.
- **Move:** drag any selected node → all selected nodes move together.
- **Clipboard (in-app):** `Cmd/Ctrl + C / X / V`. Copies node + edge subset to internal JSON clipboard; paste creates new IDs, offsets by cursor.
- **Undo/redo stack:** Zustand middleware that records actions. `Cmd/Ctrl + Z` / `Cmd/Ctrl + Shift + Z`. Stack capped at 200 entries.
- **Grouping into a transaction:** moving 50 selected nodes is 1 undo step, not 50.
- **Align/distribute** (bonus, ship if time permits): align left/center/right/top/middle/bottom, distribute horizontally/vertically.

**Exit criteria**
- [ ] Lasso select correctly hit-tests at any zoom level
- [ ] Undo/redo is correct after every action type (move, resize, edit, color, edge add/delete, paste)
- [ ] Cut+paste of a subgraph preserves internal edges with remapped IDs
- [ ] Memory: undo stack capped, no leaks (verified with DevTools heap snapshot)

**Estimated PRs:** 4–5

---

### Phase 5 — Persistence (file format, save/load, autosave)
**Goal:** the app is now actually a document editor.

**Deliverables**
- File menu: New, Open, Save, Save As, Recent Files.
- IPC channels: `files:open`, `files:save`, `files:saveAs`, `files:recent`.
- Open dialog filtered to `.aimap.json`.
- Save validates the document against Zod schema before writing.
- Autosave to the currently-open file after every committed action, debounced 1s.
- Dirty indicator in title bar (`AI-Mindmap — Untitled •` when unsaved).
- "Unsaved changes" prompt when closing a dirty window.
- Recent files list in File menu (last 10), stored via `electron-store`.
- Migration framework in `src/shared/migrations/` (empty for V1, scaffolded for future).
- Error handling: corrupt file → friendly error dialog, doesn't crash.

**Exit criteria**
- [ ] Round-trip: build a 50-node canvas, save, reopen, every field byte-identical (modulo timestamps)
- [ ] Autosave debounce works (rapid edits don't hammer disk)
- [ ] Corrupt JSON shows error, doesn't crash; partial-corrupt (valid JSON, fails Zod) shows specific field error
- [ ] Recent files survive app restart

**Estimated PRs:** 3–4

---

### Phase 6 — Groups / containers
**Goal:** Obsidian Canvas-style group boxes that contain other nodes.

**Deliverables**
- `GroupNode` type: titled rectangle, larger min size.
- Drag a node onto a group → `parentId` set, node moves with group.
- Drag a node out of a group → `parentId` cleared.
- Drag a group → all children move together.
- Resize a group → children NOT resized, but children outside new bounds get `parentId` cleared.
- Color, label, collapsible (collapsed = children hidden, group shows child count).
- Z-order: groups always render behind their children.

**Exit criteria**
- [ ] Nested groups work (group inside a group)
- [ ] Cycle prevention: can't make A child of B if B is descendant of A
- [ ] Save/load preserves group hierarchy
- [ ] Undo/redo works for re-parenting

**Estimated PRs:** 2–3

---

### Phase 7 — Embeds (images, files, links)
**Goal:** the canvas isn't just text.

**Deliverables**
- **Image node:** drag image from OS into canvas → copied into `<file>.aimap.assets/` next to the document, `ImageNode` created. Konva renders the bitmap, with image cache.
- **File node:** drag any file → `FileNode` with icon + filename, double-click opens in OS default app via `shell.openPath`.
- **Link node:** paste URL into empty canvas → `LinkNode`; main process fetches metadata (title, favicon) via a sandboxed `fetch` call. If fetch fails, show URL only.
- Image paste from clipboard supported.
- Image resize maintains aspect ratio by default (Shift to override).

**Exit criteria**
- [ ] Drag-drop of 10MB PNG works smoothly
- [ ] Link metadata fetch has a 5s timeout and never blocks the UI
- [ ] Asset files referenced by deleted ImageNodes are NOT auto-deleted (user explicit only — avoid data loss surprises)
- [ ] Renaming the document folder breaks no references (paths stored relative)

**Estimated PRs:** 3–4

---

### Phase 8 — Polish
**Goal:** ship-quality whiteboard.

**Deliverables**
- **Search:** `Cmd/Ctrl + F` → search bar, filters node visibility / highlights matches, jumps viewport to match.
- **Keyboard shortcuts cheat sheet** (`?` opens overlay).
- **Settings dialog:** theme, autosave interval, default colors, AI provider (placeholder, populated in Phase 9).
- **Dark/light theme** (system-following by default).
- **Native app menu** (File / Edit / View / Window / Help).
- **Error boundaries** around the canvas (one crashed node doesn't take down the app).
- **Telemetry: NONE.** Document this in CLAUDE.md.
- **About dialog** with version, repo URL, license.

**Exit criteria**
- [ ] Every action has a keyboard shortcut documented in the cheat sheet
- [ ] Theme toggle is instant, no flash
- [ ] Settings persist
- [ ] No console errors during normal use

**Estimated PRs:** 4–6

---

### 🎉 Whiteboard Milestone — End of Phase 8

**At this point the app is a fully functional Obsidian-Canvas-style whiteboard with no AI features.** It should be usable as a daily driver for visual thinking. Tag the repo `v0.1.0-whiteboard` here.

The remaining phases add AI on top of a stable foundation.

---

### Phase 9 — AI provider abstraction
**Goal:** infrastructure for AI features, with no user-facing AI yet.

**Deliverables**
- `src/main/ai/provider.ts` — `AIProvider` interface: `complete()`, `stream()`, `embed()`.
- `src/main/ai/anthropic.ts` — implementation using `@anthropic-ai/sdk` with **prompt caching**.
- Settings UI: AI provider selector (Anthropic only for now), API key entry. Key stored in OS keychain via **keytar**, never in renderer.
- IPC channels: `ai:complete`, `ai:stream` (streaming over IPC chunks), `ai:embed`.
- Renderer-side `aiClient` wrapper with typed methods.
- Token / cost tracking: per-call stats logged, viewable in settings.
- Rate limit handling, exponential backoff.
- Mock provider for tests (no real API calls in CI).

**Exit criteria**
- [ ] Sending a hello-world prompt from the renderer returns a streamed response
- [ ] API key never appears in renderer process (verify with DevTools)
- [ ] No-API-key state shows a clear "configure in Settings" message in any AI UI
- [ ] Mock provider used in all tests; CI doesn't hit Anthropic
- [ ] Errors (rate limit, network, invalid key) surface with actionable messages

**Estimated PRs:** 2–3

---

### Phase 10 — AI features
Each sub-phase is independently shippable.

**10a — Summarize selection** → select N nodes, AI command "Summarize" produces a new `TextNode` with the summary, edges from source nodes to summary node.

**10b — Expand node** → select a `TextNode`, AI command "Expand" produces 3–5 child `TextNode`s exploring sub-topics, edges from parent to children.

**10c — Suggest connections** → AI scans all nodes (or selection), proposes edges between semantically related nodes; user accepts/rejects each via a dialog.

**10d — Generate from prompt** → command palette → "Generate mindmap about X" → AI generates a small subgraph (5–15 nodes + edges) placed near viewport center.

**Exit criteria (per sub-phase)**
- [ ] Operation can be undone in one step
- [ ] Cost shown before executing (estimated tokens)
- [ ] Cancellable mid-stream
- [ ] No AI feature crashes the app if the API call fails

**Estimated PRs:** 4–6 across 10a–10d

---

### Phase 11 — Chat sidebar
**Goal:** conversational interface tied to canvas context.

**Deliverables**
- Collapsible right-side panel with chat UI.
- Conversation state per-document (saved in `.aimap.json` under `meta.chats`? — decide via PR).
- User message can `@`-mention nodes by name; mentioned nodes' content passed as context.
- AI responses can include "actions" (e.g. create node, link nodes) the user approves with one click.
- Streaming response rendering.
- Cost per conversation displayed.

**Exit criteria**
- [ ] Conversation persists across app restart
- [ ] Action approval is explicit (no auto-apply)
- [ ] Mentioned context fits within model context window (truncate gracefully)

**Estimated PRs:** 3–4

---

### Phase 12 (stretch — explicitly out of scope for V1)
- Real-time collaboration (CRDT, WebRTC, sync server)
- Plugin API
- Mobile companion app
- Cloud sync
- Vector database for semantic search across many documents

If we get here, open a new planning doc — don't try to retrofit into this one.

---

## 7. Per-PR definition of done

Every PR must satisfy these before self-merge:
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Tests for new logic added; existing tests still pass (`npm test`)
- [ ] Manual smoke test: launched the app, exercised the new feature path, and the prior phase's golden path
- [ ] `DEVELOPMENT_PLAN.md` updated if scope/decisions/phase exit criteria changed
- [ ] `CLAUDE.md` updated if conventions / workflow changed
- [ ] PR description follows the `CLAUDE.md` template (what changed, why, how tested, follow-ups)
- [ ] Branch rebased on current `origin/main`

## 8. Phase-exit ceremony

When all of a phase's exit criteria pass:
1. Open a single tracking PR titled `Phase N complete — <name>`.
2. PR body: checklist showing every exit criterion ✅, links to the PRs that landed them.
3. Update this file: mark the phase as 🟢 done with the date.
4. Tag the commit `v0.<N>.0` after merge (e.g. `v0.1.0-whiteboard` after Phase 8).
5. Next session, begin Phase N+1.

## 9. Coordination notes for the two agents

- **Don't start the same phase in parallel.** If you see a PR or branch named `claude/phase-N-*` or `claude-jjy/phase-N-*`, the other agent is on it — coordinate via PR comment.
- **Multiple PRs within one phase is fine** as long as they touch different files. The directory layout in §4 is designed so most node types / interactions live in separate files.
- **Type changes in `src/shared/`** are coordination-critical — they affect both processes. Announce in a PR body when you're modifying shared types, and check there's no other open PR also editing `src/shared/`.
- **Phase exit ceremony PRs** should be opened by whichever agent finishes the last exit criterion.

## 10. Living document

This plan **will** be wrong about something. When you discover that:
- Small correction (typo, clarification): fix in your current PR, mention in body.
- Scope change (new phase needed, exit criteria wrong): dedicated PR titled `Plan: <change>`, explain why in body.
- Architectural disagreement: open an issue first, give the other agent ~24h, then propose a plan amendment via PR.

Last updated: 2026-05-24 (initial version)
