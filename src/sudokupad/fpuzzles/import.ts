import { md5Digest } from "../utils/md5";
import { compressPuzzleBase64 } from "../codecs/base64Puzzle";
import type {
  SudokuPadMetadata,
  SudokuPadPoint,
  SudokuPadSourceCage,
  SudokuPadSourceGraphic,
  SudokuPadSourcePuzzle,
} from "../types/source";
import type { FpuzzlesPart, FpuzzlesPuzzle } from "./types";

export const FPUZZLES_HIGHLIGHT_COLOURS = [
  "#a8a8a8a8", "#000", "#ffa0a0", "#ffdf61", "#feffaf", "#b0ffb0",
  "#61d060", "#d0d0ff", "#8180f0", "#ff08ff", "#ffd0d0",
] as const;

export const FPUZZLES_LAYER_ORDER = [
  "size", "title", "author", "ruleset", "clone", "grid", "disjointgroups", "thermometer",
  "killercage", "arrow", "difference", "ratio", "betweenline", "lockout", "quadruple",
  "rectangle", "circle", "text", "palindrome", "line", "minimum", "maximum",
] as const;

export const FPUZZLES_RECOGNIZED_KEYS = [
  "size", "disabledlogic", "truecandidatesoptions", "grid", "author", "title", "ruleset", "solution",
  "antiknight", "antiking", "nonconsecutive", "littlekillersum", "arrow", "killercage", "cage",
  "fogofwar", "foglight", "diagonal+", "diagonal-", "ratio", "difference", "xv", "thermometer",
  "palindrome", "sandwichsum", "even", "odd", "extraregion", "clone", "quadruple", "betweenline",
  "lockout", "minimum", "maximum", "line", "rectangle", "circle", "text", "disjointgroups",
  "negative", "triggereffect",
] as const;

const LITTLE_KILLER_DIRS: Record<string, SudokuPadPoint> = {
  UR: [-1, 1], UL: [-1, -1], DR: [1, 1], DL: [1, -1],
};

function cloneJson<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value)) as T;
}

function triangularNumber(value: number): number {
  const abs = Math.abs(value);
  return ((abs / 2) * (abs + 1)) * (abs / value) || 0;
}

function getRegionShape(size = 9): [number, number] {
  let height = Math.sqrt(size);
  if (Number.isInteger(height)) return [height, height];
  for (height = Math.floor(height); !Number.isInteger(size / height) && height > 1; height -= 1) { /* exact upstream loop */ }
  return height > 0 ? [height, size / height] : [1, 1];
}

function fpuzzlesParseRC(rc: string): SudokuPadPoint {
  const match = rc.match(/R(\d+(?:\.\d*)?)C(\d+(?:\.\d*)?)/);
  if (!match) throw new Error(`Invalid F-Puzzles cell reference: ${rc}`);
  return [Number(match[1]) - 1, Number(match[2]) - 1];
}

function offsetRC(rowOffset: number, colOffset: number): (point: SudokuPadPoint) => SudokuPadPoint {
  return ([r, c]) => [r + rowOffset, c + colOffset];
}

function getPartCenter(part: FpuzzlesPart): SudokuPadPoint {
  if (typeof part.cell === "string") return offsetRC(0.5, 0.5)(fpuzzlesParseRC(part.cell));
  if (Array.isArray(part.cells) && part.cells.length > 0) {
    const [row, col] = part.cells.reduce<SudokuPadPoint>(([r, c], rc) => {
      const [rr, cc] = fpuzzlesParseRC(rc);
      return [r + rr + 0.5, c + cc + 0.5];
    }, [0, 0]);
    return [row / part.cells.length, col / part.cells.length];
  }
  throw new Error(`Unable to calculate part center for: ${JSON.stringify(part)}`);
}

function puzzleHas(puzzle: SudokuPadSourcePuzzle, feature: string, part: unknown): boolean {
  const values = puzzle[feature];
  return Array.isArray(values) && values.map((entry) => JSON.stringify(entry)).includes(JSON.stringify(part));
}

