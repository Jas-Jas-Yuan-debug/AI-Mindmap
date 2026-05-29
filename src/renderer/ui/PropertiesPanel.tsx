// Excalidraw-style properties panel for the current node selection.
//
// Task: subagent B (Phase: node styling). Shown FIXED on the LEFT edge, below
// the main menu (the chat sidebar owns the right edge), whenever ≥1 node is
// selected. Renders null otherwise so it never blocks empty-canvas clicks.
//
// Sections (top→bottom), each applying to ALL selected nodes as ONE undo step:
//   描边 (Stroke)        → strokeColor   (6 presets + custom <input type=color>)
//   背景 (Background)     → backgroundColor (transparent chip + presets + custom)
//   字体颜色 (Text)       → fontColor     (presets + custom; text/link/file nodes)
//   描边宽度 (Width)      → strokeWidth   (1 | 2 | 4)
//   边框样式 (Border)     → strokeStyle   ("solid" | "dashed" | "dotted")
//   边角 (Corners)        → roundness     ("sharp" | "round")
//   透明度 (Opacity)      → opacity       (0..100 range slider)
//   图层 (Layer)          → reorder selected nodes in useNodes().nodes (z-order)
//
// Contract (style schema + resolver — landed on main with the dark-mode fix):
// `NodeBase` (src/shared/aimap.ts) carries the optional fields above, with
// `StrokeWidth` (1|2|4), `StrokeStyle` ("solid"|"dashed"|"dotted") and
// `Roundness` ("sharp"|"round") exported from there and re-exported through the
// nodes store. The canonical `PRESET_COLOR_MAP` + `resolveColor` live in
// `../canvas/nodes/nodeStyle.ts`, re-exported from TextNode.tsx — we import the
// re-export so existing import sites stay stable. `resolveNodeStyle` reads the
// fields we write here.
//
// Each change wraps its updateNode batch in `useHistory.getState().transact`
// so a click on a swatch / button collapses the whole multi-node update into a
// single undo step. (`transact` captures exactly once, then runs the batch —
// the call-site-owns-history pattern used across the renderer.)

import { useMemo } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useNodes } from "../store/nodes.js";
import type {
  AimapNode,
  Color,
  PresetColor,
  StrokeWidth,
  StrokeStyle,
  Roundness,
  ShapeNode,
  LinearNode,
} from "../store/nodes.js";
import { useSelection } from "../store/selection.js";
import { useHistory } from "../store/history.js";
import { PRESET_COLOR_MAP } from "../canvas/nodes/TextNode.js";
import type { LayerAction } from "../canvas/layerOrder.js";
// Panels.css provides the shared .aim-swatch / .aim-swatch--none disc styles
// (from SettingsDialog); import it here so the panel is self-contained
// regardless of which other panels happen to be mounted.
import "./Panels.css";
import "./PropertiesPanel.css";

// ---------------------------------------------------------------------------
// V2 follow-up augmented types.
// The spine (FU1/FU2/FU3 agents in the V2-followups build) adds:
//   ShapeNode.text?: string     — in-shape text label
//   LinearNode.curved?: boolean — Catmull-Rom curved rendering
// We declare local augmented intersections so the panel can type-safely read
// and write these fields without waiting for the shared aimap.ts to be updated
// in a separate PR. When the shared types land these become a no-op extension.
// ---------------------------------------------------------------------------

/** ShapeNode extended with the V2 in-shape text label field. */
type ShapeNodeV2 = ShapeNode & { text?: string };
/** LinearNode extended with the V2 curved flag (already in aimap.ts). */
type LinearNodeV2 = LinearNode & { curved?: boolean };

// ---------------------------------------------------------------------------
// Style field types. These are the canonical per-node style fields defined on
// `NodeBase` in `src/shared/aimap.ts` (the dark-mode-fix foundation, now on
// main) and re-exported through the nodes store. `StrokeWidth` / `StrokeStyle`
// / `Roundness` come straight from that contract; we just narrow the writable
// subset here so the panel only touches styling fields.
// ---------------------------------------------------------------------------

