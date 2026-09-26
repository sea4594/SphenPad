import type { SudokuPadPoint, SudokuPadSourceArrow, SudokuPadSourceGraphic, SudokuPadSourceLine } from "../types/source";
import type { SudokuPadSvgLayer } from "../types/scene";
import {
  CAGE_BORDER_STYLES,
  CAGE_VALUE_STYLE,
  CELL_SIZE,
  DEFAULT_LAYER_FOR_GRAPHIC,
  RENDERER_INTERNAL_ATTRS,
  TYPE_ATTR_EXCLUSIONS,
} from "./constants";
import { getCellOutline, type OutlineCell } from "./cellOutline";
import { centerPoint, pointsToPath, rcToPathData, retractFinalPoint, squareSegment } from "./geometry";
import { sudokuPadScopedSvgId } from "./svgScope";

const SVG_NS = "http://www.w3.org/2000/svg";

type SvgAttributes = Record<string, unknown>;

export interface RenderPartOptions {
  target?: string;
  type: string;
  attr?: SvgAttributes;
  content?: string;
}

export interface CageRenderOptions {
  target: SudokuPadSvgLayer;
  cells: OutlineCell[];
  cageValue?: string;
  style?: string | null;
  textColor?: string;
  borderColor?: string;
}

export interface ContentBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

function clonePoint(point: SudokuPadPoint): SudokuPadPoint { return [point[0], point[1]]; }

export class SvgRenderer {
  static readonly CellSize = CELL_SIZE;
  private svgId = 0;
  private readonly svg: SVGSVGElement;

  constructor(svg: SVGSVGElement) {
    this.svg = svg;
  }

  getElem(): SVGSVGElement { return this.svg; }

  private isAttrValid(type: string, attr: string): boolean {
    if (/^on/i.test(attr)) return false;
    if (RENDERER_INTERNAL_ATTRS.has(attr)) return false;
    return !(TYPE_ATTR_EXCLUSIONS[type]?.has(attr) ?? false);
  }

  addLayer(layerName: string): SVGGElement {
    const elem = document.createElementNS(SVG_NS, "g");
    elem.id = layerName;
    this.svg.appendChild(elem);
    return elem;
  }

  clearAllLayers(): void {
    this.svg.querySelectorAll(":scope > g:not(.defs)").forEach((elem) => { elem.innerHTML = ""; });
    this.svg.querySelectorAll(":scope > *:not(g)").forEach((elem) => elem.remove());
  }

  renderPart({ target = DEFAULT_LAYER_FOR_GRAPHIC, type, attr = {}, content }: RenderPartOptions): SVGElement {
    const part = document.createElementNS(SVG_NS, type);
    const mutable = { ...attr };
    Object.keys(mutable).forEach((inputKey) => {
      const key = inputKey === "className" ? "class" : inputKey;
      const value = mutable[inputKey];
      if (value === undefined || value === null || !this.isAttrValid(type, key)) return;
      let normalized = value;
      if (typeof normalized === "number" && ["x", "y", "width", "height"].includes(key)) {
        normalized = Number(normalized.toFixed(1));
      }
      part.setAttribute(key, String(normalized));
    });
    if (content !== undefined) {
      if (/\n/.test(content)) {
        part.setAttribute("x", "0");
        part.setAttribute("y", "0");
        const x = Number(attr.x ?? 0);
        const y = Number(attr.y ?? 0);
        const height = Number(attr.height ?? 0);
        part.setAttribute("transform", `translate(${x}, ${y - 0.5 * height * CELL_SIZE})`);
        const lines = content.split(/\n/);
        lines.forEach((line, index) => {
          const tspan = document.createElementNS(SVG_NS, "tspan");
          tspan.setAttribute("x", "0");
          tspan.setAttribute("y", `${1.5 + ((-0.5 * lines.length) + index) * 0.9}em`);
          tspan.setAttribute("dominant-baseline", "middle");
          tspan.textContent = line;
          part.appendChild(tspan);
        });
      } else {
        part.textContent = content;
      }
    }
    const targetElem = this.svg.querySelector(`#${CSS.escape(target)}`);
    if (!targetElem) throw new Error(`SudokuPad SVG target layer not found: ${target}`);
    targetElem.appendChild(part);
    return part;
  }

