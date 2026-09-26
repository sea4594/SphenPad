import type { SudokuPadScene } from "../types/scene";
import type { SudokuPadPoint, SudokuPadSourceArrow, SudokuPadSourceGraphic, SudokuPadSourceLine } from "../types/source";

// Legacy feature matcher intentionally accepts heterogeneous decoded SudokuPad parts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Part = Record<string, any>;

type ArrowSumFeature = { arrow: SudokuPadSourceArrow; bulb: SudokuPadSourceGraphic };
type LittleKillerFeature = { arrow: SudokuPadSourceArrow; number: SudokuPadSourceGraphic; dir: string };

export type SudokuPadDetectedFeature =
  | "arrowsum" | "kropki" | "xv" | "littlekiller" | "inequality"
  | "sandwichcage" | "palindrome" | "sudokux+" | "sudokux-" | "windoku";

export interface SudokuPadRenderFeaturePlan {
  arrowSums: Map<SudokuPadSourceArrow, ArrowSumFeature>;
  littleKillers: Map<SudokuPadSourceArrow, LittleKillerFeature>;
  arrowFeature: Map<SudokuPadSourceArrow, SudokuPadDetectedFeature>;
  lineFeature: Map<SudokuPadSourceLine, SudokuPadDetectedFeature>;
  graphicFeature: Map<SudokuPadSourceGraphic, SudokuPadDetectedFeature>;
  detected: Record<string, number>;
}

const sameRC = (a: number[] = [], b: number[] = []): boolean => a[0] === b[0] && a[1] === b[1];
const toRC = ([r, c]: number[]): SudokuPadPoint => [Math.floor(r), Math.floor(c)];
const roundCenter = ([r, c]: number[]): SudokuPadPoint => [Math.floor(r) + 0.5, Math.floor(c) + 0.5];
const distance = (a: number[], b: number[]): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
const pathLength = (points: number[][] = []): number => points.reduce((sum, point, index) => sum + (index ? distance(points[index - 1], point) : 0), 0);
const angle = (a1: number[], a2: number[], b1: number[], b2: number[]): number => {
  const dax = a2[0] - a1[0], day = a2[1] - a1[1];
  const dbx = b2[0] - b1[0], dby = b2[1] - b1[1];
  let result = Math.atan2(dax * dby - day * dbx, dax * dbx + day * dby);
  if (result < 0) result *= -1;
  return result * (180 / Math.PI);
};

