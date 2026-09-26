import type { CellRC, PuzzleDefinition } from "../../core/model";
import type { PuzzleLogicConstraint } from "../types/logic";
import { creatorDigitCount, creatorDigitRange } from "./gridStructure";
import { creatorConstraints, getCreatorRegions } from "./nativeAuthoring";
import { normalizeCreatorLineConstraints } from "./lineConstraints";
import { normalizeCreatorGroupConstraints, validateGroupConstraintShape } from "./groupConstraints";
import { creatorSudokuRulesEnabled, normalizeCreatorGlobalConstraints, validateGlobalConstraintShape } from "./globalConstraints";

export type CreatorWorkerValue = { rc: CellRC; value: string | number };
export type CreatorDiagnostic = { code: string; message: string; cells: CellRC[]; constraintId?: string; sourceElementId?: string };
export type CreatorWorkerComponent = { type: string; name: string; cells: CellRC[]; constraintId?: string; sourceElementId?: string; exclusion: boolean };
export type CreatorGridValidation = { invalidCells: CellRC[]; diagnostics: CreatorDiagnostic[]; thrownErrors: string[] };

const clone = <T,>(value: T): T => value == null ? value : JSON.parse(JSON.stringify(value)) as T;
const key = (cell: CellRC) => `${cell.r}:${cell.c}`;
const fromKey = (value: string): CellRC => { const [r, c] = value.split(":").map(Number); return { r, c }; };
const uniq = (cells: CellRC[]) => { const seen = new Set<string>(); return cells.filter((cell) => { const k = key(cell); if (seen.has(k)) return false; seen.add(k); return true; }); };
const inBounds = (def: PuzzleDefinition, cell: CellRC) => cell.r >= 0 && cell.c >= 0 && cell.r < def.rows && cell.c < def.cols;
const normalized = (def: PuzzleDefinition) => normalizeCreatorGlobalConstraints(normalizeCreatorGroupConstraints(normalizeCreatorLineConstraints(def)));
const checked = (def: PuzzleDefinition, id: string) => def.meta.creatorConstraintChecks?.[id] !== false;
const cellsOf = (constraint: PuzzleLogicConstraint): CellRC[] => uniq(((constraint.path ?? constraint.cells ?? []) as CellRC[]).filter(Boolean));
const edgeKey = (a: CellRC, b: CellRC) => [key(a), key(b)].sort().join("|");
const sourceId = (constraint: PuzzleLogicConstraint) => String(constraint.sourceElementId ?? constraint.type);

function valueMap(def: PuzzleDefinition, input?: CreatorWorkerValue[]) {
  const source = input ?? def.givens.map((given) => ({ rc: given.rc, value: given.v }));
  const values = new Map<string, number>();
  for (const entry of source) { const value = Number(entry.value); if (Number.isFinite(value)) values.set(key(entry.rc), value); }
  return values;
}
function activeConstraints(def: PuzzleDefinition) { return creatorConstraints(def).filter((constraint) => constraint.enabled !== false && constraint.ignoreInSolver !== true); }
function allCells(def: PuzzleDefinition) { return Array.from({ length: def.rows }, (_, r) => Array.from({ length: def.cols }, (_, c) => ({ r, c }))).flat(); }
function orthogonal(def: PuzzleDefinition, cell: CellRC) { return [{ r: cell.r - 1, c: cell.c }, { r: cell.r + 1, c: cell.c }, { r: cell.r, c: cell.c - 1 }, { r: cell.r, c: cell.c + 1 }].filter((other) => inBounds(def, other)); }

function addAllDifferentComponents(def: PuzzleDefinition, out: CreatorWorkerComponent[]) {
  if (creatorSudokuRulesEnabled(def)) {
    for (let r = 0; r < def.rows; r += 1) out.push({ type: "House", name: `row ${r + 1}`, cells: Array.from({ length: def.cols }, (_, c) => ({ r, c })), exclusion: true });
    for (let c = 0; c < def.cols; c += 1) out.push({ type: "House", name: `column ${c + 1}`, cells: Array.from({ length: def.rows }, (_, r) => ({ r, c })), exclusion: true });
  }
  getCreatorRegions(def).forEach((region, index) => out.push({ type: "House", name: `region ${region.label ?? index + 1}`, cells: uniq(region.cells), exclusion: true }));
}