function puzzleAdd(puzzle: SudokuPadSourcePuzzle, feature: string, part: unknown, unique = false): void {
  if (!Array.isArray(puzzle[feature])) puzzle[feature] = [];
  if (unique && puzzleHas(puzzle, feature, part)) return;
  let cleanPart = part;
  if (cleanPart !== null && typeof cleanPart === "object" && !Array.isArray(cleanPart)) {
    cleanPart = Object.fromEntries(Object.entries(cleanPart as Record<string, unknown>).filter(([, value]) => value !== undefined));
  }
  (puzzle[feature] as unknown[]).push(cleanPart);
}

function puzzleAddMeta(puzzle: SudokuPadSourcePuzzle, key: string, value: unknown): void {
  if (!puzzle.metadata) puzzle.metadata = {};
  const metadata = puzzle.metadata as Record<string, unknown>;
  if (metadata[key] === undefined) metadata[key] = value;
  else {
    if (!Array.isArray(metadata[key])) metadata[key] = [metadata[key]];
    (metadata[key] as unknown[]).push(value);
  }
}

function puzzleAddFogLamp(fpuzzle: FpuzzlesPuzzle, puzzle: SudokuPadSourcePuzzle, [r, c]: SudokuPadPoint): void {
  const rows = fpuzzle.grid?.length ?? 0;
  const cols = fpuzzle.grid?.[0]?.length ?? 0;
  // Intentionally preserves SudokuPad's captured row/column bounds ordering.
  for (let r0 = Math.max(0, r - 1), r1 = Math.min(cols - 1, r + 1); r0 <= r1; r0 += 1) {
    for (let c0 = Math.max(0, c - 1), c1 = Math.min(rows - 1, c + 1); c0 <= c1; c0 += 1) {
      puzzleAdd(puzzle, "foglight", [r0, c0], true);
    }
  }
}

function createBlankPuzzle(fpuzzle: FpuzzlesPuzzle, puzzle: SudokuPadSourcePuzzle): void {
  puzzle.cellSize = 50;
  puzzle.cells = [];
  puzzle.regions = [];
  if (fpuzzle.metadata) puzzle.metadata = cloneJson(fpuzzle.metadata) as SudokuPadMetadata;

  const regionShape = getRegionShape(fpuzzle.size ?? 9);
  const regions: Record<string, SudokuPadPoint[]> = {};
  if (Array.isArray(fpuzzle.grid)) {
    fpuzzle.grid.forEach((row, r) => {
      const newRow: Array<Record<string, unknown>> = [];
      puzzleAdd(puzzle, "cells", newRow);
      row.forEach((cell, c) => {
        const newCell: Record<string, unknown> = {};
        newRow.push(newCell);
        if (cell.given) newCell.value = cell.value;
        if (cell.centerPencilMarks) newCell.centremarks = cloneJson(cell.centerPencilMarks);
        if (cell.cornerPencilMarks) newCell.pencilMarks = cloneJson(cell.cornerPencilMarks);
        const region = cell.region === null
          ? "null"
          : cell.region === undefined
            ? Math.floor(r / regionShape[0]) * regionShape[0] + Math.floor(c / regionShape[1])
            : Number(cell.region);
        const key = String(region);
        if (!regions[key]) regions[key] = [];
        regions[key].push([r, c]);
      });
    });
  }
  if (regions.null !== undefined) {
    puzzleAdd(puzzle, "cages", { cells: regions.null, unique: false, hidden: true });
    delete regions.null;
  }
  Object.keys(regions).forEach((region) => puzzleAdd(puzzle, "regions", regions[region]));
}

const RE_META_TAGS = /^([^: ]+):\s*([\s\S]+)/m;
const RE_TRANSPARENT_COLOR = /#([0-9a-f]{3}0|[0-9a-f]{6}00)/i;
const RE_ALL_BLANK_SOLUTION = /^([.]*|0*)$/;

function parseMetadataCages(fpuzzle: FpuzzlesPuzzle, puzzle: SudokuPadSourcePuzzle): void {
  (fpuzzle.cage ?? []).forEach((cage) => {
    const noCells = (cage.cells ?? []).length === 0;
    const noColor = RE_TRANSPARENT_COLOR.test(cage.fontC ?? "#0000") && RE_TRANSPARENT_COLOR.test(cage.outlineC ?? "#0000");
    const match = String(cage.value ?? "").match(RE_META_TAGS);
    if ((noCells || noColor) && match) puzzleAddMeta(puzzle, match[1], match[2]);
  });
}

