import { sudokuPadScopedSvgId } from "../sudokupad/render/svgScope";

const NS = "http://www.w3.org/2000/svg";
const WHITE = /^(?:#fff(?:fff)?(?:ff)?|white|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(?:,\s*1(?:\.0+)?\s*)?\))$/i;
const ART_LAYERS = ["background", "underlay", "arrows", "cages", "cell-grids", "overlay"];

/** Appearance only; leaves the SudokuPad scene, its viewBox and its authored geometry unchanged. */
export function applyPlayableGridPaper(svg: SVGSVGElement, rows: number, cols: number, whiteBackground: boolean): () => void {
  if (!whiteBackground) return () => undefined;
  const background = svg.querySelector<SVGGElement>(":scope > #background");
  if (!background) return () => undefined;

  // This rect is behind ALL authored layers, including the background image layer.
  // It is not attached to a fog-masked layer and never covers outside clues.
  const paper = document.createElementNS(NS, "rect");
  paper.setAttribute("x", "0"); paper.setAttribute("y", "0");
  paper.setAttribute("width", String(cols * 64)); paper.setAttribute("height", String(rows * 64));
  paper.setAttribute("fill", "#fff"); paper.setAttribute("pointer-events", "none");
  paper.dataset.sphenpadGridPaper = "true";
  svg.insertBefore(paper, background);

  const changes: Array<() => void> = [];
  const defs = svg.querySelector<SVGDefsElement>(":scope > g.defs > defs");
  const view = svg.viewBox.baseVal;
  let index = 0;
  const gridRight = cols * 64, gridBottom = rows * 64;

  for (const layerName of ART_LAYERS) {
    const layer = svg.querySelector<SVGGElement>(`:scope > #${layerName}`);
    if (!layer) continue;
    for (const part of Array.from(layer.querySelectorAll<SVGGraphicsElement>("[fill], [stroke], rect.cage-label"))) {
      if (part.closest("defs, marker, clipPath, mask, filter")) continue;
      const whiteFill = WHITE.test((part.getAttribute("fill") ?? "").trim()) || (part.matches("rect.cage-label") && !part.hasAttribute("fill"));
      const whiteStroke = WHITE.test((part.getAttribute("stroke") ?? "").trim());
      if (!whiteFill && !whiteStroke) continue;
      let box: DOMRect, transform: DOMMatrix;
      try {
        box = part.getBBox();
        const boardMatrix = svg.getScreenCTM(), partMatrix = part.getScreenCTM();
        if (!boardMatrix || !partMatrix) continue;
        transform = boardMatrix.inverse().multiply(partMatrix);
      } catch { continue; }
      const points = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]
        .map(([x, y]) => new DOMPoint(x, y).matrixTransform(transform));
      const left = Math.min(...points.map((p) => p.x)), right = Math.max(...points.map((p) => p.x));
      const top = Math.min(...points.map((p) => p.y)), bottom = Math.max(...points.map((p) => p.y));
      const outside = right <= 0 || bottom <= 0 || left >= gridRight || top >= gridBottom;
      const inside = left >= 0 && top >= 0 && right <= gridRight && bottom <= gridBottom;
      if (inside) continue;
      const recolor = (elem: SVGGraphicsElement) => {
        if (whiteFill) elem.style.setProperty("fill", "var(--bg)");
        if (whiteStroke) elem.style.setProperty("stroke", "var(--bg)");
      };
      if (outside) {
        const fill = part.style.getPropertyValue("fill"), stroke = part.style.getPropertyValue("stroke");
        const fillPriority = part.style.getPropertyPriority("fill"), strokePriority = part.style.getPropertyPriority("stroke");
        recolor(part);
        changes.push(() => {
          if (fill) part.style.setProperty("fill", fill, fillPriority); else part.style.removeProperty("fill");
          if (stroke) part.style.setProperty("stroke", stroke, strokePriority); else part.style.removeProperty("stroke");
        });
        continue;
      }
      // Split shapes crossing the grid boundary: keep the original white inside,
      // and paint only its exterior portion with the theme color. Do not clone
      // ID-bearing/clip-masked graphics (e.g. fog or SVG marker definitions).
      if (!defs || part.hasAttribute("id") || part.querySelector("[id]") || part.hasAttribute("clip-path") || part.hasAttribute("mask")) continue;
      const matrix = transform.inverse();
      const inverse = `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`;
      const innerId = sudokuPadScopedSvgId(svg, `paper-inner-${index}`);
      const outerId = sudokuPadScopedSvgId(svg, `paper-outer-${index++}`);
      const inner = document.createElementNS(NS, "clipPath"), outer = document.createElementNS(NS, "clipPath");
      inner.id = innerId; outer.id = outerId;
      inner.setAttribute("clipPathUnits", "userSpaceOnUse"); outer.setAttribute("clipPathUnits", "userSpaceOnUse");
      const clipRect = document.createElementNS(NS, "rect");
      clipRect.setAttribute("width", String(gridRight)); clipRect.setAttribute("height", String(gridBottom));
      clipRect.setAttribute("transform", inverse);
      inner.append(clipRect);
      const outsidePath = document.createElementNS(NS, "path");
      outsidePath.setAttribute("d", `M${view.x} ${view.y}h${view.width}v${view.height}h${-view.width}z M0 0h${gridRight}v${gridBottom}h${-gridRight}z`);
      outsidePath.setAttribute("clip-rule", "evenodd"); outsidePath.setAttribute("transform", inverse);
      outer.append(outsidePath);
      defs.append(inner, outer);
      const copy = part.cloneNode(true) as SVGGraphicsElement;
      copy.removeAttribute("id");
      copy.setAttribute("clip-path", `url(#${outerId})`);
      recolor(copy);
      part.setAttribute("clip-path", `url(#${innerId})`);
      part.after(copy);
      changes.push(() => { copy.remove(); part.removeAttribute("clip-path"); inner.remove(); outer.remove(); });
    }
  }
  return () => { for (const undo of changes.reverse()) undo(); paper.remove(); };
}
