import type { CellRC, PuzzleDefinition } from "../../core/model";
import { creatorDigitRange } from "./gridStructure";
import { validateCreatorDefinition } from "./checker";
import { creatorSolverUnsupportedReason } from "./solverSupport";
import { creatorConstraints } from "./nativeAuthoring";
import { getCellsSeenByCells, getComponents, validateConstraints, validateGrid, type CreatorWorkerValue } from "./worker";

export type CreatorSolutionSearchMode = "first" | "unique" | "count";
export type CreatorSolverSettings = { maxSolutions?: number; maxNodes?: number; logicalStepLimit?: number; searchMode?: CreatorSolutionSearchMode };
export type CreatorSearchProgress = { nodes: number; solutionsFound: number };
export type CreatorSolutionDifference = { rc: CellRC; first: CreatorWorkerValue["value"]; second: CreatorWorkerValue["value"] };
export type CreatorLogicalStep = { rc: CellRC; value: number; reason: "naked single" | "hidden single"; house?: string };
export type CreatorLogicalResult = { status: "solved" | "stuck" | "invalid" | "unsupported"; values: CreatorWorkerValue[]; steps: CreatorLogicalStep[]; message?: string };
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

/** Deterministic SudokuMaker-style logical pass using naked and hidden singles. */
export function solveCreatorLogically(def: PuzzleDefinition, settings: CreatorSolverSettings = {}): CreatorLogicalResult {
  const unsupported = creatorSolverUnsupportedReason(def); if (unsupported) return { status: "unsupported", values: entries(initialValues(def)), steps: [], message: unsupported };
  const config = configurationError(def); if (config) return { status: "invalid", values: entries(initialValues(def)), steps: [], message: config };
  const values = initialValues(def), initial = validateGrid(def, entries(values));
  if (initial.thrownErrors.length) return { status: "unsupported", values: entries(values), steps: [], message: initial.thrownErrors[0] };
  if (initial.diagnostics.length) return { status: "invalid", values: entries(values), steps: [], message: initial.diagnostics[0].message };
  const context = solverContext(def), steps: CreatorLogicalStep[] = [], limit = Math.max(1, settings.logicalStepLimit ?? def.rows * def.cols * 2);
  while (values.size < def.rows * def.cols && steps.length < limit) {
    const candidates = candidateMap(def, values, context);
    const empty = [...candidates].find(([, list]) => list.length === 0);
    if (empty) return { status: "invalid", values: entries(values), steps, message: `No candidates remain for r${fromKey(empty[0]).r + 1}c${fromKey(empty[0]).c + 1}.` };
    const naked = [...candidates].find(([, list]) => list.length === 1);
    if (naked) { const rc = fromKey(naked[0]), value = naked[1][0]; values.set(naked[0], value); steps.push({ rc, value, reason: "naked single" }); continue; }
    let hidden: CreatorLogicalStep | undefined;
    for (const house of context.houses) {
      for (const digit of context.digits) {
        if (house.cells.some((cell) => values.get(key(cell)) === digit)) continue;
        const places = house.cells.filter((cell) => !values.has(key(cell)) && (candidates.get(key(cell)) ?? []).includes(digit));
        if (places.length === 1) { hidden = { rc: places[0], value: digit, reason: "hidden single", house: house.name }; break; }
      }
      if (hidden) break;
    }
    if (!hidden) break;
    values.set(key(hidden.rc), hidden.value); steps.push(hidden);
  }
  if (values.size === def.rows * def.cols) {
    const report = validateGrid(def, entries(values));
    if (report.thrownErrors.length) return { status: "unsupported", values: entries(values), steps, message: report.thrownErrors[0] };
    if (report.diagnostics.length) return { status: "invalid", values: entries(values), steps, message: report.diagnostics[0].message };
  }
  return { status: values.size === def.rows * def.cols ? "solved" : "stuck", values: entries(values), steps, ...(values.size === def.rows * def.cols ? {} : { message: "No further naked or hidden singles were found." }) };
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
