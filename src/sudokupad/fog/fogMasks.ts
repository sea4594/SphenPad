import type { SudokuPadScene } from "../types/scene";
import { CELL_SIZE } from "../render/constants";
import { getCellOutline } from "../render/cellOutline";
import { SvgRenderer } from "../render/SvgRenderer";
import { sudokuPadScopedSvgId } from "../render/svgScope";
import { getSudokuPadLitCells } from "./fogState";

export const SUDOKUPAD_FOGGED_LAYERS = ["background", "underlay", "arrows", "cages", "overlay", "cell-givens"] as const;
export const SUDOKUPAD_FOG_SIZE = 0.2;
export const SUDOKUPAD_FOG_DARK = 0.235;
export const SUDOKUPAD_FOG_LIGHT = 0.9;

function createSvgElement<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS("http://www.w3.org/2000/svg", name);
}

function outlinePath(scene: SudokuPadScene): string {
  const lit = new Set(getSudokuPadLitCells(scene).map(([r, c]) => `${r},${c}`));
  const fogged = scene.cells.flat().filter((cell) => !lit.has(`${cell.row},${cell.col}`));
  if (fogged.length === 0) return "";
  return getCellOutline(fogged.map(({ row, col }) => ({ row, col })))
    .map(([command, row, col]) => command === "Z" ? "Z" : `${command}${col * CELL_SIZE} ${row * CELL_SIZE}`)
    .join(" ");
}

function edgeUses(fogShapeId: string, count = 4): SVGUseElement[] {
  const result: SVGUseElement[] = [];
  for (let i = 0; i < count; i += 1) {
    const p = (count - i) / count;
    const edgeWidth = Math.round(p * ((CELL_SIZE * 2) * SUDOKUPAD_FOG_SIZE) * 10) / 10;
    const p2 = 1 - (1 - p) * (1 - p);
    const v = Math.round((SUDOKUPAD_FOG_DARK + (SUDOKUPAD_FOG_LIGHT - SUDOKUPAD_FOG_DARK) * p2) * 255);
    const use = createSvgElement("use");
    use.setAttribute("href", `#${fogShapeId}`);
    use.setAttribute("stroke-width", `${edgeWidth}px`);
    use.setAttribute("stroke", `rgb(${v},${v},${v})`);
    result.push(use);
  }
  return result;
}

export function clearSudokuPadFogMasks(svg: SVGSVGElement): void {
  svg.querySelectorAll("[data-sphenpad-fog-root], #fog-defs, #fog-fogcover").forEach((elem) => elem.remove());
  SUDOKUPAD_FOGGED_LAYERS.forEach((id) => svg.querySelector(`#${id}`)?.removeAttribute("mask"));
}