function parseImplicitSolution(fpuzzle: FpuzzlesPuzzle, puzzle: SudokuPadSourcePuzzle): void {
  if (puzzle.metadata?.solution !== undefined || !Array.isArray(fpuzzle.grid)) return;
  const solution: string[] = [];
  for (const row of fpuzzle.grid) {
    for (const cell of row) {
      if (!/^\d$/.test(String(cell.value ?? ""))) return;
      solution.push(String(cell.value));
    }
  }
  puzzleAddMeta(puzzle, "solution", solution.join(""));
}

function addMetadataCage(puzzle: SudokuPadSourcePuzzle, from: keyof FpuzzlesPuzzle, to: string, fpuzzle: FpuzzlesPuzzle): void {
  const value = fpuzzle[from];
  if (value) puzzleAdd(puzzle, "cages", { value: `${to}: ${String(value)}` });
}

function applyDefaultMeta(
  fpuzzle: FpuzzlesPuzzle,
  puzzle: SudokuPadSourcePuzzle,
  name: "title" | "author" | "rules",
  defaultValue: string,
): void {
  const sourceName = name === "rules" ? "ruleset" : name;
  if (fpuzzle[sourceName] !== undefined) return;
  const cages = puzzle.cages ?? [];
  if (!cages.find((cage) => String(cage.value ?? "").startsWith(`${name}: `))) {
    puzzleAdd(puzzle, "cages", { value: `${name}: ${defaultValue}` });
  }
}

function parseGridColours(fpuzzle: FpuzzlesPuzzle, puzzle: SudokuPadSourcePuzzle): void {
  fpuzzle.grid?.forEach((row, r) => row.forEach((cell, c) => {
    let color = cell.c ?? cell.cArray?.[0];
    const palette = FPUZZLES_HIGHLIGHT_COLOURS[Number.parseInt(String(color), 10)];
    if (palette !== undefined) color = palette;
    if (color !== null && color !== undefined) {
      puzzleAdd(puzzle, "underlays", { backgroundColor: color, center: [r + 0.5, c + 0.5], rounded: false, width: 1, height: 1 });
    }
  }));
}

function parseArrow(fpuzzle: FpuzzlesPuzzle, puzzle: SudokuPadSourcePuzzle): void {
  let customStyle: Record<string, Record<string, unknown>> = {};
  try { customStyle = JSON.parse(String(puzzle.metadata?.customstyle ?? "{}")) as Record<string, Record<string, unknown>>; }
  catch { customStyle = {}; }
  if (customStyle.bulb?.color) customStyle.bulb.borderColor = customStyle.bulb.color;

  (fpuzzle.arrow ?? []).forEach((part) => {
    (part.lines ?? []).forEach((sourceLine) => {
      const line = sourceLine.map(fpuzzlesParseRC).map(offsetRC(0.5, 0.5));
      if (line.length <= 1) throw new Error("Arrow has less than one point");
      const dr = line[1][0] - line[0][0];
      const dc = line[1][1] - line[0][1];
      const dist = Math.sqrt(dr * dr + dc * dc);
      line[0][0] += Math.round(40 * Math.sign(dr) / dist) / 100;
      line[0][1] += Math.round(40 * Math.sign(dc) / dist) / 100;
      puzzleAdd(puzzle, "arrows", Object.assign({ color: "#a1a1a1", headLength: 0.3, thickness: 5, wayPoints: line }, customStyle.arrow));
    });

    const cells = (part.cells ?? []).map(fpuzzlesParseRC).map(offsetRC(0.5, 0.5));
    if (!cells.length) return;
    const min: SudokuPadPoint = [999, 999];
    const max: SudokuPadPoint = [-999, -999];
    cells.forEach(([r, c]) => { min[0] = Math.min(min[0], r); max[0] = Math.max(max[0], r); min[1] = Math.min(min[1], c); max[1] = Math.max(max[1], c); });
    if (max[0] === min[0] || max[1] === min[1]) {
      puzzleAdd(puzzle, "overlays", Object.assign({
        borderColor: "#a1a1a1", backgroundColor: "#ffffff", center: getPartCenter(part), fontSize: 16,
        borderSize: 5, rounded: true, text: "", width: max[1] - min[1] + 0.83, height: max[0] - min[0] + 0.83,
      }, customStyle.bulb));
    } else {
      const thickness = Math.round(0.7 * 64);
      puzzleAdd(puzzle, "lines", Object.assign({ color: "#a1a1a1", thickness, opacity: 0.7, wayPoints: cells }, customStyle.bulb));
      puzzleAdd(puzzle, "lines", { color: "#ffffff", thickness: thickness - 10, opacity: 0.8, wayPoints: cells });
    }
  });
}