/** The styleable fields the panel writes (subset of `NodeBase`). */
interface StyleFields {
  backgroundColor?: Color;
  strokeColor?: Color;
  fontColor?: Color;
  strokeWidth?: StrokeWidth;
  strokeStyle?: StrokeStyle;
  opacity?: number;
  roundness?: Roundness;
}

// Every AimapNode already carries the optional StyleFields (they live on
// NodeBase), so a plain AimapNode is sufficient — no intersection needed.
type StyledNode = AimapNode;

const PRESETS: PresetColor[] = ["1", "2", "3", "4", "5", "6"];

// Node types that carry text → the 字体颜色 (font color) section applies.
const TEXT_BEARING: ReadonlySet<string> = new Set(["text", "link", "file"]);

/** Resolve a Color (preset id or hex) to a concrete hex for the swatch UI. */
function colorHex(c: Color | undefined): string | undefined {
  if (!c) return undefined;
  if (typeof c === "string" && c.startsWith("#")) return c;
  return PRESET_COLOR_MAP[c as PresetColor];
}

export function PropertiesPanel() {
  // Subscribe to the selection map AND the nodes array so the panel re-renders
  // when either changes (selecting a different node should refresh the active
  // swatches; restyling should re-highlight them).
  const selectionIds = useSelection((s) => s.ids);
  const nodes = useNodes((s) => s.nodes);

  const selectedIds = useMemo(() => Object.keys(selectionIds), [selectionIds]);

  const selectedNodes = useMemo(
    () => nodes.filter((n) => selectionIds[n.id]) as StyledNode[],
    [nodes, selectionIds],
  );

  // The "active value" we highlight is read from the FIRST selected node.
  const primary = selectedNodes[0];

  // Whether the selection contains any text-bearing node (gates the font
  // color section — coloring a group's text makes no sense).
  const hasTextNode = useMemo(
    () => selectedNodes.some((n) => TEXT_BEARING.has(n.type)),
    [selectedNodes],
  );

  if (selectedIds.length === 0 || !primary) return null;

  // --- Mutation helpers -----------------------------------------------------

  /** Apply a shallow patch to every selected node as one undo step. */
  const patchAll = (patch: Partial<StyleFields>) => {
    useHistory.getState().transact(() => {
      const update = useNodes.getState().updateNode;
      for (const id of selectedIds) {
        update(id, patch as Partial<AimapNode>);
      }
    });
  };

  /**
   * Clear a style field from every selected node (drop the key entirely so
   * exactOptionalPropertyTypes stays happy — mirrors ColorPicker's approach).
   */
  const clearField = (field: keyof StyleFields) => {
    useHistory.getState().transact(() => {
      useNodes.setState((s) => ({
        nodes: s.nodes.map((n) => {
          if (!selectionIds[n.id]) return n;
          const next = { ...n } as Record<string, unknown>;
          delete next[field];
          return next as unknown as AimapNode;
        }),
      }));
    });
  };

  /**
   * Reorder the selected node(s) within the nodes array (z-order) via the
   * `reorderLayer` store action, wrapped in one `transact` so it's a single
   * undo step (same call-site-owns-history pattern as `deleteNode`).
   */
  const applyLayer = (action: LayerAction) => {
    useHistory.getState().transact(() => {
      useNodes.getState().reorderLayer(action, selectedIds);
    });
  };

  const strokeActive = colorHex(primary.strokeColor);
  const bgActive = colorHex(primary.backgroundColor);
  const fontActive = colorHex(primary.fontColor);
  const widthActive: StrokeWidth = primary.strokeWidth ?? 1;
  const styleActive: StrokeStyle = primary.strokeStyle ?? "solid";
  const cornerActive: Roundness = primary.roundness ?? "sharp";
  const opacityActive: number =
    primary.opacity === undefined ? 100 : primary.opacity;

  return (
    <aside
      className="aim-props"
      aria-label="Selection properties"
      // Re-enable pointer events (parent chrome is pointer-events: none in
      // spirit; this panel is its own fixed element so it captures clicks).
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="aim-props__scroll">
        {/* 描边 — Stroke color ------------------------------------------- */}
        <ColorSection
          title="描边"
          presets={PRESETS}
          activeHex={strokeActive}
          onPick={(c) => patchAll({ strokeColor: c })}
        />

        {/* 背景 — Background color (with transparent/none) --------------- */}
        <ColorSection
          title="背景"
          presets={PRESETS}
          activeHex={bgActive}
          allowNone
          noneActive={primary.backgroundColor === undefined}
          onNone={() => clearField("backgroundColor")}
          onPick={(c) => patchAll({ backgroundColor: c })}
        />

        {/* 字体颜色 — Font color (text/link/file only) ------------------- */}
        {hasTextNode && (
          <ColorSection
            title="字体颜色"
            presets={PRESETS}
            activeHex={fontActive}
            onPick={(c) => patchAll({ fontColor: c })}
          />
        )}

        {/* 描边宽度 — Stroke width -------------------------------------- */}
        <section className="aim-props__section">
          <h3 className="aim-props__title">描边宽度</h3>
          <div className="aim-props__row" role="group" aria-label="Stroke width">
            {([1, 2, 4] as StrokeWidth[]).map((w, i) => (
              <button
                key={w}
                type="button"
                className={`aim-props__btn${widthActive === w ? " is-active" : ""}`}
                aria-pressed={widthActive === w}
                title={["细", "粗", "特粗"][i]}
                onClick={() => patchAll({ strokeWidth: w })}
              >
                <span
                  className="aim-props__stroke-preview"
                  style={{ height: `${w}px` }}
                />
              </button>
            ))}
          </div>
        </section>

        {/* 边框样式 — Border style -------------------------------------- */}
        <section className="aim-props__section">
          <h3 className="aim-props__title">边框样式</h3>
          <div className="aim-props__row" role="group" aria-label="Border style">
            {(["solid", "dashed", "dotted"] as StrokeStyle[]).map((st) => (
              <button
                key={st}
                type="button"
                className={`aim-props__btn${styleActive === st ? " is-active" : ""}`}
                aria-pressed={styleActive === st}
                title={
                  st === "solid" ? "实线" : st === "dashed" ? "虚线" : "点线"
                }
                onClick={() => patchAll({ strokeStyle: st })}
              >
                <span
                  className="aim-props__border-preview"
                  style={{
                    borderBottomStyle: st,
                  }}
                />
              </button>
            ))}
          </div>
        </section>

        {/* 边角 — Corners ----------------------------------------------- */}
        <section className="aim-props__section">
          <h3 className="aim-props__title">边角</h3>
          <div className="aim-props__row" role="group" aria-label="Corners">
            {(["sharp", "round"] as Roundness[]).map((r) => (
              <button
                key={r}
                type="button"
                className={`aim-props__btn${cornerActive === r ? " is-active" : ""}`}
                aria-pressed={cornerActive === r}
                title={r === "sharp" ? "直角" : "圆角"}
                onClick={() => patchAll({ roundness: r })}
              >
                <span
                  className="aim-props__corner-preview"
                  style={{ borderRadius: r === "round" ? "6px" : "0" }}
                />
              </button>
            ))}
          </div>
        </section>

        {/* 透明度 — Opacity --------------------------------------------- */}
        <section className="aim-props__section">
          <div className="aim-props__title-row">
            <h3 className="aim-props__title">透明度</h3>
            <span className="aim-props__value">{opacityActive}%</span>
          </div>
          <input
            className="aim-props__slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={opacityActive}
            aria-label="Opacity"
            onChange={(e) => patchAll({ opacity: Number(e.target.value) })}
          />
        </section>

        {/* 文字 — In-shape text label (single shape node only) ---------- */}
        {selectedIds.length === 1 && primary.type === "shape" && (
          <section className="aim-props__section">
            <h3 className="aim-props__title">文字</h3>
            <input
              className="aim-props__text-input"
              type="text"
              placeholder="标签文字…"
              aria-label="Shape text label"
              value={(primary as ShapeNodeV2).text ?? ""}
              onChange={(e) => {
                const text: string = e.target.value;
                useHistory.getState().transact(() => {
                  useNodes.getState().updateNode(primary.id, { text } as Partial<AimapNode>);
                });
              }}
            />
          </section>
        )}

        {/* 曲线 — Curved flag (single linear node only) ---------------- */}
        {selectedIds.length === 1 && primary.type === "linear" && (
          <section className="aim-props__section">
            <h3 className="aim-props__title">线条</h3>
            <label className="aim-props__checkbox-row">
              <input
                type="checkbox"
                checked={(primary as LinearNodeV2).curved ?? false}
                aria-label="Curved line"
                onChange={(e) => {
                  const curved: boolean = e.target.checked;
                  useHistory.getState().transact(() => {
                    useNodes.getState().updateNode(primary.id, { curved } as Partial<AimapNode>);
                  });
                }}
              />
              <span>曲线</span>
            </label>
          </section>
        )}

        {/* 图层 — Layer (z-order) --------------------------------------- */}
        <section className="aim-props__section">
          <h3 className="aim-props__title">图层</h3>
          <div className="aim-props__row" role="group" aria-label="Layer order">
            <button
              type="button"
              className="aim-props__btn"
              title="移至最底层"
              aria-label="Send to back"
              onClick={() => applyLayer("back")}
            >
              <ArrowDownToLine size={15} />
            </button>
            <button
              type="button"
              className="aim-props__btn"
              title="下移一层"
              aria-label="Send backward"
              onClick={() => applyLayer("backward")}
            >
              <ChevronDown size={15} />
            </button>
            <button
              type="button"
              className="aim-props__btn"
              title="上移一层"
              aria-label="Bring forward"
              onClick={() => applyLayer("forward")}
            >
              <ChevronUp size={15} />
            </button>
            <button
              type="button"
              className="aim-props__btn"
              title="移至最顶层"
              aria-label="Bring to front"
              onClick={() => applyLayer("front")}
            >
              <ArrowUpToLine size={15} />
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Reusable color section: 6 preset swatches + optional none chip + a native
// custom color input. Highlights the active swatch by comparing resolved hex.
// ---------------------------------------------------------------------------

interface ColorSectionProps {
  title: string;
  presets: PresetColor[];
  /** Resolved hex of the active color on the primary node (for highlight). */
  activeHex: string | undefined;
  onPick: (c: Color) => void;
  /** Show a "transparent/none" chip first (background section). */
  allowNone?: boolean;
  noneActive?: boolean;
  onNone?: () => void;
}

function ColorSection({
  title,
  presets,
  activeHex,
  onPick,
  allowNone = false,
  noneActive = false,
  onNone,
}: ColorSectionProps) {
  // A preset is "active" when its hex matches the resolved active hex AND the
  // none chip isn't the active one.
  const matchesPreset = (p: PresetColor) =>
    !noneActive &&
    activeHex !== undefined &&
    PRESET_COLOR_MAP[p].toLowerCase() === activeHex.toLowerCase();

  // The custom <input type=color> reflects the active hex (or a neutral
  // default). When the active color is a preset, we still show its hex so the
  // user can tweak it into a custom value.
  const customValue = activeHex ?? "#000000";

  return (
    <section className="aim-props__section">
      <h3 className="aim-props__title">{title}</h3>
      <div className="aim-props__swatches" role="group" aria-label={title}>
        {allowNone && (
          <button
            type="button"
            className={`aim-swatch aim-swatch--none${noneActive ? " is-active" : ""}`}
            title="透明 / 无"
            aria-label="Transparent"
            aria-pressed={noneActive}
            onClick={onNone}
          />
        )}
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            className={`aim-swatch${matchesPreset(p) ? " is-active" : ""}`}
            style={{ background: PRESET_COLOR_MAP[p] }}
            title={`颜色 ${p}`}
            aria-label={`Color ${p}`}
            aria-pressed={matchesPreset(p)}
            onClick={() => onPick(p)}
          />
        ))}
        <label
          className="aim-props__custom"
          title="自定义颜色"
          aria-label="Custom color"
        >
          <input
            type="color"
            value={customValue}
            onChange={(e) => onPick(e.target.value as Color)}
          />
        </label>
      </div>
    </section>
  );
}

export default PropertiesPanel;