/** SudokuMaker worker equivalent: constraint/house components registered for this project. */
export function getComponents(input: PuzzleDefinition): CreatorWorkerComponent[] {
  const def = normalized(input), out: CreatorWorkerComponent[] = [];
  addAllDifferentComponents(def, out);
  const regions = getCreatorRegions(def);
  if (def.logic?.antiKing) out.push({ type: "AntiKing", name: "anti-king", cells: allCells(def), exclusion: false });
  if (def.logic?.antiKnight) out.push({ type: "AntiKnight", name: "anti-knight", cells: allCells(def), exclusion: false });
  for (const constraint of activeConstraints(def)) {
    const id = sourceId(constraint), cells = cellsOf(constraint);
    if (constraint.type === "disjoint-groups" && regions.length > 1 && regions.every((region) => region.cells.length === regions[0].cells.length)) {
      for (let index = 0; index < regions[0].cells.length; index += 1) out.push({ type: "DisjointGroup", name: `disjoint group ${index + 1}`, cells: regions.map((region) => region.cells[index]).filter(Boolean), constraintId: constraint.id, sourceElementId: id, exclusion: true });
      continue;
    }
    const exclusion = constraint.type === "diagonal" || constraint.type === "killer-cage" || constraint.type === "different-values" || constraint.type === "renban" || (constraint.type === "thermometer" && constraint.slow !== true);
    out.push({ type: constraint.type, name: String(constraint.name ?? id), cells, constraintId: constraint.id, sourceElementId: id, exclusion });
  }
  return out;
}

function addClique(graph: Map<string, Set<string>>, cells: CellRC[]) {
  const keys = uniq(cells).map(key);
  for (const a of keys) { const set = graph.get(a); if (!set) continue; for (const b of keys) if (a !== b) set.add(b); }
}
function addPair(graph: Map<string, Set<string>>, a: CellRC, b: CellRC) { if (!graph.has(key(a)) || !graph.has(key(b))) return; graph.get(key(a))!.add(key(b)); graph.get(key(b))!.add(key(a)); }
function addEquivalence(eq: Map<string, Set<string>>, cells: CellRC[]) {
  const ks = uniq(cells).map(key).filter((k) => eq.has(k)); if (ks.length < 2) return;
  const merged = new Set<string>(); for (const k of ks) for (const member of eq.get(k) ?? [k]) merged.add(member);
  for (const member of merged) eq.set(member, new Set(merged));
}

function seenGraph(def: PuzzleDefinition) {
  const graph = new Map<string, Set<string>>(), eq = new Map<string, Set<string>>();
  for (const cell of allCells(def)) { graph.set(key(cell), new Set()); eq.set(key(cell), new Set([key(cell)])); }
  for (const component of getComponents(def)) if (component.exclusion) addClique(graph, component.cells);
  if (def.logic?.antiKing && checked(def, "antiking")) for (const cell of allCells(def)) for (const dr of [-1, 1]) for (const dc of [-1, 1]) addPair(graph, cell, { r: cell.r + dr, c: cell.c + dc });
  if (def.logic?.antiKnight && checked(def, "antiknight")) for (const cell of allCells(def)) for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) addPair(graph, cell, { r: cell.r + dr, c: cell.c + dc });
  const minimum = new Set(activeConstraints(def).filter((c) => c.type === "minimum").flatMap(cellsOf).map(key));
  const maximum = new Set(activeConstraints(def).filter((c) => c.type === "maximum").flatMap(cellsOf).map(key));
  for (const constraint of activeConstraints(def)) {
    const id = sourceId(constraint); if (!checked(def, id)) continue; const cells = cellsOf(constraint);
    if (["difference", "ratio"].includes(constraint.type) && cells.length === 2) addPair(graph, cells[0], cells[1]);
    if (constraint.type === "whisper") for (let i = 1; i < cells.length; i += 1) addPair(graph, cells[i - 1], cells[i]);
    if (constraint.type === "lockout-line" && cells.length >= 2) addPair(graph, cells[0], cells[cells.length - 1]);
    if (constraint.type === "minimum" || constraint.type === "maximum") { const marked = constraint.type === "minimum" ? minimum : maximum; for (const cell of cells) for (const other of orthogonal(def, cell)) if (!marked.has(key(other))) addPair(graph, cell, other); }
    if (constraint.type === "clone") addEquivalence(eq, cells);
    if (constraint.type === "palindrome") for (let i = 0; i < Math.floor(cells.length / 2); i += 1) addEquivalence(eq, [cells[i], cells[cells.length - 1 - i]]);
  }
  return { graph, eq };
}
function seenByCell(def: PuzzleDefinition, cell: CellRC, includeCloneEquivalents: boolean) {
  const { graph, eq } = seenGraph(def), result = new Set<string>(), original = key(cell), equivalents = includeCloneEquivalents ? (eq.get(original) ?? new Set([original])) : new Set([original]);
  for (const equivalent of equivalents) for (const seen of graph.get(equivalent) ?? []) {
    const expandedCells = includeCloneEquivalents ? (eq.get(seen) ?? new Set([seen])) : new Set([seen]);
    for (const expanded of expandedCells) if (!equivalents.has(expanded)) result.add(expanded);
  }
  return result;
}

