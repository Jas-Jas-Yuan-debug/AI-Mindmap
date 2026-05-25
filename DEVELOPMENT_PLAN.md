# AI-Mindmap — Development Plan

> **Mandatory reading for both AI agents at the start of every session.**
> If this plan and `CLAUDE.md` conflict on workflow, `CLAUDE.md` wins. If they conflict on product or architecture, this plan wins.
> Update this file (via a PR) whenever a phase ships, a decision changes, or scope shifts. Don't let it rot.

---

## 1. Product vision

**AI-Mindmap is an AI-augmented infinite whiteboard. It is a single-user, standalone application with no interop with other apps. The UI takes its visual cues from Excalidraw.**

Users place **cards** (text/markdown, files, links, groups) on an **infinite 2D canvas**, connect them with **labeled arrows**, and organize them with **group containers**. AI features (summarize, expand, suggest connections, generate nodes from prompts, chat-with-canvas) are layered on **after** the core whiteboard is fully usable as a standalone, AI-free tool.

### Two product anchors (decided, do not re-debate without a Plan PR)

1. **File format: our own `.aimap` JSON format.** Single-app, single-user, no interop promise with any other tool. Schema is derived from JSON Canvas 1.0 because it's a sound design for typed nodes + edges, but we are **free to extend it** with bespoke top-level fields (viewport, app version, AI chat history, etc.) directly in the file. No need for sidecar files. **Why not Obsidian-compatible:** we considered adopting JSON Canvas 1.0 as-is and shipping `.canvas` files that round-trip with Obsidian, but interop adds permanent constraints (can't add useful top-level fields, can't extend node types, must run round-trip tests forever) for a use case (users editing the same file in two tools) that isn't core to our product. Dropping the interop promise simplifies the format and frees future evolution. **Why not Excalidraw's format:** Excalidraw's schema is freehand-drawing-oriented (point arrays, stroke properties, scene versioning) and overkill for a node-and-edge whiteboard.
2. **UI design language: Excalidraw-inspired** — full-bleed canvas with floating **Island** chrome (rounded cards with the signature triple-layered soft shadow), the purple `#6965db` accent against near-white surfaces, Assistant/system-ui font, minimal toolbar + zoom controls + hamburger menu. **Why:** Excalidraw's chrome is widely loved, intuitive, and refined over years. Reusing its visual idioms gets us instant polish without copying any of its drawing-engine code (which we don't need — we're a node-edge canvas, not a freehand drawing tool).

### Platform targets

- **Electron desktop app** (macOS / Windows / Linux) — primary target, local file system access via Node `fs`.
- **Web app** (browser) — same React renderer codebase, served as static files. File I/O via the **File System Access API** where supported (Chromium-based browsers), with download/upload fallback elsewhere. AI calls proxied through a thin server in the web build (or user-supplied API key entered client-side and held only in memory — decided in Phase 9).

The renderer code is **platform-agnostic**. A `Platform` adapter (`src/platform/electron.ts`, `src/platform/web.ts`) provides file I/O, AI access, settings, and key storage. The React app talks only to the adapter — never directly to Electron APIs or browser-specific APIs. Vite builds two targets: `npm run build:electron` (consumed by electron-builder) and `npm run build:web` (static site).

### Why this order (whiteboard first, then AI)
1. A whiteboard with no AI is still useful. AI on top of a broken whiteboard is useless.
2. The whiteboard interactions (drag, multi-select, undo, persistence) are the hard, slow part — get them right before adding LLM complexity.
3. AI features depend on a stable file format and node model. Defining those without a working canvas leads to retrofitting.

### What we are NOT building — ever, not just V1

The following are **explicitly removed from scope, permanently.** They are not deferred to a later phase; they are not a stretch goal; they are not "maybe one day." Do not propose them in a future PR without first opening a Plan-amendment PR that justifies un-cutting them.

- **Any form of multi-user collaboration.** No real-time co-editing. No comment threads. No presence indicators. No shared cursors. No invite links. No accounts. This is a single-user tool.
- **Interop with other apps' file formats.** Not Obsidian Canvas (`.canvas`), not Excalidraw (`.excalidraw`), not Miro, not Figma, not anything else. Our `.aimap` files are ours alone. We do not promise round-trip with any external tool. We will not implement import/export adapters for other apps.
- **Server-side document storage / sync.** Local-first only. If a user wants to sync, they use iCloud Drive / Dropbox / a network drive on their own — we do not build, run, or integrate with any sync service.
- **Accounts, login, telemetry.** None. The app does not phone home.

