// Konva renderer for a LinkNode: a rounded card showing the page title (or
// host fallback) + the URL, with an optional favicon.
//
// Opening the URL:
//   - PRIMARY (reliable): a window-level DOM dblclick listener in
//     `ui/LinkOverlayLayer.tsx` opens the hit link node. This mirrors how text
//     nodes / groups / edge labels get their dblclick — a Konva Group with
//     `draggable` fires `onDblClick` only inconsistently (a micro pointer move
//     during the double-click registers as a drag and resets Konva's click
//     pairing), which is why double-clicking a link "did nothing".
//   - VISIBLE AFFORDANCE: an "open ↗" pill drawn in the card's top-right
//     corner whenever the node is selected or hovered. A SINGLE click on it
//     opens the URL — discoverable, and not dependent on dblclick at all.
//   - FALLBACK: the Konva Group keeps `onDblClick` / `onDblTap` wired to the
//     same opener for the cases where Konva does fire it (e.g. touch dbltap).
//
// All three routes funnel through `openLinkUrl` (see ./openLink.ts), which
// normalizes scheme-less hosts (`baidu.com` → `https://baidu.com`) and rejects
// non-http(s) schemes.

import { useEffect, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Rect, Text, Image as KonvaImage } from "react-konva";
import type { LinkNode } from "../../store/nodes.js";
import { urlDisplayName } from "../../import/importClassify.js";
import { useNodeDrag } from "./useNodeDrag.js";
// NOTE(A): colors only — theme-aware fill/stroke/text. Sibling D owns the
// onDblClick / open-URL behavior; left untouched.
import { useResolvedTheme } from "../../theme/useResolvedTheme.js";
import { resolveNodeStyle } from "./nodeStyle.js";
import { openLinkUrl } from "./openLink.js";

const SELECTED_BORDER_COLOR = "#6965db";
// URL line keeps the brand link color across themes (reads as a hyperlink).
const URL_LINK_COLOR = "#6965db";

// "open ↗" affordance geometry.
const OPEN_BTN_WIDTH = 52;
const OPEN_BTN_HEIGHT = 20;
const OPEN_BTN_MARGIN = 8;

function useFavicon(src: string | undefined): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src || typeof window === "undefined") {
      setImg(null);
      return;
    }
    const el = new window.Image();
    let live = true;
    el.onload = () => live && setImg(el);
    el.onerror = () => live && setImg(null);
    el.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  return img;
}

export interface LinkNodeBoxProps {
  node: LinkNode;
  selected: boolean;
  onSelect?: (e: KonvaEventObject<MouseEvent>) => void;
}

export function LinkNodeBox({ node, selected, onSelect }: LinkNodeBoxProps) {
  const drag = useNodeDrag(node.id);
  const favicon = useFavicon(node.favicon);
  const theme = useResolvedTheme();
  const style = resolveNodeStyle(node, theme, "link");
  const title = node.title || urlDisplayName(node.url);
  const [hovered, setHovered] = useState(false);

  const pointerHandlers = onSelect
    ? {
        onMouseDown: onSelect,
        onTouchStart: onSelect as unknown as (
          e: KonvaEventObject<TouchEvent>,
        ) => void,
      }
    : {};

  const open = () => {
    openLinkUrl(node.url);
  };

  // Single-click on the "open ↗" pill opens the URL. Stop propagation so the
  // click doesn't also start a node drag / selection gesture, and so the
  // Stage's empty-canvas handlers never see it.
  const onOpenClick = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    open();
  };
  const onOpenTap = (e: KonvaEventObject<Event>) => {
    e.cancelBubble = true;
    open();
  };

  const hasIcon = Boolean(favicon);
  const textLeft = hasIcon ? 40 : 16;
  const showOpen = selected || hovered;
  const openBtnX = node.width - OPEN_BTN_WIDTH - OPEN_BTN_MARGIN;

  return (
    <Group
      x={node.x}
      y={node.y}
      name="link-node"
      id={node.id}
      draggable
      opacity={style.opacity}
      onDragStart={drag.onDragStart}
      onDragMove={drag.onDragMove}
      onDragEnd={drag.onDragEnd}
      // Konva fallback opener (primary path is the window-level dblclick in
      // ui/LinkOverlayLayer.tsx; touch dbltap still routes here).
      onDblClick={open}
      onDblTap={open}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...pointerHandlers}
    >
      <Rect
        width={node.width}
        height={node.height}
        cornerRadius={style.cornerRadius}
        fill={style.fill}
        stroke={selected ? SELECTED_BORDER_COLOR : style.stroke}
        strokeWidth={selected ? 2 : style.strokeWidth}
        {...(!selected && style.dash ? { dash: style.dash } : {})}
        strokeScaleEnabled={false}
      />
      {favicon ? (
        <KonvaImage image={favicon} x={14} y={16} width={16} height={16} listening={false} />
      ) : null}
      <Text
        x={textLeft}
        y={14}
        width={node.width - textLeft - 12}
        text={title}
        fontSize={14}
        fontStyle="bold"
        fontFamily="system-ui, sans-serif"
        fill={style.fontColor}
        ellipsis
        wrap="none"
        listening={false}
      />
      <Text
        x={16}
        y={node.height - 28}
        width={node.width - 28}
        text={node.url}
        fontSize={12}
        fontFamily="system-ui, sans-serif"
        fill={URL_LINK_COLOR}
        ellipsis
        wrap="none"
        listening={false}
      />
      {/* Visible "open ↗" affordance — a single click opens the URL. Shown on
          hover or while selected so it stays discoverable without cluttering
          unfocused cards. */}
      {showOpen ? (
        <Group
          x={openBtnX}
          y={OPEN_BTN_MARGIN}
          name="link-open-btn"
          onClick={onOpenClick}
          onTap={onOpenTap}
          onMouseEnter={() => setHovered(true)}
        >
          <Rect
            width={OPEN_BTN_WIDTH}
            height={OPEN_BTN_HEIGHT}
            cornerRadius={OPEN_BTN_HEIGHT / 2}
            fill={URL_LINK_COLOR}
            shadowColor="#000000"
            shadowOpacity={0.18}
            shadowBlur={3}
            shadowOffsetY={1}
          />
          <Text
            x={0}
            y={0}
            width={OPEN_BTN_WIDTH}
            height={OPEN_BTN_HEIGHT}
            text="open ↗"
            fontSize={11}
            fontStyle="bold"
            fontFamily="system-ui, sans-serif"
            fill="#ffffff"
            align="center"
            verticalAlign="middle"
            listening={false}
          />
        </Group>
      ) : null}
    </Group>
  );
}

export default LinkNodeBox;