  renderLine(opts: SudokuPadSourceLine): SVGPathElement {
    const { target = "arrows", color = "none", thickness, wayPoints = [], className } = opts;
    const attr: SvgAttributes = {
      stroke: color,
      fill: "none",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      ...opts,
    };
    if (className !== undefined) attr.class = className;
    if (thickness !== undefined) attr["stroke-width"] = thickness;
    if (wayPoints.length > 0) attr.d = rcToPathData(wayPoints);
    return this.renderPart({ target, type: "path", attr }) as SVGPathElement;
  }

  private createArrowHead(opts: Required<Pick<SudokuPadSourceArrow, "thickness" | "headStyle" | "headAngle" | "headIndent" | "color">> & Pick<SudokuPadSourceArrow, "headLength">): SVGDefsElement & { retract?: number; markerId?: string } {
    const { thickness, headLength, headStyle, headAngle, headIndent, color } = opts;
    const fillStyle = headStyle === "fill";
    const size = headLength ? headLength * 2 * CELL_SIZE : thickness * 10;
    const rad = (headAngle / 2) * (Math.PI / 180);
    const ox = 0.9;
    const oy = 1.0;
    const hx = 0.5 * Math.cos(rad);
    const hy = 0.5 * Math.sin(rad);
    const retractHead = fillStyle && headLength !== undefined
      ? (2 * headLength) * ((1 - Math.max(0, headIndent)) * hx) * CELL_SIZE - 0.5
      : 0;
    const headPoints: Array<[number, number]> = [
      [ox - hx, oy + hy], [ox, oy], [ox - hx, oy - hy], [ox - hx * (1 - headIndent), oy],
    ];
    const marker = this.renderPart({
      type: "marker",
      attr: {
        id: sudokuPadScopedSvgId(this.svg, `arrow_${this.svgId++}`),
        markerUnits: "userSpaceOnUse",
        markerWidth: 2 * size,
        markerHeight: 2 * size,
        refX: size * ox - retractHead,
        refY: size,
        orient: "auto",
      },
    }) as SVGMarkerElement;
    const pathAttrs: SvgAttributes = {
      fill: color,
      "stroke-linejoin": "miter",
      ...(fillStyle ? { "stroke-width": 0 } : { fill: "none" }),
      d: pointsToPath(
        headPoints.slice(0, fillStyle ? 4 : 3).map(([x, y]) => [x * size, y * size]),
        fillStyle,
      ),
    };
    marker.appendChild(this.renderPart({ type: "path", attr: pathAttrs }));
    const defs = this.renderPart({ type: "defs" }) as SVGDefsElement & { retract?: number; markerId?: string };
    defs.appendChild(marker);
    defs.retract = retractHead || thickness;
    defs.markerId = marker.id;
    return defs;
  }

  renderArrow(opts: SudokuPadSourceArrow): SVGGElement | undefined {
    const {
      target = "arrows", color = "none", opacity = 1, thickness = 0,
      headLength, headStyle = "stroke", headAngle = 90, headIndent = 0, wayPoints = [],
    } = opts;
    if (wayPoints.length < 2) return undefined;
    const arrowHead = this.createArrowHead({ thickness, headLength, headStyle, headAngle, headIndent, color });
    const retracted = retractFinalPoint(wayPoints.map(clonePoint), arrowHead.retract ?? thickness)
      .map(([row, col]): [number, number] => [col * CELL_SIZE, row * CELL_SIZE]);
    const arrowLine = this.renderPart({
      type: "path",
      attr: {
        fill: "none",
        "stroke-linecap": "butt",
        "stroke-linejoin": "round",
        "marker-end": `url(#${arrowHead.markerId})`,
        d: pointsToPath(retracted),
      },
    });
    const group = this.renderPart({ target, type: "g", attr: { stroke: color, opacity, "stroke-width": thickness } }) as SVGGElement;
    group.appendChild(arrowHead);
    group.appendChild(arrowLine);
    return group;
  }

