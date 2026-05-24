# AI-Mindmap — Development Plan

> **Mandatory reading for both AI agents at the start of every session.**
> If this plan and `CLAUDE.md` conflict on workflow, `CLAUDE.md` wins. If they conflict on product or architecture, this plan wins.
> Update this file (via a PR) whenever a phase ships, a decision changes, or scope shifts. Don't let it rot.

---

## 1. Product vision

**AI-Mindmap is an AI-augmented infinite whiteboard. Files are Obsidian Canvas–compatible (`.canvas`, JSON Canvas 1.0 spec). The UI takes its visual cues from Excalidraw.**

Users place **cards** (text/markdown, files, links, groups) on an **infinite 2D canvas**, connect them with **labeled arrows**, and organize them with **group containers**. AI features (summarize, expand, suggest connections, generate nodes from prompts, chat-with-canvas) are layered on **after** the core whiteboard is fully usable as a standalone, AI-free tool.

### Two product anchors (decided, do not re-debate without a Plan PR)

1. **File format: JSON Canvas 1.0** ([jsoncanvas.org/spec/1.0/](https://jsoncanvas.org/spec/1.0/)) — the same `.canvas` files Obsidian writes. Files round-trip between AI-Mindmap and Obsidian without loss. **Why this and not Excalidraw's format:** Excalidraw's schema is freehand-drawing-oriented (point arrays, stroke properties, scene versioning) and overkill for a node-and-edge whiteboard — adopting it would force us to invent semantics we don't need. JSON Canvas is purpose-built for exactly the model we want: typed nodes + edges + minimal styling.
2. **UI design language: Excalidraw-inspired** — full-bleed canvas with floating **Island** chrome (rounded cards with the signature triple-layered soft shadow), the purple `#6965db` accent against near-white surfaces, Assistant/system-ui font, minimal toolbar + zoom controls + hamburger menu. **Why:** Excalidraw's chrome is widely loved, intuitive, and refined over years. Reusing its visual idioms gets us instant polish without copying any of its drawing-engine code (which we don't need — we're a node-edge canvas, not a freehand drawing tool).

### Platform targets

- **Electron desktop app** (macOS / Windows / Linux) — primary target, local file system access via Node `fs`.
- **Web app** (browser) — same React renderer codebase, served as static files. File I/O via the **File System Access API** where supported (Chromium-based browsers), with download/upload fallback elsewhere. AI calls proxied through a thin server in the web build (or user-supplied API key entered client-side and held only in memory — decided in Phase 9).

The renderer code is **platform-agnostic**. A `Platform` adapter (`src/platform/electron.ts`, `src/platform/web.ts`) provides file I/O, AI access, settings, and key storage. The React app talks only to the adapter — never directly to Electron APIs or browser-specific APIs. Vite builds two targets: `npm run build:electron` (consumed by electron-builder) and `npm run build:web` (static site).

### Why this order (whiteboard first, then AI)
1. A whiteboard with no AI is still useful. AI on top of a broken whiteboard is useless.
2. The whiteboard interactions (drag, multi-select, undo, persistence) are the hard, slow part — get them right before adding LLM complexity.
3. AI features depend on a stable file format and node model. Defining those without a working canvas leads to retrofitting.

### What we are NOT building (V1)
- Native mobile apps (iOS/Android) — the web build will work on mobile browsers, but no native UI
- Real-time multi-user collaboration
- Plugin / extension system
- Custom theme engine beyond dark/light
- A built-in markdown editor outside of card content (no separate notes pane)
- Hand-drawn freeform strokes (we're a node-and-edge whiteboard, not a drawing app)
- Server-side document storage (local-first; user brings sync via iCloud Drive / Dropbox / Obsidian Sync)

---

## 2. Non-negotiable principles

1. **Whiteboard works fully without AI.** AI is additive. Removing the AI module must leave a fully functional whiteboard.
2. **Both platforms ship together.** Every feature lands in Electron AND web (or is explicitly marked as platform-specific in this plan). No "Electron-only" features sneaking in unannounced.
3. **Phase-gated.** Don't start Phase N+1 until every exit criterion in Phase N passes.
4. **Two-agent collaboration through PRs only.** See `CLAUDE.md`. No agent unilaterally rewrites another's recently-merged work without a PR that explains why.
5. **Security defaults stay strict.** Electron: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, strict CSP. Web: strict CSP, no `eval`, no `dangerouslySetInnerHTML`. Any relaxation requires a dedicated PR with the change called out in title and body.
6. **No secrets in renderer.** Electron: API keys live in OS keychain via main process. Web: API keys live in `sessionStorage` only (cleared on tab close) or are user-supplied per-request — never persisted to `localStorage`.
7. **Local-first.** Files live on the user's disk (Electron) or the user's chosen folder (web, via File System Access API). No mandatory cloud, no telemetry, no account.
8. **Types as contracts.** TypeScript strict mode. Shared types live in `src/shared/`.
9. **JSON Canvas fidelity.** Files written by AI-Mindmap MUST be loadable in Obsidian. Files written by Obsidian MUST round-trip through AI-Mindmap losslessly (preserve unknown fields).
10. **Plan stays current.** Any PR that changes scope, decisions, exit criteria, file format, or architecture **must update `DEVELOPMENT_PLAN.md` in the same PR.** A PR that drifts from the plan without updating it is rejected — open a plan-amendment PR first.

---

## 3. Tech stack (locked decisions)

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Electron** (currently v42) | Desktop, OS file access, established |
| Web shell | **Static SPA** served from any static host (Vercel/Netlify/GH Pages) | Zero server needed for the base app |
| Language | **TypeScript (strict)** | Types as contract between agents and across platforms |
| Renderer framework | **React 18** | Interaction-heavy UI (drag, multi-select, undo, groups, modals) |
| Bundler / dev server | **Vite** — two build targets: `build:electron`, `build:web` | Fast HMR; supports multi-target builds cleanly |
| State management | **Zustand** | Tiny API, no boilerplate, plays well with undo middleware |
| Canvas surface | **Konva.js + react-konva** | Mature 2D scene graph; handles thousands of nodes; built-in hit testing, drag, transforms |
| UI primitives | **Custom Islands** (Excalidraw-style) — no UI kit | We want the Excalidraw look exactly; off-the-shelf kits (MUI, Chakra) would fight us |
| Icons | **lucide-react** | MIT, tree-shakable, large set, matches our minimal aesthetic |
| Markdown rendering | **react-markdown** + **remark-gfm** | Safe (no `dangerouslySetInnerHTML`) |
| Persistence format | **JSON Canvas 1.0** (`.canvas` files, [spec](https://jsoncanvas.org/spec/1.0/)) | Obsidian-compatible, exactly the right model |
| Schema validation | **Zod** | Runtime validation at the file-load boundary |
| File I/O (Electron) | Node `fs/promises` via IPC | Renderer never touches `fs` directly |
| File I/O (web) | **File System Access API** (Chromium) + download/upload fallback | Local-first in the browser, no server needed for files |
| Key storage (Electron) | **keytar** (OS keychain) | Never expose keys to renderer |
| Key storage (web) | `sessionStorage` (memory-bound, cleared on tab close) — or server proxy | No persisted secrets in the browser |
| AI SDK (first provider) | **@anthropic-ai/sdk** | Project is Anthropic-built; provider interface allows adding others |
| Unit tests | **Vitest** | Native TS, fast, Vite-aligned |
| E2E tests | **Playwright** — for Electron (Playwright-for-Electron) AND web (standard Playwright) | One framework, both platforms |
| Lint / format | **ESLint** + **Prettier** | Standard; config committed |
| Desktop packaging | **electron-builder** | Cross-platform installers |
| Web deploy target | Static hosting (decided in Phase 8) — start with GitHub Pages | Free, no server, fits local-first model |

### Locked decisions that need active enforcement
- **No `dangerouslySetInnerHTML`** anywhere. Markdown goes through `react-markdown`.
- **No `eval`, no `new Function`.** CSP would block it anyway, but don't write it.
- **No `require('electron')` in the renderer.** Renderer talks to `window.platform` (the adapter) only.
- **No direct `fetch` of user-controlled URLs from the renderer in Electron.** Goes through main process so we can apply allow-listing later.
- **All IPC channels (Electron) and adapter methods (both platforms) are typed.** Shared types in `src/shared/`.
- **Web build must never import Electron-only modules.** Vite's `define` / conditional imports gate this; add a build check that fails CI if `electron` appears in the web bundle.

---

## 4. Architecture

The renderer is **identical across Electron and Web**. Platform differences live behind a single adapter the renderer imports as `window.platform`.

```
                ┌─────────────────────────────────────┐
                │   React + Konva renderer            │
                │   (identical on Electron + Web)     │
                │                                     │
                │   ┌─────────────────────────────┐   │
                │   │ UI Islands (chrome)         │   │
                │   │  toolbar, zoom, menu, etc.  │   │
                │   └─────────────────────────────┘   │
                │   ┌─────────────────────────────┐   │
                │   │ Konva Stage (canvas)        │   │
                │   │  nodes, edges, interactions │   │
                │   └─────────────────────────────┘   │
                │   ┌─────────────────────────────┐   │
                │   │ Zustand store               │   │
                │   │  nodes, edges, viewport,    │   │
                │   │  selection, history         │   │
                │   └─────────────────────────────┘   │
                └────────────────┬────────────────────┘
                                 │
                       window.platform: Platform
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                                         ▼
  ┌────────────────────┐                  ┌────────────────────┐
  │ ElectronPlatform   │                  │ WebPlatform        │
  │ (preload bridge)   │                  │ (browser APIs)     │
  ├────────────────────┤                  ├────────────────────┤
  │ • IPC → main proc  │                  │ • File System      │
  │ • keytar for keys  │                  │   Access API       │
  │ • fs/promises      │                  │ • sessionStorage   │
  │ • OS keychain      │                  │   for keys (mem)   │
  └─────────┬──────────┘                  │ • optional server  │
            │                             │   proxy for AI     │
            ▼                             └────────────────────┘
  ┌────────────────────┐
  │ Electron main      │
  │ (Node.js)          │
  │ • BrowserWindow    │
  │ • fs/promises      │
  │ • Anthropic SDK    │
  └────────────────────┘
```

### The Platform interface (the single contract)

```ts
// src/shared/platform.ts — implemented by both electron.ts and web.ts
export interface Platform {
  readonly kind: "electron" | "web";

  files: {
    openCanvas(): Promise<{ handle: FileHandle; data: JSONCanvas } | null>;
    saveCanvas(handle: FileHandle, data: JSONCanvas): Promise<void>;
    saveCanvasAs(data: JSONCanvas, suggestedName?: string): Promise<FileHandle | null>;
    recentFiles(): Promise<RecentFile[]>;
  };

  ai: {
    complete(req: AIRequest): Promise<AIResponse>;
    stream(req: AIRequest): AsyncIterable<AIChunk>;
    hasKey(): Promise<boolean>;
    setKey(key: string): Promise<void>;     // electron → keychain; web → sessionStorage
  };

  settings: {
    get<K extends keyof Settings>(k: K): Promise<Settings[K]>;
    set<K extends keyof Settings>(k: K, v: Settings[K]): Promise<void>;
  };

  shell: {
    openPath(path: string): Promise<void>;  // open file/folder in OS (no-op or download on web)
    openExternal(url: string): Promise<void>;
  };
}
```

The renderer NEVER reaches around the Platform. If you find yourself wanting `if (window.electron)` in renderer code, add a method to the Platform interface instead.

### Directory layout (target — Phase 0 establishes this)

```
AI-Mindmap/
├── package.json
├── tsconfig.json
├── tsconfig.main.json              # Electron main process compile config
├── vite.config.electron.ts         # renderer build for Electron
├── vite.config.web.ts              # renderer build for web (static SPA)
├── electron-builder.yml            # desktop packaging (added in later phase)
├── .eslintrc.cjs
├── .prettierrc
├── src/
│   ├── main/                       # Electron main process (TS → dist-main/)
│   │   ├── main.ts                 # app lifecycle, window creation
│   │   ├── preload.ts              # contextBridge → window.platform
│   │   ├── ipc/                    # IPC handlers per channel group
│   │   │   ├── files.ts
│   │   │   ├── ai.ts
│   │   │   └── settings.ts
│   │   └── ai/
│   │       ├── provider.ts         # interface
│   │       └── anthropic.ts        # impl
│   ├── platform/                   # the Platform interface implementations
│   │   ├── electron.ts             # uses IPC; wired to preload
│   │   └── web.ts                  # uses File System Access API + sessionStorage
│   ├── renderer/                   # React app (TS, Vite-built)
│   │   ├── index.html
│   │   ├── main.tsx                # entrypoint — picks Platform impl
│   │   ├── App.tsx
│   │   ├── canvas/                 # Konva-based whiteboard
│   │   │   ├── Canvas.tsx
│   │   │   ├── nodes/              # one file per node type
│   │   │   ├── edges/
│   │   │   ├── interactions/       # pan, zoom, select, drag, lasso
│   │   │   └── layout.ts
│   │   ├── ui/                     # React UI overlays — Islands, toolbars, menus
│   │   │   ├── Island.tsx          # the core Excalidraw-style floating card
│   │   │   ├── Toolbar.tsx
│   │   │   ├── ZoomControls.tsx
│   │   │   ├── MainMenu.tsx
│   │   │   └── theme.css           # tokens: #6965db, shadows, radii
│   │   ├── store/                  # Zustand slices
│   │   │   ├── nodes.ts
│   │   │   ├── edges.ts
│   │   │   ├── viewport.ts
│   │   │   ├── selection.ts
│   │   │   └── history.ts          # undo/redo
│   │   └── styles/
│   └── shared/                     # used by main, platform impls, and renderer
│       ├── ipc.ts                  # Electron IPC channel names + payload types
│       ├── platform.ts             # Platform interface
│       ├── jsoncanvas.ts           # JSON Canvas 1.0 types + Zod validators
│       └── types.ts                # internal canvas types (viewport, selection, etc.)
├── tests/
│   ├── unit/
│   └── e2e/
└── assets/
```

---

## 5. File format — JSON Canvas 1.0 (`.canvas`)

**We adopt the [JSON Canvas 1.0 spec](https://jsoncanvas.org/spec/1.0/) exactly. Field names match the spec. Files round-trip with Obsidian losslessly.**

This is **not** a custom format — it's the open spec maintained by the Obsidian team. We do not extend it with bespoke top-level fields in V1; anything we'd want (viewport state, app metadata, etc.) is stored OUTSIDE the `.canvas` file (e.g. in a sidecar `.canvas.aim.json` or in app settings keyed by file path). This keeps the `.canvas` file pure and interoperable.

### Schema (authoritative TypeScript — paste into `src/shared/jsoncanvas.ts`)

```ts
/**
 * JSON Canvas 1.0 — https://jsoncanvas.org/spec/1.0/
 * Native file format for .canvas files (Obsidian-compatible).
 * Field names MUST match the spec exactly. Do not rename.
 */

/** Root document. Both arrays are OPTIONAL per spec. */
export interface JSONCanvas {
  nodes?: Node[];
  edges?: Edge[];
}

/**
 * Color: either a hex string (e.g. "#FF0000") OR a preset palette index
 * "1".."6". Presets map to red/orange/yellow/green/cyan/purple, but the
 * spec deliberately does NOT fix the exact hex values — apps theme them.
 * Treat preset strings as opaque tokens on read.
 */
export type CanvasColor = HexColor | CanvasPresetColor;
export type HexColor = `#${string}`;                          // e.g. "#FF0000"
export type CanvasPresetColor = "1" | "2" | "3" | "4" | "5" | "6";
//  "1" red | "2" orange | "3" yellow | "4" green | "5" cyan | "6" purple

/** Fields shared by every node. */
export interface NodeBase {
  id: string;            // required, unique
  type: NodeType;        // required
  x: number;             // required, integer, pixels (+x right)
  y: number;             // required, integer, pixels (+y down)
  width: number;         // required, integer, pixels
  height: number;        // required, integer, pixels
  color?: CanvasColor;
}

export type NodeType = "text" | "file" | "link" | "group";

export interface TextNode extends NodeBase {
  type: "text";
  text: string;          // required; Markdown
}

export interface FileNode extends NodeBase {
  type: "file";
  file: string;          // required; path relative to vault root (Obsidian) or document folder (us)
  subpath?: string;      // optional; heading anchor or block ref. MUST start with "#"
}

export interface LinkNode extends NodeBase {
  type: "link";
  url: string;           // required
}

export interface GroupNode extends NodeBase {
  type: "group";
  label?: string;
  background?: string;                       // optional; path to bg image
  backgroundStyle?: GroupBackgroundStyle;
}
export type GroupBackgroundStyle = "cover" | "ratio" | "repeat";

export type Node = TextNode | FileNode | LinkNode | GroupNode;

/** Edge between two nodes. */
export interface Edge {
  id: string;                  // required, unique
  fromNode: string;            // required; references Node.id
  toNode: string;              // required; references Node.id
  fromSide?: EdgeSide;
  toSide?: EdgeSide;
  fromEnd?: EdgeEnd;           // default "none"
  toEnd?: EdgeEnd;             // default "arrow"
  color?: CanvasColor;
  label?: string;
}
export type EdgeSide = "top" | "right" | "bottom" | "left";
export type EdgeEnd  = "none" | "arrow";
```

### Spec rules we must honor

- **No `version` field at root.** The spec is externally versioned (1.0, 2024-03-11). If JSON Canvas 2.0 ships, we'll add a migration path. Today, no version field.
- **Z-order is array order.** `nodes[0]` renders bottom, `nodes[length-1]` renders top. Preserve order on save.
- **Coordinates are integer pixels, +x right, +y down.** Match Obsidian's convention so files don't appear shifted when opened there.
- **Color values: write presets when possible.** If the user picked a swatch from our palette, write the preset string `"1"`–`"6"` so other apps can re-theme. Only write hex when the user picked a custom color.
- **Preserve unknown fields on round-trip.** Any field we don't recognize must survive a load → edit → save cycle. Implement this with a "passthrough" pattern in the Zod schema.
- **Edge defaults: `fromEnd: "none"`, `toEnd: "arrow"`.** An edge with neither field set is a one-way arrow from `fromNode` to `toNode`.
- **`FileNode.file` paths are relative.** Obsidian uses vault-root-relative. We use document-folder-relative (the folder containing the `.canvas`). Convert absolute paths to relative on save.

### How we store things JSON Canvas doesn't cover

The spec is intentionally minimal. We need a few things it doesn't define (viewport state, recent-file metadata, app-internal flags). Storage strategy:

| What | Where | Why not in `.canvas` |
|---|---|---|
| Viewport (pan/zoom) | App settings, keyed by file path | Spec has no viewport field; pure files keep interop clean |
| AI chat history per file | Sidecar `<file>.canvas.aim.json` next to the `.canvas` | Could be large, not Obsidian-relevant |
| Recent files list | App settings | Per-user, not per-document |
| App version that last opened | App settings | Telemetry-ish, not a file concern |

### Minimal valid file (for tests)

```json
{
  "nodes": [
    { "id": "a", "type": "text", "x": 0,   "y": 0, "width": 240, "height": 80, "text": "# Hello" },
    { "id": "b", "type": "link", "x": 320, "y": 0, "width": 240, "height": 80, "url": "https://anthropic.com", "color": "5" }
  ],
  "edges": [
    { "id": "e1", "fromNode": "a", "fromSide": "right", "toNode": "b", "toSide": "left", "label": "see" }
  ]
}
```

### Interop tests (required in Phase 5)
- Open a `.canvas` file generated by Obsidian → render correctly, all fields preserved.
- Save a file we created → open it in Obsidian → renders correctly.
- Round-trip with unknown extra fields → fields survive.

---

## 5b. UI design language — Excalidraw-inspired

We are not building a freehand drawing app. We are building a node-edge whiteboard. We adopt Excalidraw's **visual layer** (layout, chrome, palette, type), not its drawing engine.

### Layout idiom: full-bleed canvas + floating Islands

The canvas owns the viewport. All UI chrome floats over it in **Islands** — rounded cards with a soft three-layer shadow that look like lifted paper. The wrapper that holds the Islands has `pointer-events: none`; each Island re-enables pointer events on itself. This is exactly Excalidraw's `LayerUI` + `FixedSideContainer` + `Island` pattern.

```
┌──────────────────────────────────────────────────────────────┐
│ ╭─────────╮  ╭─────────────────────────╮  ╭───────╮          │
│ │ ☰  Menu │  │ [↖] [T] [▢] [→] [🔗] [📷]│  │ Theme │          │
│ ╰─────────╯  ╰─────────────────────────╯  ╰───────╯          │
│                                                              │
│                                                              │
│                                                              │
│                     CANVAS                                   │
│                                                              │
│                                                              │
│                                                              │
│  ╭─────────────────╮                              ╭───╮      │
│  │ [−] 100% [+]    │                              │ ? │      │
│  │ ╭─────╮ ╭─────╮ │                              ╰───╯      │
│  │ │ ⟲   │ │ ⟳   │ │                                         │
│  ╰─────────────────╯                                         │
└──────────────────────────────────────────────────────────────┘
```

- **Top-left:** main menu hamburger (file ops, settings, about).
- **Top-center:** tool palette (select, text card, group, edge, image, link). Icon-only buttons, 2rem square, single Island.
- **Top-right:** theme toggle, AI toggle (later phases).
- **Bottom-left:** zoom controls Island (`−` / `100%` / `+`), undo/redo Island next to it.
- **Bottom-right:** help button (opens shortcuts cheat sheet).

### Design tokens (paste into `src/renderer/ui/theme.css`)

```css
:root {
  /* Accent (Excalidraw purple) */
  --aim-color-primary: #6965db;
  --aim-color-primary-hover: #5753d0;
  --aim-color-primary-light: #e3e2fe;

  /* Surfaces (light) */
  --aim-color-canvas-bg: #ffffff;
  --aim-color-island-bg: #ffffff;
  --aim-color-surface-high: #f1f0ff;
  --aim-color-text: #1b1b1f;
  --aim-color-border: #767680;

  /* Sizing */
  --aim-button-size: 2rem;
  --aim-button-size-lg: 2.25rem;
  --aim-icon-size: 1rem;
  --aim-border-radius: 0.5rem;       /* Islands */
  --aim-border-radius-md: 0.375rem;  /* buttons */
  --aim-container-padding: 1rem;

  /* The Excalidraw signature triple shadow */
  --aim-shadow-island:
    0px 0px 1px 0px rgba(0,0,0,0.17),
    0px 0px 3px 0px rgba(0,0,0,0.08),
    0px 7px 14px 0px rgba(0,0,0,0.05);

  /* Type */
  --aim-font-ui: "Assistant", system-ui, BlinkMacSystemFont, -apple-system,
                 "Segoe UI", Roboto, Helvetica, Arial, sans-serif;

  /* Transitions */
  --aim-transition-shadow: 0.5s ease-in-out;
  --aim-transition-state: all 0.2s ease;
}

[data-theme="dark"] {
  --aim-color-primary: #a8a5ff;
  --aim-color-primary-hover: #bbb8ff;
  --aim-color-canvas-bg: #121212;
  --aim-color-island-bg: #232329;
  --aim-color-surface-high: #2e2d39;
  --aim-color-text: #e3e3e8;
  --aim-color-border: #8e8d9c;
}
```

### The `<Island>` primitive

Single React component used to wrap every chrome cluster. ~30 lines of code. Phase 0 (or earliest Phase 1) ships this and the layout shell.

```tsx
// src/renderer/ui/Island.tsx
import { PropsWithChildren } from "react";
import "./Island.css";

export function Island({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={`aim-island ${className ?? ""}`}>{children}</div>;
}
```

```css
.aim-island {
  background: var(--aim-color-island-bg);
  border-radius: var(--aim-border-radius);
  box-shadow: var(--aim-shadow-island);
  padding: calc(var(--aim-container-padding) * 0.25);
  pointer-events: auto;
  font-family: var(--aim-font-ui);
  color: var(--aim-color-text);
  transition: box-shadow var(--aim-transition-shadow);
}
```

### What we explicitly do NOT take from Excalidraw

- The drawing engine, shape primitives, freehand stroke logic — not relevant to a node-edge canvas.
- Their library/templates panel — different product.
- Their collaborator avatars/multiplayer UI — out of scope for V1.
- Hand-drawn fonts (Virgil, Excalifont) — our cards render Markdown in a normal font.

### Reference implementations (for layout, not code-copying)

When implementing Phase 1's chrome, mimic the structure of these Excalidraw files (but write our own code; Excalidraw is MIT but we have no need to vendor it):

- `packages/excalidraw/components/LayerUI.tsx` — floating-chrome composition over canvas
- `packages/excalidraw/components/FixedSideContainer.tsx` + `.scss` — absolute top/bottom positioning primitive
- `packages/excalidraw/components/Island.tsx` + `Island.scss` — the rounded shadowed card
- `packages/excalidraw/components/Actions.tsx` — tool row
- `packages/excalidraw/components/footer/Footer.tsx` — bottom three-column layout
- `packages/excalidraw/components/main-menu/MainMenu.tsx` — hamburger pattern
- `packages/excalidraw/css/theme.scss` — tokens (informed our table above)

---

## 6. Phases

Each phase has: **scope**, **deliverables**, **exit criteria**, **estimated PR count**. PRs within a phase can ship independently; the phase is "done" only when all exit criteria pass.

### Phase 0 — Toolchain & dual-target build
**Goal:** turn the vanilla-JS Electron scaffold into a TypeScript + React + Vite + Konva foundation that builds for **both Electron and the web** from one codebase. Establish the Platform adapter pattern.

**Deliverables**
- Add TS configs: `tsconfig.json` (renderer), `tsconfig.main.json` (Electron main process).
- Add **two Vite configs**: `vite.config.electron.ts` and `vite.config.web.ts`. In Electron dev, Vite serves on `http://localhost:5173` and Electron loads from it; in prod, loads `file://` from built `dist-renderer-electron/`. Web dev: `vite --config vite.config.web.ts`. Web build emits a static SPA in `dist-web/`.
- Convert `src/main/main.js` → `main.ts`, `preload.js` → `preload.ts`. Keep existing security config exactly.
- Add `src/platform/` with `electron.ts` and `web.ts` — both implement the `Platform` interface from `src/shared/platform.ts` (stubs are fine in Phase 0; Phase 5 fills them out).
- Add `src/renderer/main.tsx` that picks the platform impl at module init (`window.platform = isElectron ? electron : web`) and mounts the React app.
- Add deps: React 18, react-dom, react-konva, konva, zustand, zod, react-markdown, remark-gfm, lucide-react.
- Add dev deps: typescript, vite, @vitejs/plugin-react, vitest, @playwright/test, playwright-electron, eslint, prettier, eslint-config-prettier, eslint-plugin-react, @typescript-eslint/*.
- Add ESLint + Prettier configs, wire `npm run lint`, `npm run format`.
- Add Vitest + Playwright skeletons; one smoke test each (one for unit, one for Electron e2e, one for web e2e).
- Replace the demo "Root" rect drawing in `renderer.js` with a React + Konva `Stage` showing the same Root rect — **parity check, runs identically in both Electron and web**.
- `package.json` scripts:
  - `dev:electron` — Vite (electron config) + Electron concurrently
  - `dev:web` — Vite (web config)
  - `build:electron` — bundles renderer + compiles main, outputs to `dist-electron/`
  - `build:web` — static SPA in `dist-web/`
  - `start` — launches built Electron app
  - `preview:web` — serves built web app for local check
  - `lint`, `format`, `typecheck`, `test`, `test:e2e:electron`, `test:e2e:web`
- Bump Electron to v42 if not already done (the other agent had this in flight on `claude-jjy/bump-electron-42` — already merged as of last sync).
- Add a CI guard (one-liner script) that fails if the web build's output contains the string `"electron"` (catches accidental Electron imports leaking into web).

**Exit criteria**
- [ ] `npm run dev:electron` opens the desktop app with the React+Konva root rect
- [ ] `npm run dev:web` serves a browser version with the same React+Konva root rect at `http://localhost:5173`
- [ ] `npm run build:electron && npm start` runs the packaged desktop app
- [ ] `npm run build:web && npm run preview:web` serves the production web bundle
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run lint` passes
- [ ] One Vitest unit test passes
- [ ] One Electron e2e test launches the app and asserts the window title
- [ ] One web e2e test (Playwright Chromium) loads the app and asserts the same rendering
- [ ] Web bundle does NOT contain `"electron"` string (CI guard passes)
- [ ] CSP strict on both targets; preload contextBridge in place for Electron
- [ ] `CLAUDE.md` "Tech stack" section updated to reflect TS/React/Vite/Konva + dual target
- [ ] `Platform` interface defined in `src/shared/platform.ts`; both `electron.ts` and `web.ts` implement it (even if most methods throw "not implemented" for now)

**Estimated PRs:** 4–6 (TS+Vite dual-config, React+Konva parity, Platform adapter skeleton, lint/format, test infra)

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