/** SudokuMaker worker equivalent: cells seen by every input cell (set intersection). */
export function getCellsSeenByCells(input: PuzzleDefinition, cells: CellRC[], includeCloneEquivalents = true): CellRC[] {
  const def = normalized(input), selected = uniq(cells).filter((cell) => inBounds(def, cell));
  if (!selected.length) return [];
  const sets = selected.map((cell) => seenByCell(def, cell, includeCloneEquivalents));
  return [...sets.slice(1).reduce((acc, set) => new Set([...acc].filter((item) => set.has(item))), sets[0])].map(fromKey).sort((a, b) => a.r - b.r || a.c - b.c);
}

function lineShapeErrors(def: PuzzleDefinition, constraint: PuzzleLogicConstraint) {
  const messages: string[] = [], cells = cellsOf(constraint), id = sourceId(constraint);
  if (["thermometer","whisper","renban","palindrome","between-line","region-sum-line","sequence-line","entropy-line","lockout-line","arrow","double-arrow"].includes(constraint.type) && cells.length < 2) messages.push(`${id} needs at least two cells.`);
  if (["between-line","lockout-line","double-arrow"].includes(constraint.type) && cells.length < 3) messages.push(`${id} needs at least three cells.`);
  if (constraint.type === "arrow" && Number(constraint.bulbCellCount ?? 1) >= cells.length) messages.push("Arrow needs at least one shaft cell after its bulb.");
  if (constraint.type === "entropy-line") { const groups = Array.isArray(constraint.groups) ? (constraint.groups as unknown[]).filter(Array.isArray).map((group) => (group as unknown[]).map(Number)) : []; const flat = groups.flat(), range = creatorDigitRange(def); if (groups.length < 2 || groups.some((group) => !group.length) || flat.some((digit) => !Number.isInteger(digit) || digit < range.min || digit > range.max) || new Set(flat).size !== flat.length) messages.push("Grouped line digit groups are invalid or overlap."); }
  if (cells.some((cell) => !inBounds(def, cell))) messages.push(`${id} contains a cell outside the board.`);
  return messages;
}

/** SudokuMaker worker equivalent: configuration validation by constraint id. */
export function validateConstraints(input: PuzzleDefinition): Map<string, string> {
  const def = normalized(input), result = new Map<string, string>();
  for (const constraint of creatorConstraints(def)) {
    const errors = [...validateGroupConstraintShape(def, constraint), ...validateGlobalConstraintShape(def, constraint), ...lineShapeErrors(def, constraint)];
    result.set(String(constraint.id ?? sourceId(constraint)), [...new Set(errors)].join(" "));
  }
  if (def.logic?.antiKing) result.set("antiking", "");
  if (def.logic?.antiKnight) result.set("antiknight", "");
  return result;
}

