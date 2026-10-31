import assert from "node:assert/strict";
import { fitPlayableBoard } from "../src/ui/playableBoardFit";

const identity = { inverse() { return this; }, multiply() { return this; } };
class Point {
  readonly x: number;
  readonly y: number;
  constructor(x: number, y: number) { this.x = x; this.y = y; }
  matrixTransform() { return this; }
}
(globalThis as unknown as { DOMPoint: typeof Point }).DOMPoint = Point;
class Graphics {
  readonly box: { x: number; y: number; width: number; height: number };
  readonly paint: string;
  constructor(box: { x: number; y: number; width: number; height: number }, paint = "black") { this.box = box; this.paint = paint; }
  getBBox() { return this.box; }
  getScreenCTM() { return identity; }
  getAttribute() { return null; }
  hasAttribute() { return false; }
  closest() { return null; }
}
(globalThis as unknown as { getComputedStyle: (part: Graphics) => object }).getComputedStyle = (part) =>
  ({ display: "inline", visibility: "visible", opacity: "1", fill: part.paint, stroke: "none", strokeWidth: "0px" });

const layers = new Map<string, Graphics[]>([
  ["cell-grids", [new Graphics({ x: 0, y: 0, width: 576, height: 576 })]],
  ["overlay", [new Graphics({ x: -35.3, y: 12, width: 22.25, height: 20 })]],
]);
const vb = { x: -64, y: -64, width: 704, height: 704 };
const svg = {
  viewBox: { baseVal: vb }, style: { width: "", height: "", margin: "" },
  getScreenCTM: () => identity,
  querySelector: (selector: string) => {
    const id = selector.replace(":scope > #", "");
    return layers.has(id) ? { querySelectorAll: () => layers.get(id)! } : null;
  },
  querySelectorAll: () => [],
  setAttribute(name: string, value: string) {
    if (name === "viewBox") {
      const [x, y, width, height] = value.split(" ").map(Number);
      Object.assign(vb, { x, y, width, height });
    }
  },
} as unknown as SVGSVGElement;
fitPlayableBoard(svg, 9, 9, "puzzle-A");
assert.equal(vb.x, -36.3, "outside clue is included without snapped 16-unit framing");
assert.equal(vb.width, 613.3, "content bounds include only one pixel of geometry padding");
const first = { ...vb };
layers.set("cell-values", [new Graphics({ x: 320, y: 320, width: 24, height: 30 })]);
fitPlayableBoard(svg, 9, 9, "puzzle-A");
assert.deepEqual(vb, first, "entering a digit must not change puzzle framing");
Object.assign(vb, { x: -64, y: -64, width: 704, height: 704 });
fitPlayableBoard(svg, 9, 9, "puzzle-A");
assert.deepEqual(vb, first, "renderer redraw must restore original pixel-tight fit");
console.log("Playable board exact bounds, outside clues, and first-edit stability passed");