  renderRect(opts: SudokuPadSourceGraphic): SVGRectElement {
    const {
      target = "underlay", center = [0, 0], width = 0, height = 0, angle,
      backgroundColor = "none", borderColor = "none", rounded, roundedRadius,
      opacity = 1, className,
    } = opts;
    let borderSize = Number(opts.borderSize ?? 0);
    const thickness = Number(opts.thickness ?? 0);
    borderSize = borderSize || thickness || (borderColor !== "none" ? 2 : 0);
    const attr: SvgAttributes = {
      ...opts,
      fill: backgroundColor === undefined ? "none" : backgroundColor,
      stroke: backgroundColor === borderColor ? "none" : borderColor,
      "stroke-width": borderSize,
      x: (center[1] - width * 0.5) * CELL_SIZE + 0.5 * borderSize,
      y: (center[0] - height * 0.5) * CELL_SIZE + 0.5 * borderSize,
      width: width * CELL_SIZE - borderSize,
      height: height * CELL_SIZE - borderSize,
      opacity,
    };
    if (className !== undefined) attr.class = className;
    if (angle) {
      const x = Number(attr.x);
      const y = Number(attr.y);
      const svgWidth = Number(attr.width);
      const svgHeight = Number(attr.height);
      attr.transform = `translate(${x + 0.5 * svgWidth},${y + 0.5 * svgHeight}) rotate(${angle}) translate(${-x - 0.5 * svgWidth},${-y - 0.5 * svgHeight}) `;
    }
    let radius = roundedRadius;
    if (rounded && radius === undefined) radius = 0.5 * (Math.min(width, height) * CELL_SIZE - borderSize);
    if (rounded) Object.assign(attr, { rx: radius || 0, ry: radius || 0 });
    return this.renderPart({ target, type: "rect", attr }) as SVGRectElement;
  }

