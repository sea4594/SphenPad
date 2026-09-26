import { MIN_CONTENT_PADDING, VIEWBOX_SNAP } from "./constants";
import type { ContentBounds, SvgRenderer } from "./SvgRenderer";

export type SudokuPadViewBox = ContentBounds;

export function computeSudokuPadViewBox(renderer: SvgRenderer): SudokuPadViewBox {
  const bounds = renderer.getContentBounds();
  const padded = {
    left: bounds.left - MIN_CONTENT_PADDING,
    right: bounds.right + MIN_CONTENT_PADDING,
    top: bounds.top - MIN_CONTENT_PADDING,
    bottom: bounds.bottom + MIN_CONTENT_PADDING,
  };
  const left = Math.floor(padded.left / VIEWBOX_SNAP) * VIEWBOX_SNAP;
  const right = Math.ceil(padded.right / VIEWBOX_SNAP) * VIEWBOX_SNAP;
  const top = Math.floor(padded.top / VIEWBOX_SNAP) * VIEWBOX_SNAP;
  const bottom = Math.ceil(padded.bottom / VIEWBOX_SNAP) * VIEWBOX_SNAP;
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}