function parseMinMax(puzzle: SudokuPadSourcePuzzle, parts: FpuzzlesPart[] = [], inwards = true): void {
  const minRC: SudokuPadPoint = [1, 1];
  const maxRC: SudokuPadPoint = [puzzle.cells.length, puzzle.cells[0]?.length ?? 0];
  const a = inwards ? 0.44 : 0.39;
  const b = inwards ? 0.39 : 0.44;
  const otherRCs = parts.map(({ cell }) => cell);
  parts.forEach((part) => {
    const center = getPartCenter(part);
    puzzleAdd(puzzle, "underlays", { backgroundColor: "#ccc", center, rounded: false, width: 1, height: 1 });
    ([[-1, 0], [0, 1], [1, 0], [0, -1]] as SudokuPadPoint[]).forEach(([dy, dx]) => {
      const neighbourRC: SudokuPadPoint = [Math.floor(center[0] + dy + 1), Math.floor(center[1] + dx + 1)];
      if (neighbourRC[0] < minRC[0] || neighbourRC[1] < minRC[1] || neighbourRC[0] > maxRC[0] || neighbourRC[1] > maxRC[1]) return;
      if (otherRCs.includes(`R${neighbourRC[0]}C${neighbourRC[1]}`)) return;
      puzzleAdd(puzzle, "lines", {
        color: "#000000", thickness: 1,
        wayPoints: [
          [center[0] + dy * a + 0.1 * dx, center[1] + dx * a + 0.1 * dy],
          [center[0] + dy * b, center[1] + dx * b],
          [center[0] + dy * a - 0.1 * dx, center[1] + dx * a - 0.1 * dy],
        ],
      });
    });
  });
}

