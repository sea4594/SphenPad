import type { SvgRenderer } from "./SvgRenderer";
import { rcToPathData } from "./geometry";

export function renderGrid(renderer: SvgRenderer, rows: number, cols: number): SVGPathElement {
  const lines: Array<[[number, number], [number, number]]> = [];
  for (let row = 0; row <= rows; row += 1) lines.push([[row, 0], [row, cols]]);
  for (let col = 0; col <= cols; col += 1) lines.push([[0, col], [rows, col]]);
  return renderer.renderPart({
    target: "cell-grids",
    type: "path",
    attr: { class: "cell-grid", d: lines.map((line) => rcToPathData(line)).join(" ") },
  }) as SVGPathElement;
}