function featureCheckMinMax(part: Part, range: { min?: number; max?: number }): boolean {
  const { width, height } = part;
  const { min, max } = range;
  return (min ? (width ? width >= min : true) && (height ? height >= min : true) : true)
    && (max ? (width ? width <= max : true) && (height ? height <= max : true) : true);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function featureCheckSize(part: Part, sizes: any[]): boolean {
  return sizes.length === 1 && (sizes[0]?.min || sizes[0]?.max)
    ? featureCheckMinMax(part, sizes[0])
    : sizes.includes(part.height) && sizes.includes(part.width);
}

const isOnEdge = ([r, c]: number[]): boolean => ((Math.abs(r % 1) === 0) || (Math.abs(c % 1) === 0)) && (Math.abs(r % 1) !== Math.abs(c % 1));
const isInCell = ([r, c]: number[]): boolean => (Math.abs(r % 1) !== 0) && (Math.abs(c % 1) !== 0);
const isLineInCell = (points: number[][] = []): boolean => points.every(isInCell);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function featureCheck(part: Part, checks: Record<string, any>): boolean {
  let result = true;
  Object.keys(checks).forEach((key) => {
    const check = Array.isArray(checks[key]) ? checks[key] : [checks[key]];
    switch (key) {
      case "size": result = result && featureCheckSize(part, check); break;
      case "sizeMin": result = result && part.width >= check[0] && part.height >= check[0]; break;
      case "sizeMax": result = result && part.width <= check[0] && part.height <= check[0]; break;
      case "center": result = result && (typeof check[0] === "number" ? [check] : check).some((center: number[]) => sameRC(part.center, center)); break;
      case "centerRounded": result = result && (typeof check[0] === "number" ? [check] : check).some((center: number[]) => sameRC(roundCenter(part.center), roundCenter(center))); break;
      case "isOnEdge": result = result && isOnEdge(part.center) === check[0]; break;
      case "isInCell": result = result && isInCell(part.center) === check[0]; break;
      case "isLineInCell": result = result && isLineInCell(part.wayPoints) === check[0]; break;
      case "wayPointsCount": result = result && (part.wayPoints ?? []).length === check[0]; break;
      case "wayPointsCountMin": result = result && (part.wayPoints ?? []).length >= check[0]; break;
      case "wayPointsCountMax": result = result && (part.wayPoints ?? []).length <= check[0]; break;
      case "wayPointsLenMin": result = result && pathLength(part.wayPoints) >= check[0]; break;
      case "wayPointsLenMax": result = result && pathLength(part.wayPoints) <= check[0]; break;
      case "textMatch": result = result && String(part.text ?? "").match(check[0]) !== null; break;
      case "cellsMin": result = result && (part.cells ?? []).length >= check[0]; break;
      case "minThickness": result = result && part.thickness >= check[0]; break;
      case "hasFeature": result = result && (part.feature !== undefined) === check[0]; break;
      case "colorNoAlpha": result = result && (part.color?.length === 5 ? part.color.slice(0, 4) === check[0].slice(0, 4) : part.color?.slice(0, 7) === check[0].slice(0, 7)); break;
      case "color":
      case "borderColor":
        result = result && (part[key] !== undefined && check.includes(part[key])
          || check.includes(String(part[key]).toUpperCase())
          || check.includes(String(part[key]).toLowerCase()));
        break;
      default: result = result && check.includes(part[key]); break;
    }
  });
  return result;
}

function regionBounds(scene: SudokuPadScene): [SudokuPadPoint, SudokuPadPoint] {
  const cells = scene.regions.flatMap((region) => region.cells).filter(Array.isArray);
  const rows = cells.map(([row]) => row);
  const cols = cells.map(([, col]) => col);
  return [
    [rows.length ? Math.min(...rows) : 0, cols.length ? Math.min(...cols) : 0],
    [rows.length ? Math.max(...rows) : scene.rows - 1, cols.length ? Math.max(...cols) : scene.cols - 1],
  ];
}

export function recognizeSudokuPadRenderFeatures(scene: SudokuPadScene): SudokuPadRenderFeaturePlan {
  const plan: SudokuPadRenderFeaturePlan = {
    arrowSums: new Map(),
    littleKillers: new Map(),
    arrowFeature: new Map(),
    lineFeature: new Map(),
    graphicFeature: new Map(),
    detected: {},
  };
  const count = (name: string) => { plan.detected[name] = (plan.detected[name] ?? 0) + 1; };

  // Arrow sums.
  const arrowColors = ["#000000", "#CFCFCF", "#a1a1a1"];
  const bulbPool = [...scene.underlays, ...scene.overlays];
  for (const arrow of scene.arrows) {
    if (!featureCheck(arrow, { color: arrowColors, thickness: [2, 3, 5], headLength: 0.3, wayPointsCountMin: 2 })) continue;
    const points = arrow.wayPoints ?? [];
    const centers = [roundCenter(points[0]), roundCenter(points.at(-1)!)];
    let found: SudokuPadSourceGraphic | undefined;
    for (const bulb of bulbPool) {
      const width = Math.floor(Number(bulb.width)) + 1;
      const height = Math.floor(Number(bulb.height)) + 1;
      for (let x = 0; x < width && !found; x += 1) for (let y = 0; y < height && !found; y += 1) {
        const center = [Number(bulb.center?.[0]) - (height - 1) * 0.5 + y, Number(bulb.center?.[1]) - (width - 1) * 0.5 + x];
        if (centers.some((candidate) => sameRC(candidate, center)) && featureCheck({ ...bulb, center }, {
          sizeMin: 0.60, sizeMax: 2.90, borderColor: arrowColors, rounded: true, borderSize: [3,4,5,6,7,8,9,10],
        })) found = bulb;
      }
    }
    if (found) {
      plan.arrowSums.set(arrow, { arrow, bulb: found });
      plan.arrowFeature.set(arrow, "arrowsum");
      plan.graphicFeature.set(found, "arrowsum");
      count("arrowSums");
    }
  }

  // Kropki / XV.
  for (const part of scene.overlays) {
    if (featureCheck(part, { size: [0.25, 0.3, 0.35], rounded: true, borderColor: "#000000", backgroundColor: ["#FFFFFF", "#000000"], isOnEdge: true })) {
      plan.graphicFeature.set(part, "kropki"); count("kropkis");
    }
  }
  // XV runs after Kropki in SudokuPad and therefore overwrites feature assignment.
  for (const part of scene.overlays) {
    if (featureCheck(part, { size: [0.25], text: ["X", "V", "XV"], isOnEdge: true })) {
      plan.graphicFeature.set(part, "xv"); count("xvs");
    }
  }

  // Little killers.
  for (const arrow of scene.arrows) {
    if (!featureCheck(arrow, { thickness: [2, 3, 4, 5], headLength: 0.3, color: ["#000000", "#CFCFCF"], wayPointsCount: 2, wayPointsLenMax: 1 })) continue;
    const points = arrow.wayPoints ?? [];
    const start = points[0];
    const outside = start[0] < 0 || start[0] > scene.rows || start[1] < 0 || start[1] > scene.cols;
    if (!outside) continue;
    const number = scene.overlays.find((part) => featureCheck(part, {
      size: [0.25, 0.65], fontSize: [20, 24, 28], textMatch: /[0-9]+/, centerRounded: start,
    }));
    if (number) {
      const dx = points[1][1] - points[0][1], dy = points[1][0] - points[0][0];
      plan.littleKillers.set(arrow, { arrow, number, dir: `${dx > 0 ? "rt" : "lt"}${dy > 0 ? "dn" : "up"}` });
      plan.arrowFeature.set(arrow, "littlekiller");
      plan.graphicFeature.set(number, "littlekiller");
      count("littleKiller");
    }
  }

  // Inequality lines/overlays (visual rendering remains generic).
  for (const line of scene.lines) {
    if (!featureCheck(line, { thickness: [1], color: "#000000", wayPointsCount: 3, wayPointsLenMin: 1, wayPointsLenMax: 2 })) continue;
    const points = line.wayPoints ?? [];
    const a = angle(points[1], points[0], points[1], points[2]);
    const inside = (p: number[]) => p[0] >= 0 || p[0] < scene.rows || p[1] >= 0 || p[1] < scene.cols; // captured SudokuPad uses ORs here
    if (a > 35 && a < 55 && points.every(inside) && sameRC(toRC(points[0]), toRC(points[2])) && !sameRC(toRC(points[0]), toRC(points[1]))) {
      plan.lineFeature.set(line, "inequality"); count("inequality");
    }
  }
  for (const part of scene.overlays) {
    if (featureCheck(part, { textMatch: /[<>^v]/, width: 0.25, height: 0.25, isOnEdge: true })) {
      plan.graphicFeature.set(part, "inequality"); count("inequality");
    }
  }

  // Sandwich cages: only the line rendering path changes, and only via the standard line renderer.
  for (const cage of scene.cages) {
    if (!featureCheck(cage, { cellsMin: 2 })) continue;
    const line = scene.lines.find((candidate) => featureCheck(candidate, { thickness: 1, color: "#D23BE7" })
      && (candidate.wayPoints ?? []).every((p) => cage.cells.some((cell) => sameRC(toRC(p), toRC(cell)))));
    if (line) { plan.lineFeature.set(line, "sandwichcage"); count("sandwichCages"); }
  }

  // Palindromes.
  for (const line of scene.lines) {
    if (line.feature === undefined && !plan.lineFeature.has(line) && featureCheck(line, { color: "#CFCFCF", wayPointsCountMin: 2, thickness: [11, 12] })) {
      plan.lineFeature.set(line, "palindrome"); count("palindrome");
    }
  }

  // Sudoku-X.
  const [minRC, maxRC] = regionBounds(scene);
  const positive = [
    JSON.stringify([[minRC[0], maxRC[1] + 1], [maxRC[0] + 1, minRC[1]]]),
    JSON.stringify([[maxRC[0] + 1, minRC[1]], [minRC[0], maxRC[1] + 1]]),
  ];
  const negative = [
    JSON.stringify([[minRC[0], minRC[1]], [maxRC[0] + 1, maxRC[1] + 1]]),
    JSON.stringify([[maxRC[0] + 1, maxRC[1] + 1], [minRC[0], minRC[1]]]),
  ];
  for (const line of scene.lines) {
    if (!featureCheck(line, { color: "#34BBE6", wayPointsCount: 2, thickness: [1, 2] })) continue;
    const encoded = JSON.stringify(line.wayPoints);
    if (positive.includes(encoded)) { plan.lineFeature.set(line, "sudokux+"); count("sudokuX"); }
    else if (negative.includes(encoded)) { plan.lineFeature.set(line, "sudokux-"); count("sudokuX"); }
  }

  // Windoku recognition (visual remains generic underlay).
  const centers = [[2.5,2.5],[2.5,6.5],[6.5,2.5],[6.5,6.5]];
  const windows = scene.underlays.filter((part) => featureCheck(part, { backgroundColor: "#CFCFCF", width: 3, height: 3 }));
  if (windows.length === 4 && centers.every((center) => windows.some((part) => sameRC(part.center as number[], center)))) {
    windows.forEach((part) => plan.graphicFeature.set(part, "windoku"));
    plan.detected.windoku = 4;
  }

  return plan;
}
