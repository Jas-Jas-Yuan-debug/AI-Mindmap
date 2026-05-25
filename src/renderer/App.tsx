import { Canvas } from "./canvas/Canvas.js";
import { Chrome } from "./ui/Chrome.js";
import { NodeOverlayLayer } from "./ui/NodeOverlayLayer.js";
import { GroupOverlayLayer } from "./ui/GroupOverlayLayer.js";
import { EdgeLabelOverlayLayer } from "./ui/EdgeLabelOverlayLayer.js";
import { ErrorDialog } from "./ui/ErrorDialog.js";
import { UnsavedChangesDialog } from "./ui/UnsavedChangesDialog.js";
import { useAutosave } from "./persistence/useAutosave.js";
import { useDocumentTitle } from "./persistence/useDocumentTitle.js";

// Phase 5 PR 3/3 (sibling C): document-lifecycle side effects, kept in a tiny
// component so the hooks have a render context without adding state to App.
//   - useAutosave():      debounced write-back to the backing file on edits.
//   - useDocumentTitle():  reflect filename + dirty bullet into document.title.
function DocumentLifecycle() {
  useAutosave();
  useDocumentTitle();
  return null;
}

// App is a thin shell. Layer composition (back → front):
//   <Canvas />               — Konva Stage, owns viewport / pan / zoom /
//                              card rects / edges / edge-draft ghost.
//   <NodeOverlayLayer />     — HTML overlays per node: react-markdown view +
//                              edit-mode textarea + right-click color picker.
//                              Tracks the viewport via store subscriptions so
//                              overlays stay aligned with the Konva cards
//                              during pan/zoom. Wrapper is pointer-events:
//                              none so the Konva Stage still handles
//                              empty-canvas clicks.
//   <EdgeLabelOverlayLayer />— HTML pill badges over edge midpoints +
//                              dblclick-to-edit textarea (Phase 3 PR 2).
//                              Same pointer-events: none discipline.
//   <Chrome />               — Floating Islands (z: 100): main menu, toolbar,
//                              zoom controls, status bar, etc.
//
// App.tsx itself holds no canvas state — that responsibility lives in the
// canvas/ directory and the Zustand slices.
export default function App() {
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <Canvas />
      <NodeOverlayLayer />
      {/* Phase 6 PR 3/3 (sibling C): group label-edit (double-click header) +
          group right-click color picker. Groups-only; text overlays stay in
          NodeOverlayLayer. */}
      <GroupOverlayLayer />
      <EdgeLabelOverlayLayer />
      <Chrome />
      {/* Phase 5 PR 3/3 (sibling C): autosave + dirty title, and the two file
          dialogs (unsaved-changes prompt + friendly error). The dialogs render
          nothing until their window seam is invoked. */}
      <DocumentLifecycle />
      <UnsavedChangesDialog />
      <ErrorDialog />
    </div>
  );
}
