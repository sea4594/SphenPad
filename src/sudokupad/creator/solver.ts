import type { CellRC, PuzzleDefinition } from "../../core/model";
import { creatorDigitCount, creatorDigitRange } from "./gridStructure";
import { validateCreatorDefinition } from "./checker";
import { creatorSolverUnsupportedReason } from "./solverSupport";
import { creatorConstraints } from "./nativeAuthoring";
import { getCellsSeenByCells, getComponents, validateConstraints, validateGrid, type CreatorWorkerValue } from "./worker";

export type CreatorSolutionSearchMode = "first" | "unique" | "count";
export type CreatorSolverSettings = { maxSolutions?: number; maxNodes?: number; logicalStepLimit?: number; searchMode?: CreatorSolutionSearchMode };
export type CreatorSearchProgress = { nodes: number; solutionsFound: number };
export type CreatorSolutionDifference = { rc: CellRC; first: CreatorWorkerValue["value"]; second: CreatorWorkerValue["value"] };
export type CreatorLogicalTechnique = "naked single" | "hidden single" | "naked pair" | "naked triple" | "hidden pair" | "hidden triple" | "locked candidate" | "x-wing" | "cage sum" | "arrow sum" | "thermometer bound" | "whisper support" | "renban interval";
export type CreatorLogicalElimination = { rc: CellRC; value: number };
export type CreatorLogicalStep = {
  rc: CellRC; value: number; reason: CreatorLogicalTechnique; house?: string;
  kind?: "place" | "eliminate"; eliminations?: CreatorLogicalElimination[];
  focusCells?: CellRC[]; explanation?: string;
};
export type CreatorLogicalFrame = { values: CreatorWorkerValue[]; candidates: Array<{ rc: CellRC; values: number[] }> };
export type CreatorLogicalDifficulty = { level: "basic" | "intermediate" | "advanced" | "unrated"; hardestTechnique?: CreatorLogicalTechnique; techniques: Partial<Record<CreatorLogicalTechnique, number>>; note: string };
export type CreatorLogicalResult = {
  status: "solved" | "stuck" | "invalid" | "unsupported";
  values: CreatorWorkerValue[]; steps: CreatorLogicalStep[]; message?: string;
  frames?: CreatorLogicalFrame[]; difficulty?: CreatorLogicalDifficulty;
};
export type CreatorSolutionSearchResult = {
  status: "solved" | "multiple" | "none" | "found" | "invalid" | "unsupported" | "limit";
  mode: CreatorSolutionSearchMode;
  solutions: CreatorWorkerValue[][]; // At most two examples; never the full count.
  solutionsFound: number;
  exact: boolean; // True only after every branch was explored.
  nodes: number;
  stopReason?: "nodes" | "solutions";
  message?: string;
};

/** Comparison is read-only: do not alter the authored givens or solution. */
export function compareCreatorSolutions(first: CreatorWorkerValue[], second: CreatorWorkerValue[]): CreatorSolutionDifference[] {
  const other = new Map(second.map((entry) => [key(entry.rc), entry.value]));
  return first.flatMap(({ rc, value }) => {
    const alternate = other.get(key(rc));
    return alternate === undefined || alternate === value ? [] : [{ rc, first: value, second: alternate }];
  });
}

const key = (cell: CellRC) => `${cell.r}:${cell.c}`;
const fromKey = (value: string): CellRC => { const [r, c] = value.split(":").map(Number); return { r, c }; };
const cells = (def: PuzzleDefinition) => Array.from({ length: def.rows }, (_, r) => Array.from({ length: def.cols }, (_, c) => ({ r, c }))).flat();
const initialValues = (def: PuzzleDefinition) => new Map(def.givens.map((given) => [key(given.rc), Number(given.v)]).filter(([, value]) => Number.isInteger(value as number)) as Array<[string, number]>);
const entries = (values: Map<string, number>): CreatorWorkerValue[] => [...values].map(([cellKey, value]) => ({ rc: fromKey(cellKey), value })).sort((a, b) => a.rc.r - b.rc.r || a.rc.c - b.rc.c);

