import { SUDOKUPAD_SVG_LAYER_ORDER } from "../sudokupad/types/scene";
import { SvgRenderer } from "../sudokupad/render/SvgRenderer";

type FitBounds = { x: number; y: number; width: number; height: number };
const fitCache = new WeakMap<SVGSVGElement, { key: string; rows: number; cols: number; bounds: FitBounds }>();

/** Use the painted authored SVG geometry, rather than SudokuPad's snapped
 * viewBox or any solver overlays. The viewBox is fixed for this puzzle, so
 * entering a digit cannot alter its scale or crop previously hidden clues. */
export function fitPlayableBoard(svg: SVGSVGElement, rows: number, cols: number, key: string): void {
  if (!rows || !cols) return;
  const cached = fitCache.get(svg);
  if (cached?.key === key && cached.rows === rows && cached.cols === cols) {
    applyBounds(svg, cached.bounds);
    return;
  }
  const rootMatrix = svg.getScreenCTM();
  if (!rootMatrix) return;
  let inverse: DOMMatrix;
  try { inverse = rootMatrix.inverse(); } catch { return; }
  let left = 0, top = 0, right = cols * SvgRenderer.CellSize, bottom = rows * SvgRenderer.CellSize;

  for (const id of SUDOKUPAD_SVG_LAYER_ORDER) {
    // User-entered content and fog/selection overlays do not change the authored
    // framing. All puzzle artwork, including outside clues, is considered.
    if (["cell-colors", "cell-highlights", "cell-errors", "cell-pen", "cell-pencilmarks", "cell-candidates", "cell-values"].includes(id)) continue;
    const layer = svg.querySelector<SVGGElement>(`:scope > #${id}`);
    if (!layer) continue;
    const parts = layer.querySelectorAll<SVGGraphicsElement>("path, rect, circle, ellipse, line, polyline, polygon, text, image, use");
    for (const part of parts) {
      if (part.closest('[data-sudokupad-metadata-background="true"], [data-sphenpad-grid-paper], [data-sphenpad-fog-root], defs, marker, clipPath, mask, filter')) continue;
      try {
        const style = getComputedStyle(part);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
        if ((style.fill === "none" || style.fill === "transparent") && (style.stroke === "none" || style.stroke === "transparent")) continue;
        const box = part.getBBox();
        if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) continue;
        const matrix = part.getScreenCTM();
        if (!matrix) continue;
        const toRoot = inverse.multiply(matrix);
        // Chromium and Safari currently ignore the getBBox({stroke:true})
        // option; include half the painted stroke explicitly in local units.
        const strokeWidth = Number.parseFloat(style.strokeWidth);
        const stroke = style.stroke !== "none" && style.stroke !== "transparent" && Number.isFinite(strokeWidth)
          ? Math.max(0, strokeWidth / 2) : 0;
        let extra = stroke;
        if (part.hasAttribute("marker-end") || part.hasAttribute("marker-start")) {
          const markerMatch = (part.getAttribute("marker-end") || part.getAttribute("marker-start") || "").match(/#([^)'"\s]+)/);
          const marker = markerMatch ? svg.querySelector<SVGMarkerElement>(`marker[id="${CSS.escape(markerMatch[1])}"]`) : null;
          // Marker geometry is not included in getBBox in all browsers.
          if (marker) extra = Math.max(extra, (Number(marker.getAttribute("markerWidth")) || 0) / 2);
        }
        for (const [x, y] of [[box.x - extra, box.y - extra], [box.x + box.width + extra, box.y - extra],
          [box.x - extra, box.y + box.height + extra], [box.x + box.width + extra, box.y + box.height + extra]]) {
          const point = new DOMPoint(x, y).matrixTransform(toRoot);
          left = Math.min(left, point.x); right = Math.max(right, point.x);
          top = Math.min(top, point.y); bottom = Math.max(bottom, point.y);
        }
      } catch { /* Ignore browser-specific non-rendering SVG elements. */ }
    }
  }

  // Sub-pixel precision: allow one SVG unit at most, rather than rounding the
  // viewBox to the old 16-unit boundaries or adding a large fixed margin.
  const pad = 1;
  const bounds = { x: left - pad, y: top - pad, width: right - left + 2 * pad, height: bottom - top + 2 * pad };
  if (!(bounds.width > 0 && bounds.height > 0)) return;
  fitCache.set(svg, { key, rows, cols, bounds });
  applyBounds(svg, bounds);
}

function applyBounds(svg: SVGSVGElement, bounds: FitBounds) {
  const current = svg.viewBox.baseVal;
  if (Math.abs(current.x - bounds.x) < 0.001 && Math.abs(current.y - bounds.y) < 0.001 &&
    Math.abs(current.width - bounds.width) < 0.001 && Math.abs(current.height - bounds.height) < 0.001) return;
  // SvgRenderer.adjustViewBox rounds coordinates and adds a legacy offset
  // margin. That would undo the tight measurement, so set the playable SVG
  // viewBox and intrinsic dimensions directly; creator uses stock rendering.
  svg.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
  svg.style.width = `${bounds.width}px`;
  svg.style.height = `${bounds.height}px`;
  svg.style.margin = "0";
  svg.querySelectorAll<SVGElement>(".viewboxsize").forEach((elem) => {
    elem.setAttribute("x", String(bounds.x)); elem.setAttribute("y", String(bounds.y));
    elem.setAttribute("width", String(bounds.width)); elem.setAttribute("height", String(bounds.height));
  });
}
