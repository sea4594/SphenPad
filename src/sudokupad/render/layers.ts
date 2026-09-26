import { SUDOKUPAD_SVG_LAYER_ORDER } from "../types/scene";
import { sudokuPadScopedSvgId } from "./svgScope";

const SVG_NS = "http://www.w3.org/2000/svg";

function appendOutlineFilters(svg: SVGSVGElement): void {
  const lightFilterId = sudokuPadScopedSvgId(svg, "outlinefilter");
  const darkFilterId = sudokuPadScopedSvgId(svg, "outlinefilter_dark");
  svg.style.setProperty("--sphenpad-outline-filter", `url(#${lightFilterId})`);
  svg.style.setProperty("--sphenpad-outline-filter-dark", `url(#${darkFilterId})`);
  const defsGroup = document.createElementNS(SVG_NS, "g");
  defsGroup.classList.add("defs");
  const defs = document.createElementNS(SVG_NS, "defs");
  defsGroup.appendChild(defs);
  const createFilter = (id: string, matrix: string) => {
    const filter = document.createElementNS(SVG_NS, "filter");
    filter.id = id;
    filter.classList.add("viewboxsize");
    filter.setAttribute("x", "-25%"); filter.setAttribute("y", "-25%");
    filter.setAttribute("width", "150%"); filter.setAttribute("height", "150%");
    filter.setAttribute("filterUnits", "userSpaceOnUse");
    filter.setAttribute("primitiveUnits", "userSpaceOnUse");
    filter.setAttribute("color-interpolation-filters", "sRGB");
    const morphology = document.createElementNS(SVG_NS, "feMorphology");
    morphology.setAttribute("in", "SourceGraphic"); morphology.setAttribute("result", "outline");
    morphology.setAttribute("operator", "dilate"); morphology.setAttribute("radius", "0.65");
    const colorMatrix = document.createElementNS(SVG_NS, "feColorMatrix");
    colorMatrix.setAttribute("values", matrix); colorMatrix.setAttribute("in", "outline"); colorMatrix.setAttribute("result", "outline");
    const blend = document.createElementNS(SVG_NS, "feBlend");
    blend.setAttribute("in", "SourceGraphic"); blend.setAttribute("in2", "outline"); blend.setAttribute("mode", "normal");
    filter.append(morphology, colorMatrix, blend);
    defs.appendChild(filter);
  };
  createFilter(lightFilterId, "1000 1000 1000 1000 0 1000 1000 1000 1000 0 1000 1000 1000 1000 0 0 0 0 0.7 0");
  createFilter(darkFilterId, "-1000 -1000 -1000 1000 0 -1000 -1000 -1000 1000 0 -1000 -1000 -1000 1000 0 0 0 0 0.7 0");
  svg.appendChild(defsGroup);
}

export function ensureSudokuPadLayers(svg: SVGSVGElement): void {
  const defsPresent = svg.querySelector(":scope > g.defs > defs") !== null;
  const existing = Array.from(svg.querySelectorAll(":scope > g:not(.defs)"));
  if (defsPresent && existing.length === SUDOKUPAD_SVG_LAYER_ORDER.length && existing.every((elem, index) => elem.id === SUDOKUPAD_SVG_LAYER_ORDER[index])) return;
  svg.replaceChildren();
  appendOutlineFilters(svg);
  SUDOKUPAD_SVG_LAYER_ORDER.forEach((layer) => {
    const group = document.createElementNS(SVG_NS, "g");
    group.id = layer;
    svg.appendChild(group);
  });
}