/** Render the final/static state of SudokuPad's fog masks. Animation is presentation-only. */
export function applySudokuPadFogMasks(svg: SVGSVGElement, scene: SudokuPadScene): () => void {
  clearSudokuPadFogMasks(svg);
  if (!scene.fog) return () => undefined;

  const contentBounds = new SvgRenderer(svg).getContentBounds();
  const left = Number.isFinite(contentBounds.left) ? contentBounds.left : 0;
  const top = Number.isFinite(contentBounds.top) ? contentBounds.top : 0;
  const width = contentBounds.width || scene.cols * CELL_SIZE;
  const height = contentBounds.height || scene.rows * CELL_SIZE;
  const fogDefsId = sudokuPadScopedSvgId(svg, "fog-defs");
  const fogShapeId = sudokuPadScopedSvgId(svg, "fog-shape");
  const fogPathId = sudokuPadScopedSvgId(svg, "fog-path");
  const fogFadeOutId = sudokuPadScopedSvgId(svg, "fog-fadeout");
  const fogFadeInId = sudokuPadScopedSvgId(svg, "fog-fadein");
  const fogEdgeId = sudokuPadScopedSvgId(svg, "fog-edge");
  const fogMaskId = sudokuPadScopedSvgId(svg, "fog-mask-fog");
  const lightMaskId = sudokuPadScopedSvgId(svg, "fog-mask-light");
  const fogCoverId = sudokuPadScopedSvgId(svg, "fog-fogcover");
  const defs = createSvgElement("defs");
  defs.id = fogDefsId;
  defs.dataset.sphenpadFogRoot = "defs";

  const fogShape = createSvgElement("g");
  fogShape.id = fogShapeId;
  const pathGroup = createSvgElement("g");
  pathGroup.id = fogPathId;
  const path = createSvgElement("path");
  path.setAttribute("vector-effect", "non-scaling-stroke");
  path.setAttribute("d", outlinePath(scene));
  pathGroup.appendChild(path);
  const fadeOut = createSvgElement("g"); fadeOut.id = fogFadeOutId; fadeOut.style.opacity = "0";
  const fadeIn = createSvgElement("g"); fadeIn.id = fogFadeInId; fadeIn.style.opacity = "1";
  fogShape.append(pathGroup, fadeOut, fadeIn);

  const fogEdge = createSvgElement("g");
  fogEdge.id = fogEdgeId;
  fogEdge.dataset.sphenpadFogEdge = "true";
  edgeUses(fogShapeId).forEach((use) => fogEdge.appendChild(use));
  const shapeUse = createSvgElement("use"); shapeUse.setAttribute("href", `#${fogShapeId}`); fogEdge.appendChild(shapeUse);

  const maskFog = createSvgElement("mask");
  maskFog.id = fogMaskId;
  maskFog.setAttribute("maskUnits", "userSpaceOnUse");
  maskFog.setAttribute("x", String(left)); maskFog.setAttribute("y", String(top));
  maskFog.setAttribute("width", String(width)); maskFog.setAttribute("height", String(height));
  const white = createSvgElement("rect");
  white.classList.add("fog-mask-white");
  white.setAttribute("x", String(left)); white.setAttribute("y", String(top)); white.setAttribute("width", String(width)); white.setAttribute("height", String(height));
  const edgeUse = createSvgElement("use"); edgeUse.setAttribute("href", `#${fogEdgeId}`); edgeUse.classList.add("fog-mask-black");
  maskFog.append(white, edgeUse);

  const maskLight = createSvgElement("mask");
  maskLight.id = lightMaskId;
  maskLight.setAttribute("maskUnits", "userSpaceOnUse");
  maskLight.setAttribute("x", String(left)); maskLight.setAttribute("y", String(top));
  maskLight.setAttribute("width", String(width)); maskLight.setAttribute("height", String(height));
  const lightWhite = white.cloneNode() as SVGRectElement;
  const lightBlack = createSvgElement("rect");
  lightBlack.classList.add("fog-mask-black");
  lightBlack.setAttribute("x", String(left)); lightBlack.setAttribute("y", String(top)); lightBlack.setAttribute("width", String(width)); lightBlack.setAttribute("height", String(height));
  lightBlack.setAttribute("mask", `url(#${fogMaskId})`);
  maskLight.append(lightWhite, lightBlack);
  defs.append(maskFog, maskLight, fogShape, fogEdge);

  const cover = createSvgElement("g");
  cover.id = fogCoverId;
  cover.dataset.sphenpadFogRoot = "cover";
  const coverRect = createSvgElement("rect");
  coverRect.setAttribute("mask", `url(#${lightMaskId})`);
  coverRect.setAttribute("x", "0"); coverRect.setAttribute("y", "0");
  coverRect.setAttribute("width", String(scene.cols * CELL_SIZE)); coverRect.setAttribute("height", String(scene.rows * CELL_SIZE));
  cover.appendChild(coverRect);

  svg.insertBefore(cover, svg.firstChild);
  svg.insertBefore(defs, svg.firstChild);
  SUDOKUPAD_FOGGED_LAYERS.forEach((id) => svg.querySelector(`#${id}`)?.setAttribute("mask", `url(#${fogMaskId})`));
  return () => clearSudokuPadFogMasks(svg);
}
