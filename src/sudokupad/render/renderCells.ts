import type { SudokuPadSceneCell } from "../types/scene";
import type { SudokuPadRenderSettings } from "../types/settings";
import { CELL_COLOR_VALUES } from "./constants";
import type { SvgRenderer } from "./SvgRenderer";

function displayZeroIsTen(value: string, zeroIsTen: boolean): string {
  return zeroIsTen ? value.replace("0", "10") : value;
}

/** Exact stock FeatureCompactMarks candidate range compaction. */
function compactCandidateRanges(candidates: string[]): string[] {
  if (candidates.length === 0) return [];
  const RANGE_MIN_SIZE = 5;
  const ranges: string[] = [];
  let rangeStart = 0;
  let rangeLength = 1;
  let index = 1;
  for (; index < candidates.length; index += 1) {
    if (Number.parseInt(candidates[rangeStart], 10) + rangeLength === Number.parseInt(candidates[index], 10)) {
      rangeLength += 1;
    } else {
      if (rangeLength >= RANGE_MIN_SIZE) {
        ranges.push(`${candidates[rangeStart]}-${Number.parseInt(candidates[rangeStart], 10) + rangeLength - 1}`);
      } else {
        for (let j = rangeStart; j < index; j += 1) ranges.push(candidates[j]);
      }
      rangeStart = index;
      rangeLength = 1;
    }
  }
  if (rangeLength >= RANGE_MIN_SIZE) {
    ranges.push(`${candidates[rangeStart]}-${Number.parseInt(candidates[rangeStart], 10) + rangeLength - 1}`);
  } else {
    for (let j = rangeStart; j < index; j += 1) ranges.push(candidates[j]);
  }
  return ranges;
}

export function renderSceneCells(
  renderer: SvgRenderer,
  cells: SudokuPadSceneCell[][],
  zeroIsTen = false,
  settings?: Pick<SudokuPadRenderSettings, "compactMarks">,
): void {
  cells.forEach((row, rowIndex) => row.forEach((cell, colIndex) => {
    const center: [number, number] = [rowIndex + 0.5, colIndex + 0.5];
    if (cell.highlighted) renderer.renderRect({ target: "cell-highlights", className: "cell-highlight", center, width: 1, height: 1 });
    if (cell.hasError) renderer.renderRect({ target: "cell-errors", className: "cell-error", center, width: 1, height: 1 });

    const colours = cell.colours ?? [];
    colours.forEach((colour, index) => {
      renderer.renderCellWedge({
        target: "cell-colors",
        className: `cell-color color-${colour}`,
        color: CELL_COLOR_VALUES[String(colour)] ?? String(colour),
        a1: 25 + index * (360 / colours.length),
        a2: 25 + (index + 1) * (360 / colours.length),
        center,
      });
    });

    // Stock fog keeps givens rendered in the masked cell-givens layer. When a
    // clue is fog-hidden, a normal/player value is allowed to coexist in the
    // unmasked cell-values layer. Outside fog, the usual given > value > marks
    // precedence applies.
    const given = cell.given;
    const value = cell.hideClue ? cell.value : (given === undefined ? cell.value : undefined);
    const marksAllowed = value === undefined && (cell.hideClue || given === undefined);
    const candidates = marksAllowed ? (cell.candidates ?? cell.givenCentremarks ?? []) : [];
    const pencilmarks = marksAllowed ? (cell.pencilmarks ?? cell.givenCornermarks ?? []) : [];

    if (given !== undefined && given !== "") {
      renderer.renderText({ target: "cell-givens", className: "cell-given", center, width: 1, height: 1, text: displayZeroIsTen(String(given), zeroIsTen) });
    }
    if (value !== undefined && value !== "") {
      renderer.renderText({ target: "cell-values", className: "cell-value", center, width: 1, height: 1, text: displayZeroIsTen(String(value), zeroIsTen) });
    }

    if (candidates.length > 0) {
      const elem = renderer.renderText({ target: "cell-candidates", className: "cell-candidate", center, width: 1, height: 1, text: "" });
      const renderedCandidates = settings?.compactMarks ? compactCandidateRanges(candidates.map(String)) : candidates.map(String);
      renderedCandidates.slice(0, 9).forEach((candidate) => {
        const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        tspan.dataset.val = String(candidate);
        if ((cell.givenCentremarks ?? []).includes(String(candidate))) tspan.classList.add("given");
        tspan.textContent = displayZeroIsTen(String(candidate), zeroIsTen);
        elem.appendChild(tspan);
      });
      elem.dataset.count = String(elem.textContent?.length ?? 0);
    }

    pencilmarks.slice(0, 10).forEach((mark, index) => {
      const elem = renderer.renderText({
        target: "cell-pencilmarks",
        className: `cell-pencilmark pm-${index}`,
        center,
        width: 1,
        height: 1,
        text: displayZeroIsTen(String(mark), zeroIsTen),
      });
      elem.dataset.val = String(mark);
      if ((cell.givenCornermarks ?? []).includes(String(mark))) elem.classList.add("givenCornermark");
    });

    const penPairs = (cell.pen ?? []).join("").match(/../g) ?? [];
    penPairs.forEach((pair) => {
      const [penValue, color] = pair.split("");
      if (!penValue || !color) return;
      renderer.renderPen({ row: rowIndex, col: colIndex, className: `cell-pen pen-${penValue} pencolor-${color}`, value: penValue });
    });
  }));
}