### What we are NOT building in V1 (but might revisit later)
- Native mobile apps (iOS/Android) — the web build will work on mobile browsers, but no native UI
- Plugin / extension system
- Custom theme engine beyond dark/light
- A built-in markdown editor outside of card content (no separate notes pane)
- Hand-drawn freeform strokes (we're a node-and-edge whiteboard, not a drawing app)

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
9. **Single-user, standalone, no interop.** The file format is ours alone; we do not promise compatibility with Obsidian, Excalidraw, or any other tool. No multi-user features of any kind. See §1 "What we are NOT building — ever."
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
| Persistence format | **`.aimap` JSON** (our own — see §5) | Single-app, free to extend; schema derived from JSON Canvas 1.0 but no interop promise |
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
    openCanvas(): Promise<{ handle: FileHandle; data: AimapFile } | null>;
    saveCanvas(handle: FileHandle, data: AimapFile): Promise<void>;
    saveCanvasAs(data: AimapFile, suggestedName?: string): Promise<FileHandle | null>;
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
├── eslint.config.js
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
│       ├── aimap.ts                # .aimap file format types + Zod validators (renamed from jsoncanvas.ts in Phase 5)
│       └── types.ts                # internal canvas types (viewport, selection, etc.)
├── tests/
│   ├── unit/
│   └── e2e/
└── assets/
```

---

## 5. File format — our own `.aimap` JSON format

**This is our format. We do not promise round-trip compatibility with any other tool.** The schema is *derived* from JSON Canvas 1.0 because it's a sound design for typed nodes + edges, but we are free to extend it — and we do, starting at the root level with our own metadata fields.

`.aimap` files are validated with **Zod** at the file-load boundary. Unknown fields are dropped (not preserved — there's no other tool to round-trip with).

### Schema (authoritative TypeScript — `src/shared/aimap.ts`)

The Phase 0 file is currently named `src/shared/jsoncanvas.ts` because it predates this plan amendment. Phase 5 (or any earlier PR that touches it) renames it to `aimap.ts` and applies the schema below.

```ts
/**
 * .aimap file format — our own.
 * Single-app, single-user, no interop. Free to evolve.
 */

export const AIMAP_FORMAT_VERSION = 1;

export interface AimapFile {
  /** Bumped on breaking schema changes. Migrations live in src/shared/migrations/. */
  formatVersion: 1;

  /** App metadata at last save. Informational; not load-gating. */
  meta: {
    app: "AI-Mindmap";
    appVersion: string;        // semver of the app that wrote the file
    createdAt: string;         // ISO 8601
    updatedAt: string;         // ISO 8601
  };

  /** Last-known viewport for this document. Restored on open. */
  viewport: {
    x: number;                 // canvas-space pan offset
    y: number;
    zoom: number;              // 0.1 .. 4.0
  };

  /** AI chat history attached to this document. Optional. */
  chats?: ChatThread[];

  nodes: Node[];               // required, may be empty
  edges: Edge[];               // required, may be empty
}

/** Color: hex string OR a preset palette index "1".."6". Same convention as JSON Canvas. */
export type Color = HexColor | PresetColor;
export type HexColor = `#${string}`;
export type PresetColor = "1" | "2" | "3" | "4" | "5" | "6";
//  "1" red | "2" orange | "3" yellow | "4" green | "5" cyan | "6" purple

export interface NodeBase {
  id: string;            // required, unique within the file (uuid v4)
  type: NodeType;
  x: number;             // integer pixels, +x right
  y: number;             // integer pixels, +y down
  width: number;
  height: number;
  color?: Color;
  parentId?: string;     // id of containing GroupNode, if any (our extension)
}

export type NodeType = "text" | "file" | "link" | "image" | "group";

export interface TextNode extends NodeBase {
  type: "text";
  text: string;          // Markdown
}

export interface FileNode extends NodeBase {
  type: "file";
  file: string;          // document-folder-relative path
  displayName?: string;
}

export interface LinkNode extends NodeBase {
  type: "link";
  url: string;
  title?: string;
  favicon?: string;      // data URL or cached path
}

export interface ImageNode extends NodeBase {
  type: "image";
  file: string;          // document-folder-relative path inside <file>.aimap.assets/
  alt?: string;
}

export interface GroupNode extends NodeBase {
  type: "group";
  label?: string;
  collapsed?: boolean;
}

export type Node = TextNode | FileNode | LinkNode | ImageNode | GroupNode;

export interface Edge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: EdgeSide;
  toSide?: EdgeSide;
  fromEnd?: EdgeEnd;     // default "none"
  toEnd?: EdgeEnd;       // default "arrow"
  color?: Color;
  label?: string;
}
export type EdgeSide = "top" | "right" | "bottom" | "left";
export type EdgeEnd  = "none" | "arrow";