/** Detailed value validation used by the creator worker API and solver. */
export function validateGrid(input: PuzzleDefinition, grid?: CreatorWorkerValue[]): CreatorGridValidation {
  const def = normalized(input), values = valueMap(def, grid), diagnostics: CreatorDiagnostic[] = [], thrownErrors: string[] = [];
  const range = creatorDigitRange(def), regions = getCreatorRegions(def), constraints = activeConstraints(def), has = (cell: CellRC) => values.has(key(cell)), num = (cell: CellRC) => values.get(key(cell))!;
  const add = (code: string, message: string, cells: CellRC[], constraint?: PuzzleLogicConstraint | string) => diagnostics.push({ code, message, cells: uniq(cells).filter((cell) => inBounds(def, cell)), ...(typeof constraint === "string" ? { sourceElementId: constraint } : constraint ? { constraintId: constraint.id, sourceElementId: sourceId(constraint) } : {}) });
  const allDifferent = (cells: CellRC[], label: string, constraint?: PuzzleLogicConstraint | string) => { const seen = new Map<number, CellRC[]>(); for (const cell of cells) if (has(cell)) { const bucket = seen.get(num(cell)) ?? []; bucket.push(cell); seen.set(num(cell), bucket); } for (const bucket of seen.values()) if (bucket.length > 1) add("duplicate", `${label} contains repeated digits.`, bucket, constraint); };
  for (const [k, value] of values) { const cell = fromKey(k); if (!inBounds(def, cell)) add("out-of-bounds", "A value sits outside the board.", [cell]); else if (!Number.isInteger(value) || value < range.min || value > range.max) add("digit-range", `Value ${value} is outside ${range.min}-${range.max}.`, [cell]); }
  if (creatorSudokuRulesEnabled(def)) { for (let r = 0; r < def.rows; r += 1) allDifferent(Array.from({ length: def.cols }, (_, c) => ({ r, c })), `Row ${r + 1}`); for (let c = 0; c < def.cols; c += 1) allDifferent(Array.from({ length: def.rows }, (_, r) => ({ r, c })), `Column ${c + 1}`); }
  regions.forEach((region, index) => allDifferent(region.cells, `Region ${region.label ?? index + 1}`));
  if (def.logic?.antiKing && checked(def, "antiking")) for (const cell of allCells(def)) if (has(cell)) for (const dr of [-1, 1]) for (const dc of [-1, 1]) { const other = { r: cell.r + dr, c: cell.c + dc }; if (has(other) && key(cell) < key(other) && num(cell) === num(other)) add("anti-king", "Anti-king conflict.", [cell, other], "antiking"); }
  if (def.logic?.antiKnight && checked(def, "antiknight")) for (const cell of allCells(def)) if (has(cell)) for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) { const other = { r: cell.r + dr, c: cell.c + dc }; if (has(other) && key(cell) < key(other) && num(cell) === num(other)) add("anti-knight", "Anti-knight conflict.", [cell, other], "antiknight"); }
  for (const constraint of constraints.filter((constraint) => constraint.type === "diagonal" && checked(def, sourceId(constraint)))) allDifferent(cellsOf(constraint), sourceId(constraint) === "positive-diagonal" ? "Positive diagonal" : "Negative diagonal", constraint);
  const disjoint = constraints.find((constraint) => constraint.type === "disjoint-groups" && checked(def, sourceId(constraint)));
  if (disjoint && regions.length > 1 && regions.every((region) => region.cells.length === regions[0].cells.length)) for (let i = 0; i < regions[0].cells.length; i += 1) allDifferent(regions.map((region) => region.cells[i]).filter(Boolean), `Disjoint group ${i + 1}`, disjoint);
  const nonconsecutive = constraints.find((constraint) => constraint.type === "nonconsecutive" && checked(def, sourceId(constraint)));
  if (nonconsecutive) for (let r = 0; r < def.rows; r += 1) for (let c = 0; c < def.cols; c += 1) for (const other of [{ r: r + 1, c }, { r, c: c + 1 }]) if (inBounds(def, other) && has({ r, c }) && has(other) && Math.abs(num({ r, c }) - num(other)) === 1) add("nonconsecutive", "Orthogonally adjacent digits may not be consecutive.", [{ r, c }, other], nonconsecutive);
  const minCells = new Set(constraints.filter((c) => c.type === "minimum").flatMap(cellsOf).map(key)), maxCells = new Set(constraints.filter((c) => c.type === "maximum").flatMap(cellsOf).map(key));
  const differences = constraints.filter((c) => c.type === "difference" && checked(def, sourceId(c))), ratios = constraints.filter((c) => c.type === "ratio" && checked(def, sourceId(c))), xvs = constraints.filter((c) => c.type === "xv" && checked(def, sourceId(c)));
  const differenceEdges = new Set(differences.filter((c) => cellsOf(c).length === 2).map((c) => edgeKey(cellsOf(c)[0], cellsOf(c)[1]))), ratioEdges = new Set(ratios.filter((c) => cellsOf(c).length === 2).map((c) => edgeKey(cellsOf(c)[0], cellsOf(c)[1]))), xvEdges = new Set(xvs.filter((c) => cellsOf(c).length === 2).map((c) => edgeKey(cellsOf(c)[0], cellsOf(c)[1])));
  const negativeDifferences = new Set(differences.flatMap((c) => Array.isArray(c.negativeValues) ? (c.negativeValues as unknown[]).map(Number) : [])), negativeRatios = new Set(ratios.flatMap((c) => Array.isArray(c.negativeValues) ? (c.negativeValues as unknown[]).map(Number) : [])), negativeXv = new Set(xvs.flatMap((c) => Array.isArray(c.negativeValues) ? (c.negativeValues as unknown[]).map(Number) : []));
  for (let r = 0; r < def.rows; r += 1) for (let c = 0; c < def.cols; c += 1) for (const other of [{ r: r + 1, c }, { r, c: c + 1 }]) if (inBounds(def, other) && has({ r, c }) && has(other)) {
    const a = { r, c }, edge = edgeKey(a, other), av = num(a), bv = num(other), diff = Math.abs(av - bv), low = Math.min(av, bv), high = Math.max(av, bv), ratio = low === 0 ? Infinity : high / low, sum = av + bv;
    if (negativeDifferences.has(diff) && !differenceEdges.has(edge)) { const override = ratios.some((constraint) => constraint.overrideNegativeDifferences === true && cellsOf(constraint).length === 2 && edgeKey(cellsOf(constraint)[0], cellsOf(constraint)[1]) === edge); if (!override) add("negative-difference", `Unmarked edge has forbidden difference ${diff}.`, [a, other], "difference-kropki"); }
    if (Number.isInteger(ratio) && negativeRatios.has(ratio) && !ratioEdges.has(edge)) { const override = differences.some((constraint) => constraint.overrideNegativeRatios === true && cellsOf(constraint).length === 2 && edgeKey(cellsOf(constraint)[0], cellsOf(constraint)[1]) === edge); if (!override) add("negative-ratio", `Unmarked edge has forbidden ratio ${ratio}:1.`, [a, other], "ratio-kropki"); }
    if (negativeXv.has(sum) && !xvEdges.has(edge)) add("negative-xv", `Unmarked edge has forbidden sum ${sum}.`, [a, other], "xv");
  }
  const regionFor = (cell: CellRC) => regions.findIndex((region) => region.cells.some((entry) => key(entry) === key(cell)));
  for (const constraint of constraints) {
    const id = sourceId(constraint); if (!checked(def, id)) continue; const cells = cellsOf(constraint), full = cells.length > 0 && cells.every(has);
    if (constraint.type === "global-entropy") { const groups = Array.isArray(constraint.groups) ? (constraint.groups as unknown[]).filter(Array.isArray).map((group) => new Set((group as unknown[]).map(Number))) : []; if (groups.length) for (let r = 0; r + 1 < def.rows; r += 1) for (let c = 0; c + 1 < def.cols; c += 1) { const block = [{ r, c }, { r: r + 1, c }, { r, c: c + 1 }, { r: r + 1, c: c + 1 }]; if (!block.every(has)) continue; const memberships = new Set(block.map((cell) => groups.findIndex((group) => group.has(num(cell))))); if (memberships.has(-1) || groups.some((_, index) => !memberships.has(index))) add("global-group", `${id} conflict.`, block, constraint); } }
    if (constraint.type === "outside-clue" && full && Number.isFinite(Number(constraint.value))) { const clue = Number(constraint.value), digits = cells.map(num); let invalid = false; if (id === "little-killers") invalid = digits.reduce((sum, value) => sum + value, 0) !== clue; if (id === "sandwich-sums") { const lo = digits.indexOf(range.min), hi = digits.indexOf(range.max); invalid = lo < 0 || hi < 0 || digits.slice(Math.min(lo, hi) + 1, Math.max(lo, hi)).reduce((sum, value) => sum + value, 0) !== clue; } if (id === "x-sums") { const x = digits[0]; invalid = !Number.isInteger(x) || x < 1 || x > digits.length || digits.slice(0, x).reduce((sum, value) => sum + value, 0) !== clue; } if (id === "skyscrapers") { let tallest = -Infinity, visible = 0; for (const value of digits) if (value > tallest) { tallest = value; visible += 1; } invalid = visible !== clue; } if (id === "numbered-rooms") { const index = digits[0]; invalid = !Number.isInteger(index) || index < 1 || index > digits.length || digits[index - 1] !== clue; } if (invalid) add("outside-clue", `${id} clue is not satisfied.`, cells, constraint); }
    if (constraint.type === "indexer") for (const cell of cells) if (has(cell)) { const index = num(cell), target = id === "row-indexers" ? cell.r + 1 : cell.c + 1, pointed = id === "row-indexers" ? { r: index - 1, c: cell.c } : { r: cell.r, c: index - 1 }; if (!inBounds(def, pointed)) add("indexer", `${id} points outside the grid.`, [cell], constraint); else if (has(pointed) && num(pointed) !== target) add("indexer", `${id} target is incorrect.`, [cell, pointed], constraint); }
    if (constraint.type === "custom") { const backend = (constraint.definition as Record<string, unknown> | undefined)?.backend as Record<string, unknown> | undefined; if (backend?.type === "code") thrownErrors.push(`Custom constraint '${String((constraint.definition as Record<string, unknown> | undefined)?.name ?? id)}' is stored but arbitrary JavaScript is not executed by the SphenPad creator solver.`); continue; }
    if (constraint.type === "even") for (const cell of cells) if (has(cell) && num(cell) % 2 !== 0) add("even", "Even cell contains an odd digit.", [cell], constraint);
    if (constraint.type === "odd") for (const cell of cells) if (has(cell) && Math.abs(num(cell) % 2) !== 1) add("odd", "Odd cell contains an even digit.", [cell], constraint);
    if (constraint.type === "minimum" || constraint.type === "maximum") { const marked = constraint.type === "minimum" ? minCells : maxCells; for (const cell of cells) if (has(cell)) for (const other of orthogonal(def, cell)) if (!marked.has(key(other)) && has(other) && (constraint.type === "minimum" ? num(cell) >= num(other) : num(cell) <= num(other))) add(constraint.type, `${constraint.type === "minimum" ? "Minimum" : "Maximum"} cell violates an orthogonal neighbor.`, [cell, other], constraint); }
    if (constraint.type === "difference" && cells.length === 2 && full) { const expected = Math.max(1, Number(constraint.difference ?? constraint.value ?? 1)); if (Math.abs(num(cells[0]) - num(cells[1])) !== expected) add("difference", `Difference must be ${expected}.`, cells, constraint); }
    if (constraint.type === "ratio" && cells.length === 2 && full) { const expected = Math.max(2, Number(constraint.ratio ?? constraint.value ?? 2)), low = Math.min(num(cells[0]), num(cells[1])), high = Math.max(num(cells[0]), num(cells[1])); if (!low || high !== low * expected) add("ratio", `Ratio must be ${expected}:1.`, cells, constraint); }
    if (constraint.type === "xv" && cells.length === 2 && full) { const expected = Number(constraint.sum ?? constraint.value ?? 10); if (num(cells[0]) + num(cells[1]) !== expected) add("xv", `Pair must sum to ${expected}.`, cells, constraint); }
    if (constraint.type === "clone") { const filled = cells.filter(has); if (filled.length > 1 && filled.some((cell) => num(cell) !== num(filled[0]))) add("clone", "Clone cells must match.", filled, constraint); }
    if (constraint.type === "different-values") allDifferent(cells, "Different Values", constraint);
    if (constraint.type === "killer-cage") { const filled = cells.filter(has); allDifferent(filled, "Killer cage", constraint); const target = Number(constraint.value); if (Number.isFinite(target) && target > 0) { const sum = filled.reduce((total, cell) => total + num(cell), 0); if (sum > target || (full && sum !== target)) add("killer-sum", `Killer cage must sum to ${target}.`, filled, constraint); } }
    if (constraint.type === "quadruple" && full) { const required = Array.isArray(constraint.digits) ? (constraint.digits as unknown[]).map(Number) : [], actual = cells.map(num), need = new Map<number, number>(), got = new Map<number, number>(); required.forEach((value) => need.set(value, (need.get(value) ?? 0) + 1)); actual.forEach((value) => got.set(value, (got.get(value) ?? 0) + 1)); if ([...need].some(([value, count]) => (got.get(value) ?? 0) < count)) add("quadruple", "Quadruple clue is not represented in the surrounding cells.", cells, constraint); }
    if (constraint.type === "look-and-say-cage") { const clue = String(constraint.value ?? ""), pairs = clue.match(/\d\d/g) ?? []; if (pairs.join("") === clue) { const actual = new Map<number, number>(); cells.filter(has).forEach((cell) => actual.set(num(cell), (actual.get(num(cell)) ?? 0) + 1)); for (const pair of pairs) { const count = Number(pair[0]), digit = Number(pair[1]), seen = actual.get(digit) ?? 0; if ((count === 0 && seen > 0) || seen > count || (full && seen !== count)) { add("look-and-say", "Look-and-say cage clue is not satisfied.", cells, constraint); break; } } } }
    if (constraint.type === "counting-circles") { const filled = cells.filter(has), counts = new Map<number, number>(); filled.forEach((cell) => counts.set(num(cell), (counts.get(num(cell)) ?? 0) + 1)); for (const cell of filled) { const value = num(cell), count = counts.get(value) ?? 0; if (value < 0 || value > cells.length || count > value || (full && count !== value)) { add("counting-circles", "A circled digit must equal the number of circles containing that digit.", cells, constraint); break; } } }
    if (constraint.type === "thermometer") for (let i = 1; i < cells.length; i += 1) if (has(cells[i - 1]) && has(cells[i]) && (constraint.slow === true ? num(cells[i - 1]) > num(cells[i]) : num(cells[i - 1]) >= num(cells[i]))) add("thermometer", constraint.slow === true ? "Slow thermometer cannot decrease." : "Thermometer must strictly increase.", [cells[i - 1], cells[i]], constraint);
    if (constraint.type === "whisper") { const minimum = Math.max(1, Number(constraint.minDifference ?? (id === "dutch-whispers" ? Math.floor((creatorDigitCount(def) - 1) / 2) : Math.floor((creatorDigitCount(def) + 1) / 2)))); for (let i = 1; i < cells.length; i += 1) if (has(cells[i - 1]) && has(cells[i]) && Math.abs(num(cells[i - 1]) - num(cells[i])) < minimum) add("whisper", `Adjacent whisper digits must differ by at least ${minimum}.`, [cells[i - 1], cells[i]], constraint); }
    if (constraint.type === "palindrome") for (let i = 0; i < Math.floor(cells.length / 2); i += 1) { const other = cells.length - 1 - i; if (has(cells[i]) && has(cells[other]) && num(cells[i]) !== num(cells[other])) add("palindrome", "Mirrored palindrome cells must match.", [cells[i], cells[other]], constraint); }
    if (constraint.type === "renban") { const filled = cells.filter(has); allDifferent(filled, "Renban line", constraint); if (filled.length > 1) { const nums = filled.map(num); if (Math.max(...nums) - Math.min(...nums) > cells.length - 1) add("renban", "Renban digits cannot fit in one consecutive interval.", filled, constraint); if (full && Math.max(...nums) - Math.min(...nums) !== cells.length - 1) add("renban", "Renban digits must form one consecutive set.", cells, constraint); } }
    if (constraint.type === "between-line" && cells.length >= 3 && has(cells[0]) && has(cells[cells.length - 1])) { const low = Math.min(num(cells[0]), num(cells[cells.length - 1])), high = Math.max(num(cells[0]), num(cells[cells.length - 1])); for (const cell of cells.slice(1, -1)) if (has(cell) && !(num(cell) > low && num(cell) < high)) add("between-line", "Interior digit must lie strictly between the endpoint digits.", [cells[0], cell, cells[cells.length - 1]], constraint); }
    if (constraint.type === "region-sum-line") { const segments: Array<{ region: number; cells: CellRC[] }> = []; for (const cell of cells) { const region = regionFor(cell), last = segments[segments.length - 1]; if (last && last.region === region) last.cells.push(cell); else segments.push({ region, cells: [cell] }); } const buckets = constraint.singleRegionTotals === true ? Array.from(new Set(segments.map((segment) => segment.region))).map((region) => ({ region, cells: segments.filter((segment) => segment.region === region).flatMap((segment) => segment.cells) })) : segments; const complete = buckets.filter((bucket) => bucket.region >= 0 && bucket.cells.every(has)).map((bucket) => ({ ...bucket, sum: bucket.cells.reduce((sum, cell) => sum + num(cell), 0) })); if (complete.length > 1 && complete.some((bucket) => bucket.sum !== complete[0].sum)) add("region-sum-line", "Completed region segments must have equal sums.", complete.flatMap((bucket) => bucket.cells), constraint); }
    if (constraint.type === "sequence-line") { let expected: number | undefined; for (let i = 1; i < cells.length; i += 1) if (has(cells[i - 1]) && has(cells[i])) { const diff = num(cells[i]) - num(cells[i - 1]); if (expected === undefined) expected = diff; else if (diff !== expected) add("sequence-line", "Sequence line must use one constant difference.", [cells[i - 1], cells[i]], constraint); } }
    if (constraint.type === "entropy-line") { const groups = Array.isArray(constraint.groups) ? (constraint.groups as unknown[]).filter(Array.isArray).map((group) => new Set((group as unknown[]).map(Number))) : []; if (groups.length >= 2) for (let start = 0; start + groups.length <= cells.length; start += 1) { const window = cells.slice(start, start + groups.length); if (!window.every(has)) continue; const memberships = window.map((cell) => groups.findIndex((group) => group.has(num(cell)))); if (memberships.some((index) => index < 0) || new Set(memberships).size !== groups.length) add("entropy-line", "Each grouped-line window must contain one digit from each group.", window, constraint); } }
    if (constraint.type === "lockout-line" && cells.length >= 3 && has(cells[0]) && has(cells[cells.length - 1])) { const a = num(cells[0]), b = num(cells[cells.length - 1]), minimum = Math.max(1, Number(constraint.minDifference ?? Math.floor(creatorDigitCount(def) / 2))); if (Math.abs(a - b) < minimum) add("lockout-endpoints", `Lockout endpoints must differ by at least ${minimum}.`, [cells[0], cells[cells.length - 1]], constraint); const low = Math.min(a, b), high = Math.max(a, b); for (const cell of cells.slice(1, -1)) if (has(cell) && num(cell) > low && num(cell) < high) add("lockout-line", "Interior lockout digits must lie outside the endpoint interval.", [cells[0], cell, cells[cells.length - 1]], constraint); }
    if (constraint.type === "arrow" && cells.length >= 2) { const bulbCount = Math.max(1, Math.min(cells.length - 1, Math.trunc(Number(constraint.bulbCellCount ?? 1)))), bulb = cells.slice(0, bulbCount), shaft = cells.slice(bulbCount); if (bulb.every(has) && shaft.every(has) && bulb.reduce((sum, cell) => sum + num(cell), 0) !== shaft.reduce((sum, cell) => sum + num(cell), 0)) add("arrow", "Arrow shaft sum must equal its bulb sum.", cells, constraint); }
    if (constraint.type === "double-arrow" && cells.length >= 3 && full && num(cells[0]) + num(cells[cells.length - 1]) !== cells.slice(1, -1).reduce((sum, cell) => sum + num(cell), 0)) add("double-arrow", "Double-arrow middle sum must equal its endpoint sum.", cells, constraint);
  }
  const dedup = new Map<string, CreatorDiagnostic>(); for (const diagnostic of diagnostics) { const token = `${diagnostic.code}|${diagnostic.constraintId ?? diagnostic.sourceElementId ?? ""}|${diagnostic.cells.map(key).sort().join(",")}|${diagnostic.message}`; if (!dedup.has(token)) dedup.set(token, diagnostic); }
  const finalDiagnostics = [...dedup.values()], invalid = new Map<string, CellRC>(); for (const diagnostic of finalDiagnostics) for (const cell of diagnostic.cells) invalid.set(key(cell), cell);
  return { invalidCells: [...invalid.values()].sort((a, b) => a.r - b.r || a.c - b.c), diagnostics: finalDiagnostics, thrownErrors: [...new Set(thrownErrors)] };
}

export function workerValuesFromDefinition(def: PuzzleDefinition, source: "givens" | "solution" = "givens"): CreatorWorkerValue[] {
  if (source === "givens") return def.givens.map((given) => ({ rc: clone(given.rc), value: given.v }));
  const entries = Array.isArray(def.logic?.creatorSolutionEntries) ? def.logic!.creatorSolutionEntries as Array<{ rc: CellRC; value: string }> : [];
  return entries.map((entry) => ({ rc: clone(entry.rc), value: entry.value }));
}
