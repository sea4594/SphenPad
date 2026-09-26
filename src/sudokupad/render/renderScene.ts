import type { SudokuPadScene } from "../types/scene";
import type { SudokuPadSourceCage, SudokuPadSourceGraphic, SudokuPadSourceLine } from "../types/source";
import { applyLegacyOpacity } from "../normalize/legacyOpacity";
import { recognizeSudokuPadRenderFeatures } from "../normalize/features";
import { ensureSudokuPadLayers } from "./layers";
import { renderGrid } from "./renderGrid";
import { renderSceneCells } from "./renderCells";
import { computeSudokuPadViewBox } from "./contentBounds";
import { SvgRenderer } from "./SvgRenderer";
import { applySudokuPadFogClueVisibility } from "../fog/fogState";
import { renderHistoricalSudokuPadBackground } from "../assets/historicalAssets";
import { renderSudokuPadRowColLabels } from "./renderRowColLabels";
import { renderSudokuPadSudorkle } from "./renderSudorkle";

function cageValue(cage: SudokuPadSourceCage): string | undefined {
  if (cage.value === undefined || /^\s*$/.test(String(cage.value))) return undefined;
  const sorted = [...cage.cells].sort(([r1, c1], [r2, c2]) => r1 === r2 ? c2 - c1 : r2 - r1);
  const label = sorted.at(-1);
  return label ? `r${label[0] + 1}c${label[1] + 1}: ${String(cage.value)}` : undefined;
}

function renderGenericGraphic(renderer: SvgRenderer, part: SudokuPadSourceGraphic, target: "underlay" | "overlay", scene: SudokuPadScene): void {
  if (typeof part.imageUrl === "string" && part.imageUrl.trim()) {
    const center = part.center ?? [scene.rows / 2, scene.cols / 2];
    const width = Number(part.width ?? 1), height = Number(part.height ?? 1), cellSize = SvgRenderer.CellSize;
    const x = (center[1] - width / 2) * cellSize, y = (center[0] - height / 2) * cellSize;
    renderer.renderPart({ target: String(part.target ?? target), type: "image", attr: {
      href: part.imageUrl,
      x,
      y,
      width: width * cellSize,
      height: height * cellSize,
      opacity: part.opacity ?? 1,
      preserveAspectRatio: part.preserveAspectRatio ?? "none",
      ...(part.angle ? { transform: `rotate(${part.angle} ${center[1] * cellSize} ${center[0] * cellSize})` } : {}),
      "data-sudokupad-asset-url": part.imageUrl,
      "data-sudokupad-asset-kind": "image",
    } });
    return;
  }
  const attr: SudokuPadSourceGraphic = applyLegacyOpacity({
    target,
    ...part,
    borderColor: part.borderColor || "none",
    backgroundColor: part.backgroundColor || "none",
  }, scene.metadata);
  if (attr.backgroundColor === attr.borderColor) attr.borderColor = undefined;
  const background = renderer.renderRect(attr);
  if (part.text !== undefined) {
    const fontSize = part.fontSize === undefined ? undefined : part.fontSize + 4;
    renderer.renderText({
      ...part,
      target,
      fontSize,
      backgroundColor: undefined,
      color: part.textColor ?? part.color,
      textStroke: part.textColor ? "#0000" : part.textStroke,
    });
    background.classList.add("textbg");
  }
}

function renderCages(renderer: SvgRenderer, scene: SudokuPadScene): void {
  // Stock convertPuzzle/loadPuzzle keeps authored cages ahead of generated
  // region/box cages. Preserve that insertion order because same-layer SVG
  // stacking is observable (for example a custom-colored box over a region).
  scene.cages.forEach((cage) => {
    if (cage.hidden || cage.cells.length === 0) return;
    const style = cage.style ?? ((cage.type === "rowcol" || cage.type === "disjoint") ? undefined : "killer");
    renderer.renderCage({
      target: style === "box" ? "cell-grids" : "cages",
      cells: cage.cells.map(([row, col]) => ({ row, col })),
      style,
      cageValue: cageValue(cage),
      textColor: cage.textColor ?? cage.fontC,
      borderColor: cage.borderColor ?? cage.outlineC,
    });
  });
  scene.regions.forEach((region) => renderer.renderCage({
    target: "cell-grids",
    cells: region.cells.map(([row, col]) => ({ row, col })),
    style: region.style ?? "box",
    cageValue: cageValue(region),
    textColor: region.fontC,
    borderColor: region.outlineC,
  }));
}

