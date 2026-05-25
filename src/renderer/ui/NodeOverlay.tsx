// Per-node HTML overlay component (Phase 2 PR 3 — sibling subagent C).
//
// One <NodeOverlay> renders over each TextNode card the Konva Stage paints.
// It owns two visual modes:
//
//   1. Read mode (default) — renders the node's `text` as Markdown via
//      `react-markdown` + `remark-gfm`. The wrapper is pointer-events: none
//      so every DOM event passes through to the underlying Konva Stage —
//      left-clicks, drags, even wheel events. The parent
//      NodeOverlayLayer hooks window-level dblclick + contextmenu listeners
//      that hit-test against node rects to decide whether to enter edit
//      mode (sets `editingId`) or open the color picker. This keeps Konva's
//      drag and select machinery un-disturbed.
//
//   2. Edit mode — a full-bleed <textarea>, focused on entry. pointer-events
//      are auto so the user can type. Commits on Esc, blur, or
//      Cmd/Ctrl+Enter via useNodes.updateNode(id, { text }). Esc cancels
//      without committing.
//
// Auto-edit-on-create: sibling B's create-on-double-click flow writes the
// new card id into the selection store via `setPendingEdit`. On mount,
// each overlay calls `consumePendingEdit()` (optional-chained — graceful
// no-op if the field doesn't exist) and if its node id matches, enters
// edit mode immediately so the user can type right away.
//
// Markdown rendering uses react-markdown which never uses
// dangerouslySetInnerHTML — that's the security guarantee plan §2 demands.

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useNodes, type TextNode } from "../store/nodes.js";
import { useSelection } from "../store/selection.js";
import { useHistory } from "../store/history.js";
import "./NodeOverlay.css";

export interface NodeOverlayProps {
  node: TextNode;
  /** Screen-space rect computed by NodeOverlayLayer. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** True when the user is editing this overlay's node. */
  editing: boolean;
  /** Called when the overlay wants to leave edit mode (after commit / cancel). */
  onExitEdit: () => void;
}

// The selection store may grow `consumePendingEdit` from sibling B's PR
// (Phase 2 PR 2 — create-on-double-click). We optional-chain because the
// typed interface in selection.ts pre-B doesn't declare it; once B merges,
// the optional chain still works.
interface MaybePendingEditAPI {
  consumePendingEdit?: () => string | null | undefined;
}

export function NodeOverlay({
  node,
  left,
  top,
  width,
  height,
  editing,
  onExitEdit,
}: NodeOverlayProps) {
  // Local edit buffer — we don't write to the store on every keystroke so
  // the canvas doesn't re-render 60 times per second on typing. The store
  // update happens once on commit.
  const [draft, setDraft] = useState(node.text);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync draft and focus when edit mode begins.
  useEffect(() => {
    if (!editing) return;
    setDraft(node.text);
    const t = setTimeout(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.select();
    }, 0);
    return () => clearTimeout(t);
    // Intentionally not depending on node.text — re-syncing while the user
    // is mid-edit would clobber their input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const commit = useCallback(() => {
    if (draft !== node.text) {
      // Phase 4 PR 1: text isn't written to the store on every keystroke
      // (the edit buffer is local `draft` state — see above), so the store
      // still holds the PRE-edit text at this point. Capturing immediately
      // before the single commit-time `updateNode` records exactly the
      // pre-edit document, giving a correct single-step undo. (If text were
      // written live we'd instead capture on edit-START.)
      useHistory.getState().capture();
      useNodes.getState().updateNode(node.id, { text: draft });
    }
    onExitEdit();
  }, [draft, node.id, node.text, onExitEdit]);

  const cancel = useCallback(() => {
    setDraft(node.text);
    onExitEdit();
  }, [node.text, onExitEdit]);

  // Esc cancels (doesn't commit); Cmd/Ctrl+Enter commits explicitly.
  // Plain Enter inserts a newline (textarea default).
  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    }
  };

  return (
    <div
      className="aim-node-overlay"
      style={{ left, top, width, height }}
      data-node-id={node.id}
    >
      {editing ? (
        <textarea
          ref={textareaRef}
          className="aim-node-overlay__edit"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          // Block context menu inside the textarea so right-click doesn't
          // open the color picker while editing.
          onContextMenu={(e) => e.stopPropagation()}
          // Block mousedown propagation so the window-level click-outside
          // listener in ColorPicker (also mousedown) doesn't see our typing.
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="Card text"
        />
      ) : (
        <div className="aim-node-overlay__read" aria-live="polite">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {node.text || ""}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

// Re-export the pending-edit type so NodeOverlayLayer can use the same
// optional-chain shape without redeclaring it.
export type { MaybePendingEditAPI };

/**
 * Helper for NodeOverlayLayer mount-effect: consume any pending-edit id
 * left by sibling B's create-on-double-click flow. Graceful no-op if the
 * store doesn't have the method yet (pre-B-merge).
 */
export function consumePendingEdit(): string | null | undefined {
  const sel = useSelection.getState() as unknown as MaybePendingEditAPI;
  return sel.consumePendingEdit?.();
}
