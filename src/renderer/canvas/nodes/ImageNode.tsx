// Konva renderer for an ImageNode.
//
// V1 stores the bitmap as a data URL in `node.file` (works on both Electron
// and web with no open-document dependency). Disk-asset extraction into
// `<file>.aimap.assets/` is a documented follow-up (see DEVELOPMENT_PLAN §6
// Phase 7) — the schema field is the same `string`, so moving to relative
// paths later is a non-breaking change.
//
// Resize keeps the image's aspect ratio by default (Shift to free-resize is a
// follow-up); we render the same 8-handle affordance as text cards but clamp
// height to width * intrinsicAspect.

import { useEffect, useMemo, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Image as KonvaImage, Rect } from "react-konva";
import type { ImageNode } from "../../store/nodes.js";
import { useNodes } from "../../store/nodes.js";
import { useViewport } from "../../store/viewport.js";
import { useHistory } from "../../store/history.js";
import {
  computeResize,
  handleCursor,
  handlePosition,
  RESIZE_HANDLES,
  type ResizeHandle,
} from "../interactions/resize.js";
import { useNodeDrag } from "./useNodeDrag.js";
import { useResolvedTheme } from "../../theme/useResolvedTheme.js";
import { resolveNodeStyle } from "./nodeStyle.js";

const SELECTED_BORDER_COLOR = "#6965db";
const HANDLE_SCREEN_SIZE = 10;

/** Load `src` into an HTMLImageElement once; re-load when src changes. */
function useHtmlImage(src: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = new window.Image();
    let live = true;
    el.onload = () => {
      if (live) setImg(el);
    };
    el.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  return img;
}

export interface ImageNodeBoxProps {
  node: ImageNode;
  selected: boolean;
  onSelect?: (e: KonvaEventObject<MouseEvent>) => void;
}

export function ImageNodeBox({ node, selected, onSelect }: ImageNodeBoxProps) {
  const img = useHtmlImage(node.file);
  const zoom = useViewport((s) => s.zoom);
  const theme = useResolvedTheme();
  const style = resolveNodeStyle(node, theme, "image");
  // Images stay borderless by default (clean look). A border only appears when
  // the user explicitly sets a stroke color; we detect that via the raw field
  // rather than the resolved value (which always carries a theme default).
  const hasCustomStroke = node.strokeColor != null;
  const drag = useNodeDrag(node.id);
  const handles = useMemo(() => RESIZE_HANDLES, []);
  const handleCanvasSize = HANDLE_SCREEN_SIZE / zoom;
  const aspectRef = useRef<number | null>(null);
  if (img && aspectRef.current === null && img.naturalWidth > 0) {
    aspectRef.current = img.naturalHeight / img.naturalWidth;
  }

  const pointerHandlers = onSelect
    ? {
        onMouseDown: onSelect,
        onTouchStart: onSelect as unknown as (
          e: KonvaEventObject<TouchEvent>,
        ) => void,
      }
    : {};

  const onHandleDragMove = (handle: ResizeHandle) =>
    (e: KonvaEventObject<DragEvent>) => {
      const stage = e.target.getStage();
      const pointer = stage?.getPointerPosition();
      if (!pointer) return;
      const v = useViewport.getState();
      const cursor = { x: (pointer.x - v.x) / v.zoom, y: (pointer.y - v.y) / v.zoom };
      const live = useNodes.getState().nodes.find((n) => n.id === node.id);
      if (!live) return;
      const r = computeResize(handle, live, cursor);
      // Lock aspect ratio: derive height from width.
      const aspect = aspectRef.current ?? live.height / live.width;
      const width = Math.max(1, Math.round(r.width));
      const height = Math.max(1, Math.round(width * aspect));
      useNodes
        .getState()
        .resizeNode(
          node.id,
          width,
          height,
          r.x !== undefined ? Math.round(r.x) : undefined,
          r.y !== undefined ? Math.round(r.y) : undefined,
        );
    };

  return (
    <Group
      x={node.x}
      y={node.y}
      name="image-node"
      id={node.id}
      draggable
      opacity={style.opacity}
      onDragStart={drag.onDragStart}
      onDragMove={drag.onDragMove}
      onDragEnd={drag.onDragEnd}
      {...pointerHandlers}
    >
      {img ? (
        <KonvaImage image={img} width={node.width} height={node.height} />
      ) : (
        // Placeholder while the bitmap decodes — themed surface, not a fixed
        // light slate, so it doesn't flash white in dark mode.
        <Rect
          width={node.width}
          height={node.height}
          fill={style.fill}
          cornerRadius={6}
        />
      )}
      <Rect
        width={node.width}
        height={node.height}
        cornerRadius={6}
        stroke={
          selected
            ? SELECTED_BORDER_COLOR
            : hasCustomStroke
              ? style.stroke
              : "transparent"
        }
        strokeWidth={selected ? 2 : hasCustomStroke ? style.strokeWidth : 0}
        {...(!selected && hasCustomStroke && style.dash ? { dash: style.dash } : {})}
        strokeScaleEnabled={false}
        listening={false}
      />
      {selected
        ? handles.map((h) => {
            const pos = handlePosition(h, node.width, node.height);
            const half = handleCanvasSize / 2;
            const cursor = handleCursor(h);
            return (
              <Rect
                key={h}
                x={pos.x - half}
                y={pos.y - half}
                width={handleCanvasSize}
                height={handleCanvasSize}
                fill="#ffffff"
                stroke="#6965db"
                strokeWidth={1.5}
                strokeScaleEnabled={false}
                draggable
                onDragStart={() => useHistory.getState().capture()}
                onDragMove={onHandleDragMove(h)}
                onMouseEnter={(e) => {
                  const c = e.target.getStage()?.container();
                  if (c) c.style.cursor = cursor;
                }}
                onMouseLeave={(e) => {
                  const c = e.target.getStage()?.container();
                  if (c) c.style.cursor = "";
                }}
              />
            );
          })
        : null}
    </Group>
  );
}

export default ImageNodeBox;