function configurationError(def: PuzzleDefinition) {
  const logic = { ...(def.logic ?? {}) } as Record<string, unknown>; delete logic.solution; delete logic.creatorSolutionEntries;
  const scene = def.scene ? { ...def.scene, metadata: { ...def.scene.metadata } } : undefined; if (scene?.metadata) delete scene.metadata.solution;
  const definitionErrors = validateCreatorDefinition({ ...def, ...(scene ? { scene } : {}), logic });
  const enabledIds = new Set(creatorConstraints(def).filter((item) => item.enabled !== false && item.ignoreInSolver !== true && def.meta.creatorConstraintChecks?.[String(item.sourceElementId ?? item.type)] !== false).map((item) => String(item.id ?? item.sourceElementId ?? item.type)));
  const constraintErrors = [...validateConstraints(def).entries()].filter(([id, message]) => enabledIds.has(id) && message.trim()).map(([id, message]) => `${id}: ${message}`);
  const errors = [...new Set([...definitionErrors, ...constraintErrors])];
  return errors.length ? errors.join(" ") : undefined;
}

function solverContext(def: PuzzleDefinition) {
  const range = creatorDigitRange(def), digits = Array.from({ length: range.max - range.min + 1 }, (_, index) => range.min + index), all = cells(def);
  const seen = new Map(all.map((cell) => [key(cell), new Set(getCellsSeenByCells(def, [cell]).map(key))]));
  const houses = getComponents(def).filter((component) => component.exclusion && component.cells.length === digits.length);
  return { digits, all, seen, houses };
}
function candidateMap(def: PuzzleDefinition, values: Map<string, number>, context: ReturnType<typeof solverContext>) {
  const result = new Map<string, number[]>();
  for (const cell of context.all) {
    const k = key(cell); if (values.has(k)) continue;
    const used = new Set<number>(); for (const other of context.seen.get(k) ?? []) { const value = values.get(other); if (value !== undefined) used.add(value); }
    const candidates: number[] = [];
    for (const value of context.digits) {
      if (used.has(value)) continue;
      values.set(k, value);
      const report = validateGrid(def, entries(values));
      values.delete(k);
      if (!report.diagnostics.length && !report.thrownErrors.length) candidates.push(value);
    }
    result.set(k, candidates);
  }
  return result;
}