function renderLine(renderer: SvgRenderer, line: SudokuPadSourceLine, plan: ReturnType<typeof recognizeSudokuPadRenderFeatures>): void {
  // Captured SudokuPad mutates 1px source lines to 2px immediately before feature handling.
  const normalized = line.thickness === 1 ? { ...line, thickness: 2 } : line;
  const feature = plan.lineFeature.get(line);
  if (feature === "palindrome") renderer.renderPalindrome(normalized);
  else if (feature === "sudokux+" || feature === "sudokux-") renderer.renderSudokuX(normalized);
  else renderer.renderLine({ ...normalized, target: normalized.target ?? "arrows" });
}

export function renderSudokuPadScene(svg: SVGSVGElement, scene: SudokuPadScene): SvgRenderer {
  ensureSudokuPadLayers(svg);
  const renderer = new SvgRenderer(svg);
  renderer.clearAllLayers();
  applySudokuPadFogClueVisibility(scene);
  renderHistoricalSudokuPadBackground(renderer, scene);
  const plan = recognizeSudokuPadRenderFeatures(scene);

  // Stock constructs the backing grid before loadPuzzle inserts any authored
  // arrows, lines, or graphics. This matters when those parts explicitly target
  // the `cell-grids` layer: same-layer insertion order changes SVG stacking.
  renderGrid(renderer, scene.rows, scene.cols);

  const renderArrow = (arrow: SudokuPadScene["arrows"][number]) => {
    const feature = plan.arrowFeature.get(arrow);
    const arrowSum = feature === "arrowsum" ? plan.arrowSums.get(arrow) : undefined;
    if (arrowSum) {
      const bulb = applyLegacyOpacity({ ...arrowSum.bulb }, scene.metadata);
      renderer.renderArrowSum({ arrow: arrowSum.arrow, bulb });
      return;
    }
    const littleKiller = feature === "littlekiller" ? plan.littleKillers.get(arrow) : undefined;
    if (littleKiller) {
      renderer.renderLittleKiller(littleKiller);
      return;
    }
    renderer.renderArrow({ ...arrow, target: arrow.target ?? "arrows" });
  };

  if (!scene.renderSettings.arrowsAboveLines) {
    scene.arrows.forEach(renderArrow);
    scene.lines.forEach((line) => renderLine(renderer, line, plan));
  } else {
    scene.lines.forEach((line) => renderLine(renderer, line, plan));
    scene.arrows.forEach(renderArrow);
  }

  const renderGraphic = (part: SudokuPadSourceGraphic, target: "underlay" | "overlay") => {
    const feature = plan.graphicFeature.get(part);
    if (feature === "arrowsum" || feature === "littlekiller") return;
    if (feature === "kropki") { renderer.renderKropki(part); return; }
    if (feature === "xv") { renderer.renderXV(part); return; }
    // inequality and windoku intentionally fall through to generic rendering in stock SudokuPad.
    renderGenericGraphic(renderer, part, target, scene);
  };
  scene.underlays.forEach((part) => renderGraphic(part, "underlay"));
  scene.overlays.forEach((part) => renderGraphic(part, "overlay"));

  renderCages(renderer, scene);
  // Stock recognizes the canonical four Windoku underlays during conversion,
  // then loadPuzzle appends matching windoku cages after the native cages/regions.
  scene.underlays.forEach((part) => {
    if (plan.graphicFeature.get(part) !== "windoku" || !part.center || !part.width || !part.height) return;
    const cells: Array<{ row: number; col: number }> = [];
    const row0 = Math.round(part.center[0] - part.height * 0.5);
    const col0 = Math.round(part.center[1] - part.width * 0.5);
    const row1 = Math.round(part.center[0] + part.height * 0.5 - 1);
    const col1 = Math.round(part.center[1] + part.width * 0.5 - 1);
    for (let row = row0; row <= row1; row += 1) for (let col = col0; col <= col1; col += 1) cells.push({ row, col });
    renderer.renderCage({ target: "cages", cells, style: "windoku" });
  });
  renderSudokuPadRowColLabels(renderer, scene);
  const rules = scene.metadata?.rules;
  const zeroIsTen = Array.isArray(rules)
    ? rules.includes("zeroisten")
    : typeof rules === "string" && rules.includes("zeroisten");
  renderSceneCells(renderer, scene.cells, zeroIsTen, scene.renderSettings);
  renderSudokuPadSudorkle(renderer, scene);

  // Stock experimental demo TmMBJj8jbr hides thermo-like graphics over its image.
  if (scene.renderSettings.experimentalMode && scene.puzzleId === "TmMBJj8jbr") {
    svg.querySelectorAll('.thermo-line, .thermo-bulb, rect[fill="#a0a0a0"]').forEach((part) => part.setAttribute("opacity", "0"));
  }

  const viewBox = computeSudokuPadViewBox(renderer);
  renderer.adjustViewBox(viewBox.left, viewBox.top, viewBox.width, viewBox.height);
  return renderer;
}