  renderText(opts: SudokuPadSourceGraphic): SVGTextElement {
    const textOffsetX = 0;
    const textOffsetY = 0.06;
    const attr: SvgAttributes = { style: "", ...opts };
    const normalize: Array<[string, string]> = [["textStroke", "stroke"], ["color", "fill"], ["textAnchor", "text-anchor"]];
    normalize.forEach(([input, output]) => {
      if (attr[input] !== undefined) { attr[output] = attr[input]; delete attr[input]; }
    });
    ["fill", "stroke", "backgroundColor"].forEach((key) => {
      const value = String(attr[key] ?? "");
      if (/^#fff(?:fff)?$/i.test(value)) attr[key] = "var(--color-white)";
      if (/^#000(?:000)?$/i.test(value)) attr[key] = "var(--color-black)";
    });
    const styleKeys = ["fill", "stroke", "dominant-baseline", "text-anchor", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset"];
    styleKeys.forEach((key) => {
      if (attr[key] !== undefined) {
        attr.style = `${String(attr.style ?? "")}${key}:${String(attr[key])};`;
        delete attr[key];
      }
    });
    const target = String(attr.target ?? "overlay");
    const center = (attr.center ?? [0, 0]) as SudokuPadPoint;
    const width = Number(attr.width ?? 0);
    const height = Number(attr.height ?? 0);
    const maxWidth = attr.maxWidth === undefined ? undefined : Number(attr.maxWidth);
    const fontSize = attr.fontSize === undefined ? undefined : Number(attr.fontSize);
    const text = String(attr.text ?? "");
    if (attr.className !== undefined) attr.class = attr.className;
    if (fontSize !== undefined) attr.style = `${String(attr.style ?? "")}font-size: ${fontSize}px;`;
    const x = (Number(center[1]) + textOffsetX * width) * CELL_SIZE;
    const y = (Number(center[0]) + textOffsetY * height) * CELL_SIZE;
    const textOpts: RenderPartOptions = { target, type: "text", attr: { x, y, ...attr }, content: text };
    if (attr.angle) {
      textOpts.attr!.transform = `rotate(${String(attr.angle)})`;
      textOpts.attr!["transform-origin"] = `${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    const textElem = this.renderPart(textOpts) as SVGTextElement;
    let bbox: DOMRect | SVGRect;
    try { bbox = textElem.getBBox(); } catch { bbox = { x, y, width: 0, height: 0 } as DOMRect; }
    if (maxWidth && bbox.width > maxWidth) {
      textElem.setAttribute("textLength", String(maxWidth));
      textElem.setAttribute("lengthAdjust", "spacingAndGlyphs");
      try { bbox = textElem.getBBox(); } catch { /* retain prior bbox */ }
    }
    if (attr.backgroundColor && fontSize !== undefined && fontSize <= 16) {
      const rectElem = this.renderPart({
        target,
        type: "rect",
        attr: {
          ...attr,
          x: bbox.x,
          y: bbox.y + 2,
          width: bbox.width,
          height: bbox.height - 3,
          style: `fill:${String(attr.backgroundColor)};stroke:none;`,
        },
      });
      rectElem.parentNode?.insertBefore(rectElem, textElem);
    }
    return textElem;
  }

  renderCellWedge(opts: { target?: string; a1: number; a2: number; color: string; center?: SudokuPadPoint; width?: number; height?: number; className?: string }): SVGPathElement {
    const { target = "cell-colors", a1, a2, color, center = [0.5, 0.5], width = 1, height = 1, className } = opts;
    const d = [[0.5, 0.5] as [number, number], ...squareSegment(a1, a2), [0.5, 0.5] as [number, number]]
      .map(([x, y]): SudokuPadPoint => [center[0] + (y - 0.5) * height, center[1] + (x - 0.5) * width])
      .map(([row, col], index) => `${index === 0 ? "M" : "L"}${(col * CELL_SIZE).toFixed(2)} ${(row * CELL_SIZE).toFixed(2)}`)
      .join(" ");
    return this.renderPart({ target, type: "path", attr: { fill: color, d, class: className } }) as SVGPathElement;
  }

  renderCageLabel(opts: CageRenderOptions): SVGTextElement | undefined {
    if (!opts.cageValue) return undefined;
    const match = opts.cageValue.match(/^r(\d+)c(\d+)\s*:\s*(.*)$/s);
    if (!match) return undefined;
    const row = Number(match[1]);
    const col = Number(match[2]);
    const value = match[3] ?? "";
    let widthCells = 0;
    while (opts.cells.some((cell) => cell.row === row - 1 && cell.col === col - 1 + ++widthCells)) { /* exact SudokuPad scan */ }
    return this.renderText({
      ...CAGE_VALUE_STYLE,
      target: opts.target,
      className: `cage-${String(opts.style)} cage-label`,
      center: [row - 1 + 0.15, col - 1 + 0.035],
      text: value,
      color: opts.textColor,
      maxWidth: (Math.max(1, widthCells) - 2 * 0.035) * CELL_SIZE,
    });
  }

  renderCage(opts: CageRenderOptions): SVGElement | undefined {
    let cageElem: SVGElement | undefined;
    let textElem: SVGElement | undefined;
    if (opts.style !== undefined && opts.style !== null && opts.style !== "hidden" && opts.style !== "" && opts.cells.length > 0) {
      const style = CAGE_BORDER_STYLES[opts.style as keyof typeof CAGE_BORDER_STYLES];
      if (style) {
        const edgePoints = getCellOutline(opts.cells, style.offset);
        const borderAttr: SvgAttributes = {
          ...style.border,
          class: `cage-${opts.style}`,
          "shape-rendering": "geometricprecision",
          "vector-effect": "non-scaling-stroke",
          d: edgePoints.map((command) => command[0] === "Z" ? "Z" : `${command[0]}${command[2] * CELL_SIZE} ${command[1] * CELL_SIZE}`).join(" "),
        };
        if (opts.borderColor) borderAttr.stroke = opts.borderColor;
        cageElem = this.renderPart({ target: opts.target, type: "path", attr: borderAttr });
      }
    }
    if (opts.cageValue !== undefined) textElem = this.renderCageLabel(opts);
    return cageElem ?? textElem;
  }

  renderThermo({ bulb, line }: { bulb: SudokuPadSourceGraphic; line: SudokuPadSourceLine }): { line: SVGPathElement; rect: SVGRectElement } {
    const points = (line.wayPoints ?? []).map(clonePoint);
    const bulbCenter = bulb.center ?? [0, 0];
    const first = points[0] ?? [0, 0];
    const same = Math.floor(bulbCenter[0]) === Math.floor(first[0]) && Math.floor(bulbCenter[1]) === Math.floor(first[1]);
    const start = same ? 0 : 1;
    const len = points.length - 1 + start;
    points.slice(start, len).forEach(centerPoint);
    return {
      line: this.renderLine({ ...line, wayPoints: points, target: "arrows", className: "thermo-line" }),
      rect: this.renderRect({ ...bulb, target: "arrows", className: "thermo-bulb" }),
    };
  }

  renderArrowSum({ bulb, arrow }: { bulb: SudokuPadSourceGraphic; arrow: SudokuPadSourceArrow }): void {
    this.renderArrow({ ...arrow, target: "arrows" });
    this.renderRect({ ...bulb, target: "arrows" });
  }

  renderKropki(part: SudokuPadSourceGraphic): void {
    const attr = { target: "overlay", ...part };
    const elem = this.renderRect(attr);
    elem.classList.add("feature-kropki");
    if (part.text !== undefined && String(part.text).length > 0) {
      elem.classList.add("textbg");
      const textElem = this.renderText({ ...attr, backgroundColor: undefined });
      textElem.classList.add("feature-kropki");
    }
  }

  renderXV(part: SudokuPadSourceGraphic): void {
    const attr = { target: "overlay", ...part };
    const rect = this.renderRect(attr);
    rect.classList.add("feature-xv");
    this.renderText({ ...part, target: "overlay", backgroundColor: undefined, fontSize: Number(part.fontSize ?? 0) + 4 });
  }

  renderLittleKiller({ arrow, number }: { arrow: SudokuPadSourceArrow; number: SudokuPadSourceGraphic }): void {
    this.renderArrow({ ...arrow, target: "arrows" });
    this.renderText({
      ...number,
      target: "overlay",
      backgroundColor: undefined,
      fontSize: Number(number.fontSize ?? 0) + 4,
    });
  }

  renderPalindrome(line: SudokuPadSourceLine): SVGPathElement {
    return this.renderLine({ ...line, target: "arrows", className: "palindrome" });
  }

  renderSudokuX(line: SudokuPadSourceLine): SVGPathElement {
    return this.renderLine({ ...line, target: "overlay", className: "sudokux" });
  }

  renderPen(opts: { row: number; col: number; className: string; value: string }): SVGPathElement {
    const { row, col, className, value } = opts;
    const a = 0.3 * CELL_SIZE;
    const b = 0.125 * CELL_SIZE;
    const attr: SvgAttributes = { class: className };
    switch (value) {
      case "1": attr.d = rcToPathData([[row + 0.5, col + 0.5], [row + 0.5, col + 1.5]]); break;
      case "2": attr.d = rcToPathData([[row + 0.5, col + 0.5], [row + 1.5, col + 0.5]]); break;
      case "3": attr.d = rcToPathData([[row + 0.5, col + 1]]) + ` m ${-b},${-b} l${b * 2},${2 * b} m ${-2 * b},0 l${b * 2},${-2 * b}`; break;
      case "4": attr.d = rcToPathData([[row + 1, col + 0.5]]) + ` m ${-b},${-b} l${b * 2},${2 * b} m ${-2 * b},0 l${b * 2},${-2 * b}`; break;
      case "5": attr.d = rcToPathData([[row + 0.5, col + 0.5]]) + ` m ${-a},0 a ${a},${a} 0 1,0 ${a * 2},0 a ${a},${a} 0 1,0 ${-a * 2},0`; break;
      case "6": attr.d = rcToPathData([[row + 0.5, col + 0.5]]) + ` m ${-a},${-a} l${a * 2},${2 * a} m ${-2 * a},0 l${a * 2},${-2 * a}`; break;
      case "7": attr.d = rcToPathData([[row, col + 1], [row + 1, col + 1]]); break;
      case "8": attr.d = rcToPathData([[row + 1, col], [row + 1, col + 1]]); break;
      case "9": attr.d = rcToPathData([[row, col], [row + 1, col]]); break;
      case "a": attr.d = rcToPathData([[row, col], [row, col + 1]]); break;
      case "b": attr.d = rcToPathData([[row + 0.5, col]]) + ` m ${-b},${-b} l${b * 2},${2 * b} m ${-2 * b},0 l${b * 2},${-2 * b}`; break;
      case "c": attr.d = rcToPathData([[row, col + 0.5]]) + ` m ${-b},${-b} l${b * 2},${2 * b} m ${-2 * b},0 l${b * 2},${-2 * b}`; break;
      case "d": attr.d = rcToPathData([[row + 0.5, col + 0.5], [row - 0.5, col + 1.5]]); break;
      case "e": attr.d = rcToPathData([[row + 0.5, col + 0.5], [row + 1.5, col + 1.5]]); break;
      case "f": attr.d = rcToPathData([[row, col + 1], [row + 1, col]]); break;
      case "g": attr.d = rcToPathData([[row, col], [row + 1, col + 1]]); break;
      default: break;
    }
    return this.renderPart({ target: "cell-pen", type: "path", attr }) as SVGPathElement;
  }

  getContentBounds(): ContentBounds {
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const elem of [this.svg, ...Array.from(this.svg.querySelectorAll("*"))]) {
      const graphics = elem as SVGGraphicsElement;
      if (typeof graphics.getBBox !== "function") continue;
      try {
        const box = (graphics.getBBox as unknown as (options?: { fill?: boolean; stroke?: boolean; markers?: boolean }) => DOMRect).call(
          graphics,
          { fill: true, stroke: true, markers: true },
        );
        left = Math.min(left, box.x);
        top = Math.min(top, box.y);
        right = Math.max(right, box.x + box.width);
        bottom = Math.max(bottom, box.y + box.height);
      } catch { /* ignore non-renderable SVG nodes */ }
    }
    if (!Number.isFinite(left)) return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  }

  adjustViewBox(left: number, top: number, width: number, height: number): void {
    this.svg.style.width = `${width}px`;
    this.svg.style.height = `${height}px`;
    this.svg.style.margin = `${Math.round(top)}px 0 0 ${Math.round(left)}px`;
    this.svg.setAttribute("viewBox", `${Math.round(left)} ${Math.round(top)} ${Math.round(width)} ${Math.round(height)}`);
    this.svg.querySelectorAll(".viewboxsize").forEach((elem) => {
      elem.setAttribute("x", String(Math.floor(left)));
      elem.setAttribute("y", String(Math.floor(top)));
      elem.setAttribute("width", String(Math.ceil(width)));
      elem.setAttribute("height", String(Math.ceil(height)));
    });
  }
}