function parseFeature(feature: string, fpuzzle: FpuzzlesPuzzle, puzzle: SudokuPadSourcePuzzle): boolean {
  switch (feature) {
    case "size": case "disabledlogic": case "truecandidatesoptions": return true;
    case "grid": parseGridColours(fpuzzle, puzzle); return true;
    case "author": addMetadataCage(puzzle, "author", "author", fpuzzle); return true;
    case "title": addMetadataCage(puzzle, "title", "title", fpuzzle); return true;
    case "ruleset": addMetadataCage(puzzle, "ruleset", "rules", fpuzzle); return true;
    case "solution": {
      const solution = fpuzzle.solution ?? [];
      const values = typeof solution === "string" ? solution.split(solution.includes(",") ? "," : "") : solution;
      const normalized = values.map((value) => String(value).length > 1 ? "?" : String(value)).join("");
      if (!RE_ALL_BLANK_SOLUTION.test(normalized)) puzzleAdd(puzzle, "cages", { value: `solution: ${normalized}` });
      return true;
    }
    case "antiknight": puzzleAddMeta(puzzle, "antiknight", fpuzzle.antiknight); if (fpuzzle.antiknight) puzzleAdd(puzzle, "global", "antiknight"); return true;
    case "antiking": puzzleAddMeta(puzzle, "antiking", fpuzzle.antiking); if (fpuzzle.antiking) puzzleAdd(puzzle, "global", "antiking"); return true;
    case "nonconsecutive": if (fpuzzle.nonconsecutive) puzzleAdd(puzzle, "global", "nonconsecutive"); return true;
    case "littlekillersum":
      (fpuzzle.littlekillersum ?? []).forEach((part) => {
        const rc = offsetRC(0.5, 0.5)(fpuzzlesParseRC(String(part.cell)));
        const dir = LITTLE_KILLER_DIRS[String(part.direction)];
        if (!dir) return;
        const text = part.value !== undefined ? part.value : "_";
        puzzleAdd(puzzle, "arrows", { color: "#000000", thickness: 2, wayPoints: [[rc[0] + 0.3 * dir[0], rc[1] + 0.3 * dir[1]], [rc[0] + 0.48 * dir[0], rc[1] + 0.48 * dir[1]]] });
        puzzleAdd(puzzle, "overlays", { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF", center: rc, fontSize: 28, width: 0.25, height: 0.25, rounded: false, text });
      }); return true;
    case "arrow": parseArrow(fpuzzle, puzzle); return true;
    case "killercage":
      (fpuzzle.killercage ?? []).forEach((cage) => {
        const result: SudokuPadSourceCage = { cells: [], unique: true };
        if (Array.isArray(cage.cells)) result.cells = cage.cells.map(fpuzzlesParseRC);
        if (cage.value) result.value = cage.value;
        const text = String(cage.value ?? "");
        if (Number.isInteger(Number(text)) && String(Number(text)) === text) result.sum = Number.parseInt(text, 10);
        puzzleAdd(puzzle, "cages", result);
      }); return true;
    case "cage":
      (fpuzzle.cage ?? []).forEach((cage) => {
        if (cage.value === "FOW" && cage.cells?.length === 1) { puzzleAddFogLamp(fpuzzle, puzzle, fpuzzlesParseRC(cage.cells[0])); return; }
        if (cage.value === "FOGLIGHT") { (cage.cells ?? []).forEach((rc) => puzzleAdd(puzzle, "foglight", fpuzzlesParseRC(rc), true)); return; }
        const cageOpts = { ...cloneJson(cage), cells: (cage.cells ?? []).map(fpuzzlesParseRC) } as SudokuPadSourceCage;
        if (cageOpts.style === undefined) {
          if (cage.fromConstraint === "Row Indexer") cageOpts.style = "fpRowIndexer";
          if (cage.fromConstraint === "Column Indexer") cageOpts.style = "fpColumnIndexer";
          if (cage.fromConstraint === "Box Indexer") cageOpts.style = "fpBoxIndexer";
        }
        if (typeof cage.value === "string" && /^[a-z]+: /.test(cage.value)) delete (cageOpts as Partial<SudokuPadSourceCage>).cells;
        puzzleAdd(puzzle, "cages", cageOpts);
      }); return true;
    case "fogofwar": (fpuzzle.fogofwar ?? []).forEach((rc) => puzzleAddFogLamp(fpuzzle, puzzle, fpuzzlesParseRC(rc))); return true;
    case "foglight": (fpuzzle.foglight ?? []).forEach((rc) => puzzleAdd(puzzle, "foglight", fpuzzlesParseRC(rc), true)); return true;
    case "diagonal+": if (fpuzzle["diagonal+"]) puzzleAdd(puzzle, "lines", { color: "#34BBE6", thickness: 2, wayPoints: [[0, Math.max(...puzzle.cells.map((row) => row.length))], [puzzle.cells.length, 0]] }); return true;
    case "diagonal-": if (fpuzzle["diagonal-"]) puzzleAdd(puzzle, "lines", { color: "#34BBE6", thickness: 2, wayPoints: [[0, 0], [puzzle.cells.length, Math.max(...puzzle.cells.map((row) => row.length))]] }); return true;
    case "ratio":
      (fpuzzle.ratio ?? []).forEach((part) => { const opts: SudokuPadSourceGraphic = { borderColor: "#000000", backgroundColor: "#000000", center: getPartCenter(part), rounded: true, width: 0.3, height: 0.3, text: "" }; if (part.value) Object.assign(opts, { color: "#fff", stroke: "none", text: part.value }); puzzleAdd(puzzle, "overlays", opts); }); return true;
    case "difference":
      (fpuzzle.difference ?? []).forEach((part) => { const opts: SudokuPadSourceGraphic = { borderColor: "#000000", backgroundColor: "#FFFFFF", center: getPartCenter(part), rounded: true, width: 0.3, height: 0.3, text: "" }; if (part.value) Object.assign(opts, { color: "#000", stroke: "none", text: part.value }); puzzleAdd(puzzle, "overlays", opts); }); return true;
    case "xv": (fpuzzle.xv ?? []).forEach((part) => puzzleAdd(puzzle, "overlays", { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF", center: getPartCenter(part), fontSize: 21, rounded: false, width: 0.25, height: 0.25, text: part.value })); return true;
    case "thermometer":
      (fpuzzle.thermometer ?? []).forEach((part) => (part.lines ?? []).forEach((sourceLine) => { const line = sourceLine.map(fpuzzlesParseRC).map(offsetRC(0.5, 0.5)); puzzleAdd(puzzle, "underlays", { borderColor: "#CFCFCF", backgroundColor: "#CFCFCF", center: line[0], rounded: true, width: 0.85, height: 0.85 }); puzzleAdd(puzzle, "lines", { color: "#CFCFCF", thickness: 21, wayPoints: line }); })); return true;
    case "palindrome": (fpuzzle.palindrome ?? []).forEach((part) => (part.lines ?? []).forEach((line) => puzzleAdd(puzzle, "lines", { color: "#CFCFCF", thickness: 16, wayPoints: line.map(fpuzzlesParseRC).map(offsetRC(0.5, 0.5)) }))); return true;
    case "sandwichsum": (fpuzzle.sandwichsum ?? []).forEach((part) => puzzleAdd(puzzle, "overlays", { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF", center: getPartCenter(part), fontSize: 32, rounded: false, width: 0.25, height: 0.25, text: part.value })); return true;
    case "even": (fpuzzle.even ?? []).forEach((part) => puzzleAdd(puzzle, "underlays", { borderColor: "#CFCFCF", backgroundColor: "#CFCFCF", center: getPartCenter(part), rounded: false, width: 0.7, height: 0.7 })); return true;
    case "odd": (fpuzzle.odd ?? []).forEach((part) => puzzleAdd(puzzle, "underlays", { borderColor: "#CFCFCF", backgroundColor: "#CFCFCF", center: offsetRC(0.5, 0.5)(fpuzzlesParseRC(String(part.cell))), rounded: true, width: 0.7, height: 0.7 })); return true;
    case "extraregion": (fpuzzle.extraregion ?? []).forEach((part) => { const cells = (part.cells ?? []).map(fpuzzlesParseRC); puzzleAdd(puzzle, "cages", { style: "extraregion", unique: true, sum: triangularNumber(cells.length), cells }); }); return true;
    case "clone": (fpuzzle.clone ?? []).forEach((part) => [...(part.cells ?? []), ...(part.cloneCells ?? [])].map(fpuzzlesParseRC).map(offsetRC(0.5, 0.5)).forEach((cell) => puzzleAdd(puzzle, "underlays", { borderColor: "#CFCFCF", backgroundColor: "#CFCFCF", center: cell, rounded: false, width: 1, height: 1 }))); return true;
    case "quadruple": (fpuzzle.quadruple ?? []).forEach((part) => puzzleAdd(puzzle, "overlays", { backgroundColor: "#FFFFFF", borderColor: "#000000", center: getPartCenter(part), fontSize: 14, rounded: true, width: 0.7, height: 0.7, text: (part.values ?? []).reduce((acc, cur, idx) => acc + (idx % 2 === 1 ? " " : "") + (idx % 3 === 2 ? "\n" : "") + String(cur), "") })); return true;
    case "betweenline":
      (fpuzzle.betweenline ?? []).forEach((part) => (part.lines ?? []).forEach((sourceLine) => {
        const line = sourceLine.map(fpuzzlesParseRC).map(offsetRC(0.5, 0.5)); if (line.length < 2) return;
        const last = line.length - 1;
        puzzleAdd(puzzle, "overlays", { borderColor: "#CFCFCF", backgroundColor: "#FFFFFF", center: [...line[0]], fontSize: 16, borderSize: 2, rounded: true, width: 0.8, height: 0.8 });
        puzzleAdd(puzzle, "overlays", { borderColor: "#CFCFCF", backgroundColor: "#FFFFFF", center: [...line[last]], fontSize: 16, borderSize: 2, rounded: true, width: 0.8, height: 0.8 });
        let dr = line[1][0] - line[0][0]; let dc = line[1][1] - line[0][1]; let dist = Math.sqrt(dr * dr + dc * dc);
        line[0][0] += Math.round(4 * Math.sign(dr) / dist) / 10; line[0][1] += Math.round(4 * Math.sign(dc) / dist) / 10;
        dr = line[last - 1][0] - line[last][0]; dc = line[last - 1][1] - line[last][1]; dist = Math.sqrt(dr * dr + dc * dc);
        line[last][0] += Math.round(4 * Math.sign(dr) / dist) / 10; line[last][1] += Math.round(4 * Math.sign(dc) / dist) / 10;
        puzzleAdd(puzzle, "lines", { color: "#CFCFCF", thickness: 2, wayPoints: line });
      })); return true;
    case "lockout": return true;
    case "minimum": parseMinMax(puzzle, fpuzzle.minimum, true); return true;
    case "maximum": parseMinMax(puzzle, fpuzzle.maximum, false); return true;
    case "line": (fpuzzle.line ?? []).forEach((part) => (part.lines ?? []).forEach((points) => puzzleAdd(puzzle, "lines", { color: part.outlineC, thickness: 32 * Number(part.width), wayPoints: points.map(fpuzzlesParseRC).map(offsetRC(0.5, 0.5)) }))); return true;
    case "rectangle": (fpuzzle.rectangle ?? []).forEach((part) => puzzleAdd(puzzle, "overlays", { backgroundColor: part.baseC, borderColor: part.outlineC, center: getPartCenter(part), borderSize: 1, rounded: false, width: part.width, height: part.height, text: part.value, angle: part.angle })); return true;
    case "circle": (fpuzzle.circle ?? []).forEach((part) => puzzleAdd(puzzle, "overlays", { backgroundColor: part.baseC, borderColor: part.outlineC, textColor: part.fontC, center: getPartCenter(part), borderSize: 1, rounded: true, width: part.width, height: part.height, text: part.value, angle: part.angle })); return true;
    case "text": (fpuzzle.text ?? []).forEach((part) => { const text = part.value && String(part.value).replace(/ /g, " "); if (typeof text === "string" && text.length > 0) puzzleAdd(puzzle, "overlays", { color: part.fontC, textStroke: ["#fff", "#ffffff"].includes((part.fontC ?? "").toLowerCase()) ? "#000" : "#fff", center: getPartCenter(part), fontSize: Math.round(32 * (part.size ?? 1)), rounded: false, width: 0.25, height: 0.25, text, angle: part.angle }); }); return true;
    case "disjointgroups": {
      const regions = puzzle.regions ?? [];
      const largestRegion = regions.reduce((max, region) => Math.max(region.length, max), 0);
      const groups: SudokuPadPoint[][] = [];
      for (let c = 0; c < largestRegion; c += 1) { groups[c] = []; for (let r = 0; r < regions.length; r += 1) if (regions[r][c] !== undefined) groups[c].push(regions[r][c]); }
      groups.forEach((cells) => puzzleAdd(puzzle, "cages", { cells, unique: true, type: "disjoint", style: null }));
      puzzleAdd(puzzle, "global", "disjoint"); return true;
    }
    case "negative": (fpuzzle.negative ?? []).forEach((constraint) => constraint === "foglight" ? puzzleAdd(puzzle, "foglight", [], true) : puzzleAdd(puzzle, "global", `anti${constraint}`)); return true;
    case "triggereffect": (fpuzzle.triggereffect ?? []).forEach((part) => puzzleAdd(puzzle, "triggereffect", cloneJson(part))); return true;
    default: return false;
  }
}

export interface ImportFpuzzlesResult {
  puzzle: SudokuPadSourcePuzzle;
  unsupportedKeys: string[];
}

/** Port of loadFPuzzle.parseFPuzzle from the captured SudokuPad 0.612.0 build. */
export function importFpuzzlesPuzzle(fpuzzle: FpuzzlesPuzzle): ImportFpuzzlesResult {
  const compressedIdentity = compressPuzzleBase64(JSON.stringify(fpuzzle));
  const puzzle: SudokuPadSourcePuzzle = { id: `fpuzzle${md5Digest(compressedIdentity)}`, cells: [] };
  createBlankPuzzle(fpuzzle, puzzle);
  parseMetadataCages(fpuzzle, puzzle);
  parseImplicitSolution(fpuzzle, puzzle);

  const features = [...new Set([...FPUZZLES_LAYER_ORDER, ...Object.keys(fpuzzle)])].filter((key) => fpuzzle[key] !== undefined);
  const unsupportedKeys: string[] = [];
  for (const feature of features) if (!parseFeature(feature, fpuzzle, puzzle)) unsupportedKeys.push(feature);

  applyDefaultMeta(fpuzzle, puzzle, "title", "Untitled");
  applyDefaultMeta(fpuzzle, puzzle, "author", "Unknown");
  applyDefaultMeta(fpuzzle, puzzle, "rules", "No rules provided for this puzzle. Please check the related video or website for rules.");
  return { puzzle, unsupportedKeys };
}
