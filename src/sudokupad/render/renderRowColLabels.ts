import type { SudokuPadScene } from "../types/scene";
import type { SvgRenderer } from "./SvgRenderer";

const SVG_NS = "http://www.w3.org/2000/svg";
export const ROW_COL_LABEL_LAYER = "labels-rowcol";

function stockActiveBounds(scene: SudokuPadScene): [[number, number], [number, number]] {
  const cageCells = [...scene.cages, ...scene.regions]
    .flatMap((cage) => cage.cells ?? [])
    .filter((cell): cell is [number, number] => Array.isArray(cell) && cell.length >= 2);
  const rows = cageCells.map(([row]) => row);
  const cols = cageCells.map(([, col]) => col);
  const bounds: [[number, number], [number, number]] = [
    [rows.length ? Math.min(...rows) : 0, cols.length ? Math.min(...cols) : 0],
    [rows.length ? Math.max(...rows) : scene.rows - 1, cols.length ? Math.max(...cols) : scene.cols - 1],
  ];

  const solution = typeof scene.metadata.solution === "string" ? scene.metadata.solution : undefined;
  if (solution?.length === scene.rows * scene.cols) {
    const blanks = new Set([".", "?"]);
    let left = 0;
    for (; left < scene.cols; left += 1) {
      let found = false;
      for (let row = 0; row < scene.rows; row += 1) {
        if (!blanks.has(solution[row * scene.cols + left])) { found = true; break; }
      }
      if (found) break;
    }
    let right = scene.cols - 1;
    for (; right >= 0; right -= 1) {
      let found = false;
      for (let row = 0; row < scene.rows; row += 1) {
        if (!blanks.has(solution[row * scene.cols + right])) { found = true; break; }
      }
      if (found) break;
    }
    let top = 0;
    for (; top < scene.rows; top += 1) {
      let found = false;
      for (let col = 0; col < scene.cols; col += 1) {
        if (!blanks.has(solution[top * scene.cols + col])) { found = true; break; }
      }
      if (found) break;
    }
    let bottom = scene.rows - 1;
    for (; bottom >= 0; bottom -= 1) {
      let found = false;
      for (let col = 0; col < scene.cols; col += 1) {
        if (!blanks.has(solution[bottom * scene.cols + col])) { found = true; break; }
      }
      if (found) break;
    }
    bounds[0][0] = Math.min(bounds[0][0], top);
    bounds[0][1] = Math.min(bounds[0][1], left);
    bounds[1][0] = Math.max(bounds[1][0], bottom);
    bounds[1][1] = Math.max(bounds[1][1], right);
  }
  return bounds;
}

/** Exact stock FeatureRowColLabels: insert labels immediately after #overlay. */
export function renderSudokuPadRowColLabels(renderer: SvgRenderer, scene: SudokuPadScene): void {
  const svg = renderer.getElem();
  svg.querySelector(`#${ROW_COL_LABEL_LAYER}`)?.remove();
  if (!scene.renderSettings.labelRowsCols) return;
  const overlay = svg.querySelector("#overlay");
  if (!overlay?.parentNode) return;
  const group = document.createElementNS(SVG_NS, "g");
  group.id = ROW_COL_LABEL_LAYER;
  overlay.parentNode.insertBefore(group, overlay.nextSibling);

  const [minRC, maxRC] = stockActiveBounds(scene);
  for (let row = minRC[0]; row <= maxRC[0]; row += 1) {
    renderer.renderText({
      target: ROW_COL_LABEL_LAYER,
      className: "rowcollabel rowlabel",
      center: [row + 0.5, -0.035],
      width: 1,
      height: 1,
      text: String(row - minRC[0] + 1),
    });
  }
  for (let col = minRC[1]; col <= maxRC[1]; col += 1) {
    renderer.renderText({
      target: ROW_COL_LABEL_LAYER,
      className: "rowcollabel collabel",
      center: [-0.2, col + 0.5],
      width: 1,
      height: 1,
      text: String(col - minRC[1] + 1),
    });
  }
}