/** Creator-only proof-preserving logical analysis. Never writes to puzzle data. */
export function solveCreatorLogically(def: PuzzleDefinition, settings: CreatorSolverSettings = {}): CreatorLogicalResult {
  const initial = entries(initialValues(def));
  const failed = (status: "invalid" | "unsupported", message: string): CreatorLogicalResult => ({ status, values: initial, steps: [], message });
  const unsupported = creatorSolverUnsupportedReason(def); if (unsupported) return failed("unsupported", unsupported);
  const config = configurationError(def); if (config) return failed("invalid", config);
  const values = initialValues(def), initialReport = validateGrid(def, entries(values));
  if (initialReport.thrownErrors.length) return failed("unsupported", initialReport.thrownErrors[0]);
  if (initialReport.diagnostics.length) return failed("invalid", initialReport.diagnostics[0].message);
  const context = solverContext(def), steps: CreatorLogicalStep[] = [], frames: CreatorLogicalFrame[] = [];
  const logicalConstraints = creatorConstraints(def).filter((constraint) => constraint.enabled !== false && constraint.ignoreInSolver !== true && def.meta.creatorConstraintChecks?.[String(constraint.sourceElementId ?? constraint.type)] !== false);
  const removed = new Map<string, Set<number>>();
  const requested = typeof settings.logicalStepLimit === "number" && Number.isFinite(settings.logicalStepLimit) ? Math.trunc(settings.logicalStepLimit) : def.rows * def.cols * 4;
  // Bounded snapshots prevent multi-thousand-step puzzles from exhausting worker memory.
  const limit = Math.max(1, Math.min(500, Math.floor(120_000 / Math.max(1, def.rows * def.cols)), requested));
  const fullHouses = context.houses.map((house) => ({ name: house.name, keys: [...new Set(house.cells.map(key))] }))
    .filter((house) => house.keys.length === context.digits.length);
  const currentCandidates = () => {
    const candidates = candidateMap(def, values, context);
    for (const [cell, list] of candidates) {
      const blocked = removed.get(cell);
      if (blocked?.size) candidates.set(cell, list.filter((digit) => !blocked.has(digit)));
    }
    return candidates;
  };
  const snapshot = (candidates: Map<string, number[]>) => {
    frames.push({ values: entries(values), candidates: [...candidates].map(([cell, values]) => ({ rc: fromKey(cell), values: [...values] })) });
  };
  const summary = (status: CreatorLogicalResult["status"], message?: string): CreatorLogicalResult => {
    const levels: Record<CreatorLogicalTechnique, number> = { "naked single": 1, "hidden single": 1, "naked pair": 2, "naked triple": 2, "hidden pair": 2, "hidden triple": 2, "locked candidate": 2, "x-wing": 3, "cage sum": 1, "arrow sum": 2, "thermometer bound": 2, "whisper support": 2, "renban interval": 2 };
    const techniques: CreatorLogicalDifficulty["techniques"] = {};
    for (const step of steps) techniques[step.reason] = (techniques[step.reason] ?? 0) + 1;
    const hardest = [...steps].sort((a, b) => levels[b.reason] - levels[a.reason])[0]?.reason;
    const level = status !== "solved" ? "unrated" : !hardest || levels[hardest] === 1 ? "basic" : levels[hardest] === 2 ? "intermediate" : "advanced";
    return { status, values: entries(values), steps, frames, ...(message ? { message } : {}), difficulty: {
      level, hardestTechnique: hardest, techniques,
      note: status === "solved"
        ? "Technique-based estimate only; not a proof of uniqueness or a standardized difficulty rating."
        : "No difficulty rating: the supported logical techniques did not complete the puzzle.",
    } };
  };
  const describe = (cell: string) => { const { r, c } = fromKey(cell); return `R${r + 1}C${c + 1}`; };
  let candidates = currentCandidates();
  snapshot(candidates);
  while (values.size < def.rows * def.cols && steps.length < limit) {
    const empty = [...candidates].find(([, list]) => list.length === 0);
    if (empty) return summary("invalid", `No candidates remain for ${describe(empty[0])}; deductions have reached a contradiction.`);
    // Use a named variant rule when it directly justifies the last remaining
    // value. This is a real arithmetic deduction, not backtracking or a guess.
    let sumPlacement: CreatorLogicalStep | undefined;
    for (const constraint of logicalConstraints) {
      const path = (constraint.path ?? constraint.cells ?? []) as CellRC[];
      const remaining = path.filter((cell) => !values.has(key(cell)));
      if (remaining.length !== 1 || path.length < 2) continue;
      const target = key(remaining[0]);
      let needed: number | undefined;
      let reason: CreatorLogicalTechnique = "cage sum";
      if (constraint.type === "killer-cage") {
        const total = Number(constraint.value);
        if (Number.isSafeInteger(total) && total > 0)
          needed = total - path.filter((cell) => key(cell) !== target).reduce((sum, cell) => sum + (values.get(key(cell)) ?? 0), 0);
      } else if (constraint.type === "arrow" || constraint.type === "double-arrow") {
        reason = "arrow sum";
        const bulbs = constraint.type === "arrow" ? Math.max(1, Math.min(path.length - 1, Math.trunc(Number(constraint.bulbCellCount ?? 1)))) : 0;
        const positive = constraint.type === "arrow" ? path.slice(0, bulbs) : [path[0], path[path.length - 1]];
        const negative = constraint.type === "arrow" ? path.slice(bulbs) : path.slice(1, -1);
        const side = positive.some((cell) => key(cell) === target) ? 1 : negative.some((cell) => key(cell) === target) ? -1 : 0;
        if (side) {
          const knownPositive = positive.filter((cell) => key(cell) !== target).reduce((sum, cell) => sum + (values.get(key(cell)) ?? 0), 0);
          const knownNegative = negative.filter((cell) => key(cell) !== target).reduce((sum, cell) => sum + (values.get(key(cell)) ?? 0), 0);
          needed = side === 1 ? knownNegative - knownPositive : knownPositive - knownNegative;
        }
      }
      if (needed !== undefined && candidates.get(target)?.includes(needed)) {
        sumPlacement = { kind: "place", rc: remaining[0], value: needed, reason, focusCells: path,
          explanation: `${reason === "cage sum" ? "The killer cage total requires" : "The arrow sums require"} ${describe(target)} = ${needed} after subtracting the other filled cells.` };
        break;
      }
    }
    if (sumPlacement) {
      values.set(key(sumPlacement.rc), sumPlacement.value); steps.push(sumPlacement);
      candidates = currentCandidates(); snapshot(candidates); continue;
    }
    const naked = [...candidates].find(([, list]) => list.length === 1);
    if (naked) {
      const [cell, list] = naked, value = list[0]; values.set(cell, value);
      steps.push({ kind: "place", rc: fromKey(cell), value, reason: "naked single", focusCells: [fromKey(cell)], explanation: `${describe(cell)} has only one candidate remaining: ${value}.` });
      candidates = currentCandidates(); snapshot(candidates); continue;
    }
    let placement: CreatorLogicalStep | undefined;
    for (const house of fullHouses) {
      for (const digit of context.digits) {
        if (house.keys.some((cell) => values.get(cell) === digit)) continue;
        const places = house.keys.filter((cell) => candidates.get(cell)?.includes(digit));
        if (places.length === 1) { const cell = places[0]; placement = { kind: "place", rc: fromKey(cell), value: digit, reason: "hidden single", house: house.name,
          focusCells: house.keys.map(fromKey), explanation: `In ${house.name}, only ${describe(cell)} can contain ${digit}.` }; break; }
      }
      if (placement) break;
    }
    if (placement) {
      values.set(key(placement.rc), placement.value); steps.push(placement);
      candidates = currentCandidates(); snapshot(candidates); continue;
    }
    type Deduction = { reason: CreatorLogicalTechnique; house: string; sources: string[]; eliminations: Array<{ cell: string; digit: number }>; explanation: string };
    let deduction: Deduction | undefined;
    const choose = (reason: CreatorLogicalTechnique, house: string, sources: string[], proposed: Array<{ cell: string; digit: number }>, explanation: string) => {
      const seen = new Set<string>();
      const eliminations = proposed.filter(({ cell, digit }) => {
        const id = `${cell}:${digit}`;
        if (seen.has(id) || !candidates.get(cell)?.includes(digit)) return false;
        seen.add(id); return true;
      });
      if (eliminations.length) { deduction = { reason, house, sources, eliminations, explanation }; return true; }
      return false;
    };
    // Variant candidate deductions use only necessary consequences of each
    // enabled constraint. They never assume a complete grid or uniqueness.
    for (const constraint of logicalConstraints) {
      const path = (constraint.path ?? constraint.cells ?? []) as CellRC[];
      if (constraint.type === "thermometer" && constraint.slow !== true && path.length >= 2) {
        const range = creatorDigitRange(def);
        const proposed = path.flatMap((cell, index) => (candidates.get(key(cell)) ?? []).filter((digit) =>
          digit < range.min + index || digit > range.max - (path.length - index - 1)).map((digit) => ({ cell: key(cell), digit })));
        if (choose("thermometer bound", "thermometer", path.map(key), proposed,
          `A strictly increasing thermometer of ${path.length} cells must leave room for every digit before and after each position.`)) break;
      }
      if (constraint.type === "whisper" && path.length >= 2) {
        const count = creatorDigitCount(def);
        const minimum = Math.max(1, Number(constraint.minDifference ?? (String(constraint.sourceElementId) === "dutch-whispers" ? Math.floor((count - 1) / 2) : Math.floor((count + 1) / 2))));
        for (let i = 1; i < path.length; i += 1) {
          const pair = [path[i - 1], path[i]];
          const proposed = pair.flatMap((cell, index) => (candidates.get(key(cell)) ?? []).filter((digit) => {
            const neighbor = pair[1 - index], assigned = values.get(key(neighbor));
            const support = assigned !== undefined ? [assigned] : candidates.get(key(neighbor)) ?? [];
            return !support.some((other) => Math.abs(digit - other) >= minimum);
          }).map((digit) => ({ cell: key(cell), digit })));
          if (choose("whisper support", "whisper", pair.map(key), proposed,
            `Each adjacent whisper pair must differ by at least ${minimum}; eliminated digits have no supporting neighbor candidate.`)) break;
        }
        if (deduction) break;
      }
      if (constraint.type === "renban" && path.length >= 2) {
        const range = creatorDigitRange(def), occupied = path.map((cell) => values.get(key(cell))).filter((value): value is number => value !== undefined);
        const windows: number[][] = [];
        for (let start = range.min; start <= range.max - path.length + 1; start += 1) {
          const interval = Array.from({ length: path.length }, (_, i) => start + i);
          if (occupied.every((digit) => interval.includes(digit))) windows.push(interval);
        }
        const possible = new Set(windows.flat());
        const proposed = path.flatMap((cell) => (candidates.get(key(cell)) ?? []).filter((digit) => !possible.has(digit)).map((digit) => ({ cell: key(cell), digit })));
        if (choose("renban interval", "renban", path.map(key), proposed,
          `A renban line must use one consecutive interval of ${path.length} distinct digits, consistent with its placed digits.`)) break;
      }
    }
    // All-different houses of exactly N cells over N digits are complete houses.
    // Naked/hidden subset and intersection deductions are sound only in those houses.
    for (const house of fullHouses) {
      const open = house.keys.filter((cell) => candidates.has(cell));
      for (const size of [2, 3]) {
        // Naked subset: N cells have exactly N candidate digits between them.
        const combinations = (items: string[], n: number, from = 0, picked: string[] = []): string[][] =>
          n === 0 ? [[...picked]] : items.flatMap((item, i) => i < from || items.length - i < n ? [] : combinations(items, n - 1, i + 1, [...picked, item]));
        const eligible = open.filter((cell) => (candidates.get(cell)?.length ?? 0) <= size);
        for (const members of combinations(eligible, size)) {
          const digits = [...new Set(members.flatMap((cell) => candidates.get(cell) ?? []))];
          if (digits.length !== size) continue;
          const elsewhere = open.filter((cell) => !members.includes(cell));
          const proposed = elsewhere.flatMap((cell) => digits.map((digit) => ({ cell, digit })));
          if (choose(size === 2 ? "naked pair" : "naked triple", house.name, members, proposed,
            `${members.map(describe).join(", ")} contain only {${digits.join(", ")}} in ${house.name}; remove these digits from other cells in that house.`)) break;
        }
        if (deduction) break;
        // Hidden subset: N missing digits occur only in the same N cells.
        const missing = context.digits.filter((digit) => !house.keys.some((cell) => values.get(cell) === digit)).map(String);
        for (const picks of combinations(missing, size)) {
          const digits = picks.map(Number);
          if (digits.some((digit) => !open.some((cell) => candidates.get(cell)?.includes(digit)))) continue;
          const members = open.filter((cell) => digits.some((digit) => candidates.get(cell)?.includes(digit)));
          if (members.length !== size) continue;
          const proposed = members.flatMap((cell) => (candidates.get(cell) ?? []).filter((digit) => !digits.includes(digit)).map((digit) => ({ cell, digit })));
          if (choose(size === 2 ? "hidden pair" : "hidden triple", house.name, members, proposed,
            `Only ${members.map(describe).join(", ")} can contain {${digits.join(", ")}} in ${house.name}; remove their other candidates.`)) break;
        }
        if (deduction) break;
      }
      if (deduction) break;
    }
    // Intersection (pointing/claiming): all positions for a digit in a full
    // house lie inside a second full house, excluding it elsewhere in the second.
    if (!deduction) for (const first of fullHouses) {
      for (const digit of context.digits) {
        if (first.keys.some((cell) => values.get(cell) === digit)) continue;
        const places = first.keys.filter((cell) => candidates.get(cell)?.includes(digit));
        if (!places.length) continue;
        for (const second of fullHouses) {
          if (second === first || !places.every((cell) => second.keys.includes(cell))) continue;
          const proposed = second.keys.filter((cell) => !first.keys.includes(cell)).map((cell) => ({ cell, digit }));
          if (choose("locked candidate", `${first.name} / ${second.name}`, places, proposed,
            `Every possible ${digit} in ${first.name} is also in ${second.name}; remove ${digit} from ${second.name} outside their intersection.`)) break;
        }
        if (deduction) break;
      }
      if (deduction) break;
    }
    // X-Wing is enabled only with complete standard rows and columns; no
    // rectangular or disabled-Sudoku-rule interpretation is assumed.
    if (!deduction && def.rows === def.cols && def.rows === context.digits.length) {
      for (const orientation of ["row", "column"] as const) {
        const primary = fullHouses.filter((h) => new RegExp(`^${orientation} \\d+$`).test(h.name));
        const secondary = fullHouses.filter((h) => new RegExp(`^${orientation === "row" ? "column" : "row"} \\d+$`).test(h.name));
        if (primary.length !== def.rows || secondary.length !== def.cols) continue;
        for (const digit of context.digits) {
          const pairs = primary.map((house) => ({ house, places: house.keys.filter((cell) => candidates.get(cell)?.includes(digit)) })).filter((item) => item.places.length === 2);
          for (let a = 0; a < pairs.length; a++) for (let b = a + 1; b < pairs.length; b++) {
            const positions = (list: string[]) => list.map((cell) => orientation === "row" ? fromKey(cell).c : fromKey(cell).r).sort((x, y) => x - y).join(",");
            if (positions(pairs[a].places) !== positions(pairs[b].places)) continue;
            const source = [...pairs[a].places, ...pairs[b].places];
            const proposed = secondary.flatMap((house) => house.keys.filter((cell) => source.includes(cell) === false && house.keys.some((spot) => source.includes(spot))).map((cell) => ({ cell, digit })));
            if (choose("x-wing", `${pairs[a].house.name} / ${pairs[b].house.name}`, source, proposed,
              `The four corners in ${pairs[a].house.name} and ${pairs[b].house.name} form an X-Wing for ${digit}; eliminate ${digit} from the intersecting ${orientation === "row" ? "columns" : "rows"} elsewhere.`)) break;
          }
          if (deduction) break;
        }
        if (deduction) break;
      }
    }
    if (!deduction) break;
    for (const { cell, digit } of deduction.eliminations) {
      if (!removed.has(cell)) removed.set(cell, new Set());
      removed.get(cell)!.add(digit);
    }
    const first = deduction.eliminations[0];
    steps.push({ kind: "eliminate", rc: fromKey(first.cell), value: first.digit, reason: deduction.reason, house: deduction.house,
      focusCells: deduction.sources.map(fromKey), eliminations: deduction.eliminations.map(({ cell, digit }) => ({ rc: fromKey(cell), value: digit })), explanation: deduction.explanation });
    candidates = currentCandidates(); snapshot(candidates);
  }
  if (values.size === def.rows * def.cols) {
    const report = validateGrid(def, entries(values));
    if (report.thrownErrors.length) return summary("unsupported", report.thrownErrors[0]);
    if (report.diagnostics.length) return summary("invalid", report.diagnostics[0].message);
    return summary("solved");
  }
  return summary("stuck", steps.length >= limit
    ? `Logical step limit reached (${limit}); no uniqueness or full logical completion claim.`
    : "No further deductions found using supported standard or variant techniques. This does not mean the puzzle is unsolvable.");
}

