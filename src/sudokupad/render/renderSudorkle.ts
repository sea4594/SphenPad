import type { SudokuPadScene } from "../types/scene";
import { CELL_SIZE } from "./constants";
import type { SvgRenderer } from "./SvgRenderer";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Render the final (post-flip) state of stock metadata.sudorkle. */
export function renderSudokuPadSudorkle(renderer: SvgRenderer, scene: SudokuPadScene): void {
  if (!scene.sudorkle?.cells.length) return;
  const svg = renderer.getElem();
  svg.querySelector("#sudorkle")?.remove();
  const layer = document.createElementNS(SVG_NS, "g");
  layer.id = "sudorkle";
  svg.appendChild(layer); // stock addLayer() appends above every normal renderer layer

  for (const item of scene.sudorkle.cells) {
    const group = renderer.renderPart({
      target: "sudorkle",
      type: "g",
      attr: { transform: `translate(${item.col * CELL_SIZE}, ${item.row * CELL_SIZE})` },
    });
    const rect = renderer.renderPart({
      target: "sudorkle",
      type: "rect",
      attr: {
        fill: item.backgroundColor,
        x: 0,
        y: 0,
        width: CELL_SIZE,
        height: CELL_SIZE,
        "stroke-width": 2,
        stroke: "#fff",
      },
    });
    const sourceCell = scene.cells[item.row]?.[item.col];
    const text = item.text ?? sourceCell?.value ?? sourceCell?.given ?? "";
    const textElem = renderer.renderText({
      target: "sudorkle",
      className: "cell-value",
      center: [0.5, 0.5],
      width: 1,
      height: 1,
      text: String(text),
      style: "fill: #fff; color: #fff;",
    });
    group.appendChild(rect);
    group.appendChild(textElem);
  }
}