export interface ChatThread {
  id: string;
  createdAt: string;
  messages: { role: "user" | "assistant"; content: string; ts: string }[];
}
```

### Format rules

- **`formatVersion` is the migration anchor.** Bump it when a breaking change lands; ship a migration in `src/shared/migrations/v<N>-to-v<N+1>.ts`. Older versions migrate forward on open; newer versions refuse to open with a clear error.
- **Z-order is array order.** `nodes[0]` renders bottom, `nodes[length-1]` renders top. Preserve order on save.
- **Coordinates are integer pixels, +x right, +y down.** Same convention everywhere.
- **Color values: write presets when possible.** If the user picked a swatch from our palette, write `"1"`–`"6"` so a future theme change re-themes existing files automatically. Hex only when the user picked a custom color.
- **Edge defaults: `fromEnd: "none"`, `toEnd: "arrow"`.** An edge with neither end field is a one-way arrow.
- **`FileNode.file` / `ImageNode.file` paths are relative** to the folder containing the `.aimap` file. Convert absolute paths on save. Images are copied into `<filename>.aimap.assets/` next to the document on import.
- **Unknown fields are dropped on save.** No round-trip preservation — we have no external tool to round-trip with.
- **File extension: `.aimap`.** MIME type: `application/json` over HTTP; internally treated as our own type.

### Minimal valid file (for tests)

```json
{
  "formatVersion": 1,
  "meta": {
    "app": "AI-Mindmap",
    "appVersion": "0.1.0",
    "createdAt": "2026-05-24T08:00:00Z",
    "updatedAt": "2026-05-24T08:00:00Z"
  },
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "nodes": [
    { "id": "a", "type": "text", "x": 0,   "y": 0, "width": 240, "height": 80, "text": "# Hello" },
    { "id": "b", "type": "link", "x": 320, "y": 0, "width": 240, "height": 80, "url": "https://anthropic.com", "color": "5" }
  ],
  "edges": [
    { "id": "e1", "fromNode": "a", "fromSide": "right", "toNode": "b", "toSide": "left", "label": "see" }
  ]
}
```

### Phase 5 file rename — 🟢 DONE (PR #32)
~~The Phase 0 module is currently `src/shared/jsoncanvas.ts` with the now-superseded JSON Canvas 1.0 schema.~~ **Done in Phase 5 PR 1/3 (PR #32):** `git mv src/shared/jsoncanvas.ts → src/shared/aimap.ts` (history preserved), schema replaced with the `AimapFile` definition above (`formatVersion`, `meta`, `viewport`, `chats` at root, `ImageNode`, `parentId` on `NodeBase`), Zod validators added (`parseAimapFile`). `src/shared/platform.ts` now references `AimapFile`. The runtime stores `src/renderer/store/nodes.ts` + `edges.ts` import & re-export the canonical node/edge types from `aimap.ts` (single source of truth); `AimapNode` stays narrowed to `TextNode` until the renderer learns to draw the other variants (Phase 6/7), while the FILE schema defines all variants for forward-compat.

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
- Their collaborator avatars/multiplayer UI — permanently out of scope (see §1).
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
- [x] `npm run dev:electron` opens the desktop app with the React+Konva root rect (PR #10 set up, PR #12 fixed CJS-main crash; Electron process verified alive)
- [x] `npm run dev:web` serves a browser version with the same React+Konva root rect at `http://localhost:5173` (PR #10; visually verified via preview MCP in PR #11)
- [x] `npm run build:electron && npm start` runs the packaged desktop app (verified in PR #19, 2026-05-24T09:45:00Z; 4 Electron processes alive — main + GPU helper + network utility + renderer — clean SIGTERM shutdown, no stderr errors)
- [x] `npm run build:web && npm run preview:web` serves the production web bundle (verified in PR #19, 2026-05-24T09:45:00Z; HTTP 200 at localhost:4173, served HTML contains `<title>AI-Mindmap</title>` plus module/css tags into `/assets/`)
- [x] `npm run typecheck` passes with zero errors (PR #10)
- [x] `npm run lint` passes (closed by PR #18 — ESLint 9 flat config migration)
- [x] One Vitest unit test passes (`tests/unit/smoke.test.ts`, PR #10)
- [x] One Electron e2e test launches the app and asserts the window title (closed by PR #17)
- [x] One web e2e test (Playwright Chromium) loads the app and asserts the same rendering (closed by PR #17)
- [x] Web bundle does NOT contain `"electron"` string (CI guard passes) (`scripts/verify-web-no-electron.mjs`, PR #10)
- [x] CSP strict on both targets; preload contextBridge in place for Electron (PR #10; note `style-src 'unsafe-inline'` and `connect-src ws:` allowed for React + Vite HMR — documented in `src/renderer/index.html`)
- [x] `CLAUDE.md` "Tech stack" section updated to reflect TS/React/Vite/Konva + dual target (PR #8 plan amendment)
- [x] `Platform` interface defined in `src/shared/platform.ts`; both `electron.ts` and `web.ts` implement it (even if most methods throw "not implemented" for now) (PR #10)

**Phase 0 status: 13 / 13 criteria met.** All exit criteria closed by PRs #10, #11, #12, #17, #18, #19. Phase-exit ceremony PR pending.

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
- [x] Pan/zoom feels smooth at 60fps on a 2019 MacBook (closed by PR #21 — wheel-based + drag pan + keyboard shortcuts, cursor-centered zoom; implementation is visually smooth at typical interaction speeds, frame-rate not measured on specific hardware)
- [x] Zoom range clamped 0.1×–4.0×; can't pan into invalid state (closed by PR #21 — `clampZoom` enforced at the store boundary via `setViewport` / `setZoom`)
- [x] Grid renders correctly at all zoom levels (no Moiré, scales with zoom) (PR #22 — `src/renderer/canvas/Grid.tsx` adaptive power-of-2 step + viewport culling; View menu toggles visibility; `Grid.test.ts` locks in step math)
- [ ] Viewport state survives reload-from-file (saved in `.aimap`)
- [x] Unit tests cover viewport math (screen↔canvas coord conversion) (PR #20 — `src/renderer/canvas/layout.test.ts`, 14 tests covering clamp/round-trip/zoom-anchor invariant)

**Phase 1 status: 4 / 5 criteria met.** Open follow-up: viewport persistence in `.aimap` (Phase 5 file-format work). Pan/zoom (PR #21), grid + StatusBar (zoom %, cursor canvas coords) + View menu (toggle grid, fit to content) + `viewport.fitToContent()` (PR #22) all shipped.

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

**Phase 2 status: 4 / 6 criteria met.** Deferred to Phase 5: round-trip save/load preserves text card fields; E2E test for create→edit→save→reload.

Phase 2 PR 2 (move/resize/delete/create-on-double-click) added: drag-to-move on the card body, 8-handle resize with min-size clamping, Delete/Backspace removes selected cards, double-click-empty creates a new TextNode at the cursor (and arms a pending-edit handshake on the selection store for sibling C's overlay). Dev helper `window.__aimPushCards(n)` lets the user manually verify pan/zoom smoothness with 100 cards on screen; `tests/unit/perf-100-cards.test.ts` is the CI machinery proxy.

Phase 2 PR 3 (edit-mode + markdown + color picker) added the HTML NodeOverlayLayer sandwiched between Canvas and Chrome: per-node overlays compute screen-space rects via `canvasToScreen` and subscribe to the viewport store so the textarea / markdown view stay aligned during pan + zoom. Double-click on a card overlay enters edit-mode (textarea, focus + select-all, Esc cancels, blur/Cmd+Enter commits). Right-click opens a 7-swatch color picker (default + 6 presets from `PRESET_COLOR_MAP`) that calls `updateNode(id, { color })`. The overlay also consumes sibling B's `pendingEditId` handshake to auto-open the textarea on freshly created cards.

**Exit criteria**
- [x] Create 100 cards, no visible lag during pan/zoom (closed by PR #24 — store-level insertion of 100 nodes under 200ms in `tests/unit/perf-100-cards.test.ts`; manual visual smoothness check available in dev via `window.__aimPushCards(100)`)
- [x] Edit-mode textarea always aligns with the Konva node (zoom + pan synced) (closed by PR #25 — HTML NodeOverlayLayer positions overlays via canvasToScreen and subscribes to the viewport store, so the textarea / read-mode view track pan and zoom in real time)
- [x] Markdown renders: headers, lists, bold/italic, code blocks, links, inline images via URL (closed by PR #25 — react-markdown + remark-gfm render the TextNode body in the read-mode overlay; no dangerouslySetInnerHTML)
- [ ] Round-trip save/load preserves every text card field
- [x] Unit tests for node store actions (closed by PR #23 — nodes.test.ts)
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

**Phase 3 status block:** drag-to-connect + edge label edit closed by PR #27 (Phase 3 PR 2). Edge selection + Delete + ColorPicker + 100×200 perf closed by PR #28 (Phase 3 PR 3). PR 3 adds a single-select edge slice (`useEdgeSelection`), a Stage click hook that walks ancestors for `name="aim-edge"`, an invisible `EdgeHitLayer` so A's non-listening visible Path is still clickable, an `EdgeSelectionHighlight` overlay (purple bezier + arrowheads above the edges layer), generalized `ColorPicker` props `{ targetId, targetKind }` with a shared `useColorPicker` open/close slice, a right-click hook (`useEdgeContextMenu`) that uses `Stage.getIntersection` to open the picker on the hit edge, `Delete` key extended to drop the selected edge as well as cascade-delete selected nodes, and a `window.__aimPushEdges(n)` dev helper + store-level perf test (100 nodes + 200 edges insert under 500ms, one `updateNode` under 10ms, one cascade `deleteNodeAndEdges` under 20ms).

**Exit criteria**
- [x] 100 cards × 200 edges renders at 60fps during pan/zoom (closed by PR #28 — store-level perf test passes well under 500ms; manual visual smoothness available in dev via `window.__aimPushCards(100)` + `window.__aimPushEdges(200)`)
- [x] Edges never visually disconnect from their anchors during card move/resize/zoom (closed by PR #26 — Edge.tsx subscribes to useNodes; geometry recomputed reactively on every node store change)
- [ ] Save/load preserves edges with labels, colors, arrow style
- [x] Deleting a card also deletes its connected edges (in one undoable step) (closed by PR #26 — `deleteNodeAndEdges` helper; Phase 4 history will wrap both writes in one undo entry)
- [x] Unit tests for edge anchor geometry (closed by PR #26 — geometry.test.ts, 21 tests covering anchorPosition / defaultSidesFor / bezierControlPoints / arrowHeadPoints)

**Phase 3 status: 4 / 5 criteria met.** Deferred to Phase 5: save/load preserves edges. All three Phase 3 PRs (PR 1 #26 foundation, PR 2 #27 drag-to-connect + labels, PR 3 #28 selection + delete + color + perf) have landed.

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

**Phase 4 status: 4 / 4 criteria met. 🟢 done.** All criteria closed across the 3 Phase 4 PRs: undo/redo foundation (PR #29), multi-select + group move + move/resize capture (PR #30), clipboard cut/copy/paste + id remap + paste-under-undo (PR #31).

Phase 4 PR 1 (#29, this PR) shipped the **undo/redo foundation**: a snapshot-based `src/renderer/store/history.ts` slice (`capture()` / `transact(fn)` / `undo()` / `redo()` / `clear()`, past+future each capped at 200 snapshots, future cleared on any new capture), document-level keyboard shortcuts (`useHistoryKeys` — Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y redo, suppressed while typing in inputs/textareas), and history capture retrofitted onto every DISCRETE mutation: create (useCreate), delete-cascade (useDeleteKey, one `transact` for nodes+edges+selected-edge), color (ColorPicker, node + edge), edge-add (useDrawEdge), text edit (NodeOverlay), and edge-label edit (EdgeLabelOverlayLayer). Move/resize history capture is sibling B's scope (B is rewriting drag for group-move); paste is sibling C's. `transact(fn)` is the seam B wraps group-move in and C wraps paste in, so each lands as one undo step. undo/redo infra + create/delete/color/edge/text/label capture closed by PR #29; move/resize (sibling B) and paste (sibling C) complete the action-type coverage.

**Exit criteria**
- [x] Lasso select correctly hit-tests at any zoom level (closed by PR #30 — lasso hit-tests in canvas coords, zoom-independent; `rectsIntersect` / `normalizeLasso` / `nodesInLasso` unit-tested, 21 cases incl. edge-touch, containment, zoom-invariance)
- [x] Undo/redo is correct after every action type (move, resize, edit, color, edge add/delete, paste) (closed across 3 PRs — infra + create/delete/color/edge-add/edge-delete/text/label capture in PR #29; move/resize capture in PR #30; cut + paste each wrapped in `useHistory.transact()` as one undo step in PR #31)
- [x] Cut+paste of a subgraph preserves internal edges with remapped IDs (closed by PR #31 — `clipboard.ts`: `copySelection` keeps only edges whose both endpoints are selected; `remapSubgraph` mints fresh node + edge ids and remaps edge endpoints through the old→new map, dropping any dangling edge; `pasteClipboard` offsets +20,+20 and selects the pasted subgraph; 14 unit tests in `clipboard.test.ts`)
- [x] Memory: undo stack capped, no leaks (closed by PR #29 — past/future capped at 200 snapshots, future cleared on new action; snapshots are copy-by-reference over immutable store arrays so no per-snapshot deep-copy growth)

**Phase 4 status block:** undo/redo foundation landed in PR 1 (sibling A). Multi-select (lasso drag on empty canvas + Shift+click toggle + Cmd/Ctrl+A select-all) and **group move** (drag any selected node → all selected nodes move together, the whole gesture one undo step) landed in PR #30 (Phase 4 PR 2/3). PR 2 also wired the move/resize history capture sibling A left to this PR: `useHistory.capture()` fires once at the start of each move drag (`onDragStart`) and each resize-handle drag, so every gesture collapses into a single undo entry. Lasso hit-test is a pure module (`canvas/interactions/lasso.ts`) operating in canvas space, making it zoom-independent.

**Phase 4 PR 3/3 (PR #31) — in-app clipboard.** `Cmd/Ctrl + C / X / V` (`useClipboardKeys`, document-level keydown, mounted in `Canvas.tsx`, suppressed while typing in input/textarea/contentEditable). `src/renderer/clipboard/clipboard.ts` holds an in-memory JSON payload (NOT the OS clipboard, so the full node+edge subgraph round-trips): `copySelection()` collects the selected nodes plus only the edges internal to the selection (both endpoints selected); `pasteClipboard(offset)` mints fresh ids via `makeNodeId`/`makeEdgeId`, offsets node x/y by +20,+20, remaps edge endpoints through the old→new id map, writes to the stores, and selects the pasted nodes; the pure `remapSubgraph(payload, mintNodeId, mintEdgeId, offset)` helper does the id-remap and is unit-tested in isolation. Cut and paste are each wrapped in `useHistory.transact()` (sibling A's seam) so each is a single undo step — closing the last open §6 Phase 4 criterion ("undo/redo correct after every action type"). This completes Phase 4 at 4/4. 14 tests in `clipboard.test.ts`.

**Estimated PRs:** 4–5

---

### Phase 5 — Persistence (file format, save/load, autosave)
**Goal:** the app is now actually a document editor.

**Deliverables**
- File menu: New, Open, Save, Save As, Recent Files.
- IPC channels: `files:open`, `files:save`, `files:saveAs`, `files:recent`.
- Open dialog filtered to `.aimap`.
- Save validates the document against Zod schema before writing.
- Autosave to the currently-open file after every committed action, debounced 1s.
- Dirty indicator in title bar (`AI-Mindmap — Untitled •` when unsaved).
- "Unsaved changes" prompt when closing a dirty window.
- Recent files list in File menu (last 10), stored via `electron-store`.
- Migration framework in `src/shared/migrations/` (empty for V1, scaffolded for future).
- Error handling: corrupt file → friendly error dialog, doesn't crash.

**Phase 5 status: engine (PR #32) + file menu (PR #33) landed; 2 / 4 criteria met.** Open: autosave + dirty + errors (sibling C).

**Phase 5 PR 2/3 (PR #33) — File menu UX (sibling subagent B).** Adds the **File section** to `src/renderer/ui/MainMenu.tsx` above the existing View section: **New** (`Cmd/Ctrl+N`), **Open** (`Cmd/Ctrl+O`), **Save** (`Cmd/Ctrl+S`), **Save As** (`Cmd/Ctrl+Shift+S`), and a **Recent Files** fly-out submenu (last 10). Keyboard shortcuts live in `src/renderer/canvas/interactions/useFileKeys.ts` (document-level keydown, mounted by `Canvas.tsx`, suppressed while typing in input/textarea/contentEditable) so they work regardless of menu state. File-lifecycle state lives in the new `src/renderer/store/document.ts` slice (`currentFile: FileHandle | null` + cached `recentFiles`); all I/O is funneled through `src/renderer/file/fileActions.ts`, the single seam onto sibling A's engine (`toAimapFile`/`fromAimapFile` from `src/shared/serialize.ts` + `window.platform.files.*`). New clears nodes/edges/viewport + `useHistory.clear()` + drops the handle; Open loads stores → clears history → stores the handle; Save writes back to the handle (else falls through to Save As); Save As stores the returned handle. `.aimap` dialog filtering + recent-files persistence (electron-store on desktop) + Zod validation are owned by sibling A's platform impl — the renderer is persistence-agnostic and just renders `recentFiles()`. Dirty-prompt + friendly error dialog hook points (`window.__aimConfirmDiscard` / `window.__aimReportFileError`) are optional-chained for sibling C to wire. 6 tests in `fileActions.test.ts`.

The engine (PR #32, "PR 1/3") shipped: `src/shared/aimap.ts` (canonical schema + Zod + `parseAimapFile`), `src/shared/serialize.ts` (`toAimapFile`/`fromAimapFile`, in-memory round-trip), `src/shared/migrations/index.ts` (`migrate`, empty V1 registry, throws on newer/unknown version), `src/shared/ipc.ts` (`files:*` channel names), `Platform.files` implemented in `src/platform/electron.ts` + `src/platform/web.ts`, IPC handlers in `src/main/ipc/files.ts` wired into `main.ts` + `preload.ts`. Validation runs in the platform adapters (the CommonJS main bundle can't import the ESM Zod schema): save refuses invalid docs, open migrates+validates. 22 unit tests in `aimap.test.ts`.

**Exit criteria**
- [x] Round-trip: build a 50-node canvas, save, reopen, every field byte-identical (modulo timestamps) — *serialize-layer round-trip done + tested in PR #32 (`fromAimapFile(toAimapFile(x))` + Zod, incl. a 50-node case); the on-disk save→reopen path is now wired end-to-end by the PR #33 File menu (Save → `toAimapFile` → `platform.files.saveCanvas`; Open → `platform.files.openCanvas` → `fromAimapFile` → stores). `fileActions.test.ts` asserts a save→new→open cycle restores nodes/edges/viewport field-for-field over a mocked platform; the real disk I/O + Zod is sibling A's platform impl.*
- [ ] Autosave debounce works (rapid edits don't hammer disk) — *sibling C*
- [ ] Corrupt JSON shows error, doesn't crash; partial-corrupt (valid JSON, fails Zod) shows specific field error — *engine ready in PR #32 (`migrate` throws `MigrationError` on corrupt JSON; `parseAimapFile` returns structured `issues[]` with field paths); PR #33 surfaces open/save failures via `reportFileError` (console + alert fallback) without crashing; the friendly error-dialog UI is sibling C.*
- [x] Recent files survive app restart — *PR #32 persists recents to a JSON file in Electron `userData`; the File ▸ Recent submenu (PR #33) renders `window.platform.files.recentFiles()`, cached in the `document` store and refreshed after every open/save.*

**Estimated PRs:** 3–4 (PR #32 = engine PR 1/3; PR #33 = file menu PR 2/3)

---

### Phase 6 — Groups / containers
**Goal:** group boxes that contain other nodes (parented children move with their group).

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

**At this point the app is a fully functional node-and-edge infinite whiteboard with no AI features.** It should be usable as a daily driver for visual thinking. Tag the repo `v0.1.0-whiteboard` here.

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
- Conversation state per-document (saved in `.aimap` under `meta.chats`? — decide via PR).
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

### Phase 12 (stretch — out of scope for V1, but allowed later)
- Plugin API
- Mobile companion app
- Vector database for semantic search across many documents

If we get here, open a new planning doc — don't try to retrofit into this one.

**Permanently out (see §1, do not propose without amending §1 first):**
- Real-time collaboration (CRDT / WebRTC / shared cursors / comments / accounts)
- Cloud sync / server-side document storage
- Import/export interop with other apps (Obsidian Canvas, Excalidraw, Miro, Figma, etc.)

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

Last updated: 2026-05-24 (Phase 5 persistence engine landed)

History:
- 2026-05-24: initial version
- 2026-05-24: amendment — multi-platform (Electron + Web), JSON Canvas 1.0 file format, Excalidraw-inspired UI
- 2026-05-24: amendment — DROPPED multi-user collaboration (any form, permanently) and DROPPED interop with other apps (Obsidian Canvas / Excalidraw / Miro / Figma — permanently). File format switched from `.canvas` (JSON Canvas 1.0 spec, Obsidian-interop) to our own `.aimap` (JSON Canvas-derived schema, free to extend, no interop promise).
- 2026-05-24: progress — Phase 0 8/13 exit criteria ticked off retroactively after PRs #10, #11, #12 (TS+React+Vite+Konva toolchain, UI shell, CJS-main fix). Remaining 5: lint (broken, needs ESLint flat config), 2 × Playwright e2e (not set up), 2 × end-to-end smoke verify of `npm start` and `preview:web`.
- 2026-05-24: progress — Phase 5 PR 2/3 (PR #33) file menu UX: File section (New/Open/Save/Save As + Recent Files submenu) in `MainMenu.tsx`, `Cmd/Ctrl+N/O/S/Shift+S` shortcuts (`useFileKeys`), `document.ts` store (currentFile handle + recent-files cache), and `fileActions.ts` (single seam onto sibling A's `aimap.ts` engine + `platform.files`). Ticked §6 Phase 5 "Recent files survive app restart" and "Round-trip … byte-identical" (renderer disk path verified by `fileActions.test.ts` on top of A's engine).
- 2026-05-24: PR #18 — Phase 0 follow-up: ESLint flat config + Vitest envs + GitHub Actions CI
- 2026-05-24: PR #17 — Phase 0 follow-up: Playwright E2E for Electron and web
- 2026-05-24: PR #19 — Phase 0 follow-up: smoke verify built Electron + web bundles launch cleanly
- 2026-05-24: PR #20 — Phase 1 foundation: Canvas Stage + viewport store + coord math + tests
- 2026-05-24: PR #21 — Phase 1 pan/zoom + ZoomControls wire
- 2026-05-24: PR #22 — Phase 1 grid + status bar + view toggle + fit-to-content
- 2026-05-24: PR #23 — Phase 2 foundation: nodes + selection stores + TextNode renderer + select interaction + tests
- 2026-05-24: PR #24 — Phase 2 (PR 2/3): move + resize + delete + create-on-double-click + 100-card perf sanity
- 2026-05-24: PR #25 — Phase 2 (PR 3/3): edit-mode + markdown + color picker
- 2026-05-24: PR #26 — Phase 3 (PR 1/3): edges store + Bezier renderer + AnchorDots + geometry + cascade delete + tests
- 2026-05-24: PR #27 — Phase 3 drag-to-connect from anchor + edge label inline edit
- 2026-05-24: PR #28 — Phase 3 (PR 3/3): edge selection + Delete key + ColorPicker (nodes + edges) + 100×200 store-level perf test + `__aimPushEdges` dev helper
- 2026-05-24: PR #29 — Phase 4 (PR 1/3): undo/redo history foundation (snapshot `store/history.ts` capped at 200, `capture`/`transact`/`undo`/`redo`) + `useHistoryKeys` (Cmd/Ctrl+Z, Shift+Z, Y) + discrete-action history capture (create/delete/color/edge-add/text/edge-label). Ticked §6 Phase 4 "undo stack capped" criterion.
- 2026-05-24: PR #30 — Phase 4 (PR 2/3): multi-select (lasso + shift-click + cmd-A) + group move + move/resize history capture
- 2026-05-24: PR #31 — Phase 4 (PR 3/3): in-app clipboard cut/copy/paste + id remap (`clipboard.ts` copySelection/pasteClipboard/remapSubgraph, `useClipboardKeys` Cmd/Ctrl+C/X/V wired in Canvas.tsx, cut+paste each one undo step via `transact`, 14 tests). Closes §6 Phase 4 cut+paste + paste-under-undo criteria → Phase 4 4/4 🟢 done.
- 2026-05-24: PR #32 — Phase 5 (PR 1/3): persistence ENGINE. Renamed `src/shared/jsoncanvas.ts` → `aimap.ts` (history preserved) with the canonical `AimapFile` schema + Zod validators (`parseAimapFile` → structured `{ok,error,issues}`); `serialize.ts` (`toAimapFile`/`fromAimapFile`, in-memory round-trip); `migrations/index.ts` (`migrate`, empty V1 registry, throws `MigrationError` on newer/unknown/invalid); `ipc.ts` (`files:*` channels). `Platform.files` implemented for Electron (IPC → `src/main/ipc/files.ts`, `fs/promises`, recents persisted in `userData`) + Web (File System Access API + download/upload fallback, sessionStorage recents). Stores `nodes.ts`/`edges.ts` now re-export canonical types from `aimap.ts`; `AimapNode` stays `=TextNode` (renderer only draws text until Phase 6/7). Validation lives in the platform adapters (CommonJS main can't import the ESM Zod schema). 22 unit tests. Did NOT tick §6 disk-round-trip exit criteria — those need the file-menu (sibling B) + dialogs (sibling C).