/** Backtracking search for creator-only proof/count tools. Never mutates the puzzle. */
export function findCreatorSolutions(
  def: PuzzleDefinition,
  settings: CreatorSolverSettings = {},
  options: { onProgress?: (progress: CreatorSearchProgress) => void } = {},
): CreatorSolutionSearchResult {
  const mode = settings.searchMode ?? "unique";
  const failed = (status: "invalid" | "unsupported", message: string): CreatorSolutionSearchResult =>
    ({ status, mode, solutions: [], solutionsFound: 0, exact: false, nodes: 0, message });
  const unsupported = creatorSolverUnsupportedReason(def); if (unsupported) return failed("unsupported", unsupported);
  const config = configurationError(def); if (config) return failed("invalid", config);
  const values = initialValues(def), initial = validateGrid(def, entries(values));
  if (initial.thrownErrors.length) return failed("unsupported", initial.thrownErrors[0]);
  if (initial.diagnostics.length) return failed("invalid", initial.diagnostics[0].message);

  const context = solverContext(def);
  // 'first' may stop after one answer, 'unique' after two; only 'count'
  // uses the user's solution-count ceiling. Keep only two solutions in memory.
  const configuredCap = typeof settings.maxSolutions === "number" && Number.isFinite(settings.maxSolutions) ? Math.trunc(settings.maxSolutions) : mode === "count" ? 10_000 : 2;
  const cap = mode === "first" ? 1 : mode === "unique" ? Math.min(2, Math.max(1, configuredCap)) : Math.min(100_000, Math.max(1, configuredCap));
  const maxNodes = Math.min(5_000_000, Math.max(1, typeof settings.maxNodes === "number" && Number.isFinite(settings.maxNodes) ? Math.trunc(settings.maxNodes) : 250_000));
  const solutions: CreatorWorkerValue[][] = [];
  let nodes = 0, solutionsFound = 0, progressAt = 0;
  const reportProgress = () => {
    if (nodes - progressAt >= 2_000) { progressAt = nodes; options.onProgress?.({ nodes, solutionsFound }); }
  };

  // "complete" means the entire subtree was visited, not that its solutions
  // fit in the example buffer. A cap reached on the final branch can be exact.
  const search = (): "complete" | "nodes" | "solutions" => {
    if (nodes >= maxNodes) return "nodes";
    nodes += 1;
    reportProgress();
    if (values.size === def.rows * def.cols) {
      const report = validateGrid(def, entries(values));
      if (!report.diagnostics.length && !report.thrownErrors.length) {
        solutionsFound += 1;
        if (solutions.length < 2) solutions.push(entries(values));
      }
      return "complete";
    }
    const candidates = candidateMap(def, values, context);
    let bestKey: string | undefined, best: number[] | undefined;
    for (const [cellKey, list] of candidates) {
      if (!list.length) return "complete";
      if (!best || list.length < best.length) { bestKey = cellKey; best = list; if (list.length === 1) break; }
    }
    if (!bestKey || !best) return "complete";
    for (let index = 0; index < best.length; index += 1) {
      values.set(bestKey, best[index]);
      const state = search();
      values.delete(bestKey);
      if (state !== "complete") return state;
      if (solutionsFound >= cap && index < best.length - 1) return "solutions";
    }
    return "complete";
  };

  const stopped = search();
  const exact = stopped === "complete";
  const stopReason = exact ? undefined : stopped;
  const suffix = `${nodes.toLocaleString()} nodes searched.`;
  if (exact) {
    if (solutionsFound === 0) return { status: "none", mode, solutions, solutionsFound, exact, nodes, message: `No solution satisfies the enabled, supported constraints. ${suffix}` };
    if (solutionsFound === 1) return { status: "solved", mode, solutions, solutionsFound, exact, nodes, message: `Exactly one solution; uniqueness proven. ${suffix}` };
    return { status: "multiple", mode, solutions, solutionsFound, exact, nodes, message: `Exactly ${solutionsFound.toLocaleString()} solutions; all branches explored. ${suffix}` };
  }
  const reached = stopped === "nodes" ? `${maxNodes.toLocaleString()}-node limit` : `${cap.toLocaleString()}-solution limit`;
  const message = solutionsFound
    ? `At least ${solutionsFound.toLocaleString()} solution${solutionsFound === 1 ? "" : "s"} found; exact total is unknown${solutionsFound === 1 ? " and uniqueness is not proven" : " (multiple solutions proven)"} (${reached}). ${suffix}`
    : `No solution found yet; unsolvability is not proven (${reached}). ${suffix}`;
  return {
    status: mode === "first" && solutionsFound > 0 ? "found" : solutionsFound >= 2 ? "multiple" : "limit",
    mode, solutions, solutionsFound, exact, nodes, stopReason, message,
  };
}
