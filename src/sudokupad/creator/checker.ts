import type { CellRC, PuzzleDefinition } from "../../core/model";
import { creatorConstraints, getCreatorRegions } from "./nativeAuthoring";
import { creatorDigitCount, creatorDigitRange, creatorRegionMode, getCreatorSolutionEntries, inferCreatorBoxSize } from "./gridStructure";
import { normalizeCreatorLineConstraints } from "./lineConstraints";
import { normalizeCreatorGroupConstraints, validateGroupConstraintShape } from "./groupConstraints";
import { creatorSudokuRulesEnabled, normalizeCreatorGlobalConstraints, validateGlobalConstraintShape } from "./globalConstraints";

function key(cell: CellRC) { return `${cell.r}:${cell.c}`; }

export function validateCreatorDefinition(input: PuzzleDefinition): string[] {
  const def = normalizeCreatorGlobalConstraints(normalizeCreatorGroupConstraints(normalizeCreatorLineConstraints(input)));
  const messages: string[] = [];
  if (!Number.isInteger(def.rows) || !Number.isInteger(def.cols) || def.rows < 1 || def.cols < 1 || def.rows > 30 || def.cols > 30) messages.push("Grid dimensions must be whole numbers from 1 to 30.");
  const range = creatorDigitRange(def), digitCount = creatorDigitCount(def);
  if (range.min < 1 || range.max > 64 || range.min > range.max) messages.push("Digit range must stay between 1 and 64.");
  const values = new Map(def.givens.map((given) => [key(given.rc), given.v.trim().toUpperCase()]));
  const seen = new Set<string>();
  for (const given of def.givens) {
    const cellKey = key(given.rc);
    if (seen.has(cellKey)) messages.push("A cell has more than one given.");
    seen.add(cellKey);
    if (given.rc.r < 0 || given.rc.c < 0 || given.rc.r >= def.rows || given.rc.c >= def.cols) messages.push("A given sits outside the board.");
  }
  for (const given of def.givens) {
    const value = Number(given.v);
    if (!Number.isInteger(value) || value < range.min || value > range.max) messages.push(`Given ${given.v} is outside the allowed range ${range.min}-${range.max}.`);
  }
  const duplicates = (cells: CellRC[], label: string) => {
    const symbols = new Set<string>();
    for (const cell of cells) {
      const symbol = values.get(key(cell));
      if (!symbol) continue;
      if (symbols.has(symbol)) { messages.push(`Duplicate given in ${label}.`); return; }
      symbols.add(symbol);
    }
  };
  if (creatorSudokuRulesEnabled(def)) {
    for (let r = 0; r < def.rows; r += 1) duplicates(Array.from({ length: def.cols }, (_, c) => ({ r, c })), `row ${r + 1}`);
    for (let c = 0; c < def.cols; c += 1) duplicates(Array.from({ length: def.rows }, (_, r) => ({ r, c })), `column ${c + 1}`);
  }
  const regions = getCreatorRegions(def);
  regions.forEach((region, index) => duplicates(region.cells, `region ${region.label ?? index + 1}`));
  const regionCells = new Map<string, number>();
  regions.forEach((region, index) => {
    const local = new Set<string>();
    for (const cell of region.cells) {
      if (!isFinite(cell.r) || !isFinite(cell.c) || cell.r < 0 || cell.c < 0 || cell.r >= def.rows || cell.c >= def.cols) messages.push(`Region ${region.label ?? index + 1} contains a cell outside the board.`);
      const cellKey = key(cell);
      if (local.has(cellKey)) messages.push(`Region ${region.label ?? index + 1} contains the same cell more than once.`);
      local.add(cellKey);
      regionCells.set(cellKey, (regionCells.get(cellKey) ?? 0) + 1);
    }
  });
  if (Array.from(regionCells.values()).some((count) => count > 1)) messages.push("A cell belongs to more than one region.");
  const mode = creatorRegionMode(def);
  if (mode === "none" && regions.length) messages.push("Region mode is None, but regions are still defined.");
  if (mode !== "none") {
    const missing = def.rows * def.cols - regionCells.size;
    if (missing > 0) messages.push(`${missing} cell${missing === 1 ? "" : "s"} are not assigned to a region.`);
    if (regions.some((region) => region.cells.length !== digitCount)) messages.push(`Every region should contain ${digitCount} cells for the current digit range.`);
  }
  if (mode === "regular") {
    const box = inferCreatorBoxSize(def);
    if (!box) messages.push("Regular regions do not form a consistent box grid.");
    else if (box.rows * box.cols !== digitCount) messages.push(`Regular boxes contain ${box.rows * box.cols} cells, but the digit range contains ${digitCount} values.`);
  }
  const solutionEntries = getCreatorSolutionEntries(def);
  const solutionByCell = new Map(solutionEntries.map((entry) => [key(entry.rc), entry.value]));
  const duplicateSolutions = new Set<string>();
  for (const entry of solutionEntries) {
    const cellKey = key(entry.rc);
    if (duplicateSolutions.has(cellKey)) messages.push("A cell has more than one solution value.");
    duplicateSolutions.add(cellKey);
    if (entry.rc.r < 0 || entry.rc.c < 0 || entry.rc.r >= def.rows || entry.rc.c >= def.cols) messages.push("A solution value sits outside the board.");
    const value = Number(entry.value);
    if (!Number.isInteger(value) || value < range.min || value > range.max) messages.push(`Solution value ${entry.value} is outside the allowed range ${range.min}-${range.max}.`);
  }
  if (solutionEntries.length && solutionByCell.size !== def.rows * def.cols) messages.push(`Solution is incomplete (${solutionByCell.size}/${def.rows * def.cols} cells).`);
  if (solutionEntries.length) {
    const duplicateSolution = (cells: CellRC[], label: string) => {
      const symbols = new Set<string>();
      for (const cell of cells) {
        const symbol = solutionByCell.get(key(cell));
        if (!symbol) continue;
        if (symbols.has(symbol)) { messages.push(`Duplicate solution value in ${label}.`); return; }
        symbols.add(symbol);
      }
    };
    if (creatorSudokuRulesEnabled(def)) {
      for (let r = 0; r < def.rows; r += 1) duplicateSolution(Array.from({ length: def.cols }, (_, c) => ({ r, c })), `row ${r + 1}`);
      for (let c = 0; c < def.cols; c += 1) duplicateSolution(Array.from({ length: def.rows }, (_, r) => ({ r, c })), `column ${c + 1}`);
    }
    regions.forEach((region, index) => duplicateSolution(region.cells, `region ${region.label ?? index + 1}`));
  }
  for (const given of def.givens) {
    const expected = solutionByCell.get(key(given.rc));
    if (expected && expected !== given.v) messages.push("A given conflicts with the solution.");
  }
  const checked = (id: string) => def.meta.creatorConstraintChecks?.[id] !== false;
  const num = (cell: CellRC) => Number(values.get(key(cell)));
  const has = (cell: CellRC) => Number.isFinite(num(cell));
  const pairs = (cells: CellRC[]) => cells.slice(1).map((cell, index) => [cells[index], cell] as const);
  if (checked("antiking") && def.logic?.antiKing) for (const given of def.givens) for (const dr of [-1, 1]) for (const dc of [-1, 1]) if (values.get(key({ r: given.rc.r + dr, c: given.rc.c + dc })) === given.v) messages.push("Anti-king conflict.");
  if (checked("antiknight") && def.logic?.antiKnight) for (const given of def.givens) for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) if (values.get(key({ r: given.rc.r + dr, c: given.rc.c + dc })) === given.v) messages.push("Anti-knight conflict.");
  const globalConstraints = creatorConstraints(def).filter((constraint) => constraint.enabled !== false && constraint.ignoreInSolver !== true);
  const markAllDifferent = (cells: CellRC[], label: string) => { const seenValues = new Set<number>(); for (const cell of cells) if (has(cell)) { const value = num(cell); if (seenValues.has(value)) { messages.push(`${label} conflict.`); return; } seenValues.add(value); } };
  for (const constraint of globalConstraints) { const sourceId = String(constraint.sourceElementId ?? constraint.type); if (constraint.type === "diagonal" && checked(sourceId)) markAllDifferent((constraint.cells ?? []) as CellRC[], sourceId === "positive-diagonal" ? "Positive diagonal" : "Negative diagonal"); }
  if (checked("disjoint-groups") && globalConstraints.some((constraint) => constraint.type === "disjoint-groups")) {
    const sizes = new Set(regions.map((region) => region.cells.length));
    if (regions.length < 2 || sizes.size !== 1) messages.push("Disjoint groups require active regions of equal size.");
    else for (let index = 0; index < regions[0].cells.length; index += 1) markAllDifferent(regions.map((region) => region.cells[index]).filter(Boolean), `Disjoint group ${index + 1}`);
  }
  if (checked("nonconsecutive") && globalConstraints.some((constraint) => constraint.type === "nonconsecutive")) for (let r = 0; r < def.rows; r += 1) for (let c = 0; c < def.cols; c += 1) for (const other of [{ r: r + 1, c }, { r, c: c + 1 }]) if (other.r < def.rows && other.c < def.cols && has({ r, c }) && has(other) && Math.abs(num({ r, c }) - num(other)) === 1) messages.push("Nonconsecutive conflict.");
  const enabledConstraints = creatorConstraints(def).filter((constraint) => constraint.enabled !== false && constraint.ignoreInSolver !== true);
  const groupCells = (type: string) => enabledConstraints.filter((constraint) => constraint.type === type).flatMap((constraint) => (constraint.cells ?? []) as CellRC[]);
  const cellSet = (cells: CellRC[]) => new Set(cells.map(key));
  const minimumCells = cellSet(groupCells("minimum")), maximumCells = cellSet(groupCells("maximum"));
  if ([...minimumCells].some((cellKey) => maximumCells.has(cellKey))) messages.push("Minimum and maximum cells cannot overlap.");
  const orthogonal = (cell: CellRC) => [{ r: cell.r - 1, c: cell.c }, { r: cell.r + 1, c: cell.c }, { r: cell.r, c: cell.c - 1 }, { r: cell.r, c: cell.c + 1 }].filter((other) => other.r >= 0 && other.c >= 0 && other.r < def.rows && other.c < def.cols);
  const edgeKey = (a: CellRC, b: CellRC) => [key(a), key(b)].sort().join("|");
  const differences = enabledConstraints.filter((constraint) => constraint.type === "difference" && checked(String(constraint.sourceElementId ?? "difference-kropki")));
  const ratios = enabledConstraints.filter((constraint) => constraint.type === "ratio" && checked(String(constraint.sourceElementId ?? "ratio-kropki")));
  const xvs = enabledConstraints.filter((constraint) => constraint.type === "xv" && checked(String(constraint.sourceElementId ?? "xv")));
  const differenceEdges = new Set(differences.filter((constraint) => (constraint.cells?.length ?? 0) === 2).map((constraint) => edgeKey(constraint.cells![0], constraint.cells![1])));
  const ratioEdges = new Set(ratios.filter((constraint) => (constraint.cells?.length ?? 0) === 2).map((constraint) => edgeKey(constraint.cells![0], constraint.cells![1])));
  const xvEdges = new Set(xvs.filter((constraint) => (constraint.cells?.length ?? 0) === 2).map((constraint) => edgeKey(constraint.cells![0], constraint.cells![1])));
  const negativeDifferences = new Set(differences.flatMap((constraint) => Array.isArray(constraint.negativeValues) ? (constraint.negativeValues as unknown[]).map(Number).filter(Number.isFinite) : []));
  const negativeRatios = new Set(ratios.flatMap((constraint) => Array.isArray(constraint.negativeValues) ? (constraint.negativeValues as unknown[]).map(Number).filter(Number.isFinite) : []));
  const negativeXv = new Set(xvs.flatMap((constraint) => Array.isArray(constraint.negativeValues) ? (constraint.negativeValues as unknown[]).map(Number).filter(Number.isFinite) : []));
  const allEdges: Array<[CellRC, CellRC]> = [];
  for (let r = 0; r < def.rows; r += 1) for (let c = 0; c < def.cols; c += 1) { if (c + 1 < def.cols) allEdges.push([{ r, c }, { r, c: c + 1 }]); if (r + 1 < def.rows) allEdges.push([{ r, c }, { r: r + 1, c }]); }
  for (const [a, b] of allEdges) {
    if (!has(a) || !has(b)) continue;
    const edge = edgeKey(a, b), av = num(a), bv = num(b), diff = Math.abs(av - bv), low = Math.min(av, bv), high = Math.max(av, bv), ratio = low === 0 ? Number.POSITIVE_INFINITY : high / low, sum = av + bv;
    if (negativeDifferences.has(diff) && !differenceEdges.has(edge)) { const ratioOverride = ratios.some((constraint) => constraint.overrideNegativeDifferences === true && (constraint.cells?.length ?? 0) === 2 && edgeKey(constraint.cells![0], constraint.cells![1]) === edge); if (!ratioOverride) messages.push(`Negative difference conflict (${diff}).`); }
    if (Number.isInteger(ratio) && negativeRatios.has(ratio) && !ratioEdges.has(edge)) { const differenceOverride = differences.some((constraint) => constraint.overrideNegativeRatios === true && (constraint.cells?.length ?? 0) === 2 && edgeKey(constraint.cells![0], constraint.cells![1]) === edge); if (!differenceOverride) messages.push(`Negative ratio conflict (${ratio}:1).`); }
    if (negativeXv.has(sum) && !xvEdges.has(edge)) messages.push(`Negative XV conflict (sum ${sum}).`);
  }
  for (const constraint of creatorConstraints(def)) {
    if (constraint.enabled === false || constraint.ignoreInSolver === true) continue;
    const cells = constraint.path ?? constraint.cells ?? [];
    const sourceId = typeof constraint.sourceElementId === "string" ? constraint.sourceElementId : constraint.type;
    messages.push(...validateGroupConstraintShape(def, constraint));
    messages.push(...validateGlobalConstraintShape(def, constraint));
    if (constraint.type === "global-entropy" && checked(sourceId)) {
      const groups = Array.isArray(constraint.groups) ? (constraint.groups as unknown[]).filter(Array.isArray).map((group) => new Set((group as unknown[]).map(Number))) : [];
      if (groups.length) for (let r = 0; r + 1 < def.rows; r += 1) for (let c = 0; c + 1 < def.cols; c += 1) { const block = [{ r, c }, { r: r + 1, c }, { r, c: c + 1 }, { r: r + 1, c: c + 1 }]; if (!block.every(has)) continue; const memberships = new Set(block.map((cell) => groups.findIndex((group) => group.has(num(cell))))); if (memberships.has(-1) || groups.some((_, index) => !memberships.has(index))) messages.push(`${sourceId} conflict.`); }
    }
    if (constraint.type === "outside-clue" && checked(sourceId) && cells.length >= 2 && cells.every(has) && Number.isFinite(Number(constraint.value))) {
      const clue = Number(constraint.value), digits = cells.map(num);
      if (sourceId === "little-killers" && digits.reduce((sum, value) => sum + value, 0) !== clue) messages.push("Little killer sum conflict.");
      if (sourceId === "sandwich-sums") { const lo = digits.indexOf(range.min), hi = digits.indexOf(range.max); if (lo < 0 || hi < 0) messages.push("Sandwich sum conflict."); else { const a = Math.min(lo, hi), b = Math.max(lo, hi); if (digits.slice(a + 1, b).reduce((sum, value) => sum + value, 0) !== clue) messages.push("Sandwich sum conflict."); } }
      if (sourceId === "x-sums") { const x = digits[0]; if (!Number.isInteger(x) || x < 1 || x > digits.length || digits.slice(0, x).reduce((sum, value) => sum + value, 0) !== clue) messages.push("X-sum conflict."); }
      if (sourceId === "skyscrapers") { let tallest = Number.NEGATIVE_INFINITY, visible = 0; for (const value of digits) if (value > tallest) { tallest = value; visible += 1; } if (visible !== clue) messages.push("Skyscraper conflict."); }
      if (sourceId === "numbered-rooms") { const index = digits[0]; if (!Number.isInteger(index) || index < 1 || index > digits.length || digits[index - 1] !== clue) messages.push("Numbered room conflict."); }
    }
    if (constraint.type === "indexer" && checked(sourceId)) for (const cell of cells) if (has(cell)) { const index = num(cell), target = sourceId === "row-indexers" ? cell.r + 1 : cell.c + 1; const pointed = sourceId === "row-indexers" ? { r: index - 1, c: cell.c } : { r: cell.r, c: index - 1 }; if (pointed.r < 0 || pointed.c < 0 || pointed.r >= def.rows || pointed.c >= def.cols || (has(pointed) && num(pointed) !== target)) messages.push(`${sourceId === "row-indexers" ? "Row" : "Column"} indexer conflict.`); }
    if (constraint.type === "even" && checked(sourceId)) for (const cell of cells) if (has(cell) && num(cell) % 2 !== 0) messages.push("Even cell conflict.");
    if (constraint.type === "odd" && checked(sourceId)) for (const cell of cells) if (has(cell) && Math.abs(num(cell) % 2) !== 1) messages.push("Odd cell conflict.");
    if ((constraint.type === "minimum" || constraint.type === "maximum") && checked(sourceId)) {
      const marked = constraint.type === "minimum" ? minimumCells : maximumCells;
      for (const cell of cells) if (has(cell)) for (const other of orthogonal(cell)) if (!marked.has(key(other)) && has(other)) {
        if (constraint.type === "minimum" && num(cell) >= num(other)) messages.push("Minimum cell conflict.");
        if (constraint.type === "maximum" && num(cell) <= num(other)) messages.push("Maximum cell conflict.");
      }
    }
    if (constraint.type === "difference" && checked(sourceId) && cells.length === 2 && has(cells[0]) && has(cells[1])) { const difference = Math.max(1, Number(constraint.difference ?? constraint.value ?? 1)); if (Math.abs(num(cells[0]) - num(cells[1])) !== difference) messages.push(`Difference dot conflict (difference ${difference}).`); }
    if (constraint.type === "ratio" && checked(sourceId) && cells.length === 2 && has(cells[0]) && has(cells[1])) { const ratio = Math.max(2, Number(constraint.ratio ?? constraint.value ?? 2)), low = Math.min(num(cells[0]), num(cells[1])), high = Math.max(num(cells[0]), num(cells[1])); if (low === 0 || high !== low * ratio) messages.push(`Ratio dot conflict (${ratio}:1).`); }
    if (constraint.type === "xv" && checked(sourceId) && cells.length === 2 && has(cells[0]) && has(cells[1])) { const sum = Number(constraint.sum ?? constraint.value ?? 10); if (num(cells[0]) + num(cells[1]) !== sum) messages.push(`${sum === 5 ? "V" : "X"} conflict.`); }
    if (constraint.type === "clone" && checked(sourceId)) { const nums = cells.filter(has).map(num); if (nums.length > 1 && nums.some((value) => value !== nums[0])) messages.push("Clone conflict."); }
    if (constraint.type === "different-values" && checked(sourceId)) { const nums = cells.filter(has).map(num); if (new Set(nums).size !== nums.length) messages.push("Different Values conflict."); }
    if (constraint.type === "quadruple" && checked(sourceId) && cells.every(has)) { const required = Array.isArray(constraint.digits) ? (constraint.digits as unknown[]).map(Number) : []; const available = cells.map(num); const need = new Map<number, number>(); const got = new Map<number, number>(); required.forEach((value) => need.set(value, (need.get(value) ?? 0) + 1)); available.forEach((value) => got.set(value, (got.get(value) ?? 0) + 1)); if ([...need].some(([value, count]) => (got.get(value) ?? 0) < count)) messages.push("Quadruple conflict."); }
    if (constraint.type === "look-and-say-cage" && checked(sourceId)) { const clue = String(constraint.value ?? ""), pairs = clue.match(/\d\d/g) ?? []; if (pairs.join("") === clue) { const actual = new Map<number, number>(); cells.filter(has).map(num).forEach((value) => actual.set(value, (actual.get(value) ?? 0) + 1)); for (const pair of pairs) { const count = Number(pair[0]), digit = Number(pair[1]), seenCount = actual.get(digit) ?? 0; if (count === 0 && seenCount > 0) messages.push("Look-and-say cage conflict."); else if (seenCount > count || (cells.every(has) && seenCount !== count)) messages.push("Look-and-say cage conflict."); } } }
    if (constraint.type === "counting-circles" && checked(sourceId)) { const nums = cells.filter(has).map(num), counts = new Map<number, number>(); nums.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1)); for (const value of nums) { const count = counts.get(value) ?? 0; if (value < 0 || value > cells.length || count > value || (cells.every(has) && count !== value)) { messages.push("Counting Circles conflict."); break; } } }
    if (["thermometer", "whisper", "renban", "palindrome", "between-line", "region-sum-line", "sequence-line", "entropy-line", "lockout-line", "arrow", "double-arrow"].includes(constraint.type) && cells.length < 2) messages.push(`${sourceId} needs at least two cells.`);
    if (["between-line", "lockout-line", "double-arrow"].includes(constraint.type) && cells.length < 3) messages.push(`${sourceId} needs at least three cells.`);
    if (constraint.type === "arrow" && Number(constraint.bulbCellCount ?? 1) >= cells.length) messages.push("Arrow needs at least one shaft cell after its bulb.");
    if (constraint.type === "entropy-line") {
      const groups = Array.isArray(constraint.groups) ? (constraint.groups as unknown[]).filter(Array.isArray).map((group) => (group as unknown[]).map(Number)) : [];
      const flat = groups.flat();
      if (groups.length < 2 || groups.some((group) => !group.length) || flat.some((digit) => !Number.isInteger(digit) || digit < range.min || digit > range.max) || new Set(flat).size !== flat.length) messages.push("Grouped line digit groups are invalid or overlap.");
    }
    if (constraint.type === "difference-kropki" && checked("difference-kropki") && cells.length >= 2 && has(cells[0]) && has(cells[1]) && Math.abs(num(cells[0]) - num(cells[1])) !== 1) messages.push("White dot conflict.");
    if (constraint.type === "ratio-kropki" && checked("ratio-kropki") && cells.length >= 2 && has(cells[0]) && has(cells[1]) && Math.max(num(cells[0]), num(cells[1])) !== Math.min(num(cells[0]), num(cells[1])) * 2) messages.push("Black dot conflict.");
    if (constraint.type === "thermometer" && checked(sourceId)) {
      const slow = constraint.slow === true;
      for (const [a,b] of pairs(cells)) if (has(a) && has(b) && (slow ? num(a) > num(b) : num(a) >= num(b))) messages.push(slow ? "Slow thermometer conflict." : "Thermometer conflict.");
    }
    if (constraint.type === "whisper" && checked(sourceId)) {
      const minimum = Math.max(1, Number(constraint.minDifference ?? (sourceId === "dutch-whispers" ? Math.floor((digitCount - 1) / 2) : Math.floor((digitCount + 1) / 2))));
      for (const [a,b] of pairs(cells)) if (has(a) && has(b) && Math.abs(num(a) - num(b)) < minimum) messages.push(`Whisper conflict (minimum difference ${minimum}).`);
    }
    if (constraint.type === "palindrome" && checked(sourceId)) for (let i = 0; i < Math.floor(cells.length / 2); i += 1) { const a = cells[i]; const b = cells[cells.length - 1 - i]; if (has(a) && has(b) && num(a) !== num(b)) messages.push("Palindrome conflict."); }
    if (constraint.type === "renban" && checked(sourceId)) { const nums = cells.filter(has).map(num); if (nums.length === cells.length && (new Set(nums).size !== nums.length || Math.max(...nums) - Math.min(...nums) !== nums.length - 1)) messages.push("Renban conflict."); }
    if (constraint.type === "between-line" && checked(sourceId) && cells.length >= 3 && has(cells[0]) && has(cells[cells.length - 1])) {
      const low = Math.min(num(cells[0]), num(cells[cells.length - 1])), high = Math.max(num(cells[0]), num(cells[cells.length - 1]));
      for (const cell of cells.slice(1, -1)) if (has(cell) && !(num(cell) > low && num(cell) < high)) messages.push("Between line conflict.");
    }
    if (constraint.type === "region-sum-line" && checked(sourceId) && cells.length >= 2) {
      const regionFor = (cell: CellRC) => regions.findIndex((region) => region.cells.some((entry) => key(entry) === key(cell)));
      const segments: Array<{ region: number; cells: CellRC[] }> = [];
      for (const cell of cells) { const region = regionFor(cell); const last = segments[segments.length - 1]; if (last && last.region === region) last.cells.push(cell); else segments.push({ region, cells: [cell] }); }
      const buckets = constraint.singleRegionTotals === true ? Array.from(new Set(segments.map((segment) => segment.region))).map((region) => ({ region, cells: segments.filter((segment) => segment.region === region).flatMap((segment) => segment.cells) })) : segments;
      const sums = buckets.filter((bucket) => bucket.region >= 0 && bucket.cells.every(has)).map((bucket) => bucket.cells.reduce((sum, cell) => sum + num(cell), 0));
      if (sums.length > 1 && sums.some((sum) => sum !== sums[0])) messages.push("Region sum line conflict.");
    }
    if (constraint.type === "sequence-line" && checked(sourceId) && cells.length >= 3 && cells.every(has)) {
      const nums = cells.map(num), difference = nums[1] - nums[0];
      if (nums.slice(2).some((value, index) => value - nums[index + 1] !== difference)) messages.push("Sequence line conflict.");
    }
    if (constraint.type === "entropy-line" && checked(sourceId)) {
      const groups = Array.isArray(constraint.groups) ? (constraint.groups as unknown[]).filter(Array.isArray).map((group) => new Set((group as unknown[]).map(Number))) : [];
      if (groups.length >= 2) for (let start = 0; start + groups.length <= cells.length; start += 1) {
        const window = cells.slice(start, start + groups.length);
        if (!window.every(has)) continue;
        const memberships = window.map((cell) => groups.findIndex((group) => group.has(num(cell))));
        if (memberships.some((index) => index < 0) || new Set(memberships).size !== groups.length) { messages.push("Grouped line conflict."); break; }
      }
    }
    if (constraint.type === "lockout-line" && checked(sourceId) && cells.length >= 3 && has(cells[0]) && has(cells[cells.length - 1])) {
      const a = num(cells[0]), b = num(cells[cells.length - 1]), minimum = Math.max(1, Number(constraint.minDifference ?? Math.floor(digitCount / 2)));
      if (Math.abs(a - b) < minimum) messages.push(`Lockout endpoint conflict (minimum difference ${minimum}).`);
      const low = Math.min(a, b), high = Math.max(a, b);
      for (const cell of cells.slice(1, -1)) if (has(cell) && num(cell) > low && num(cell) < high) messages.push("Lockout line conflict.");
    }
    if (constraint.type === "arrow" && checked(sourceId) && cells.length >= 2) {
      const bulbCount = Math.max(1, Math.min(cells.length - 1, Math.trunc(Number(constraint.bulbCellCount ?? 1))));
      const bulb = cells.slice(0, bulbCount), shaft = cells.slice(bulbCount);
      if (bulb.every(has) && shaft.every(has) && bulb.reduce((sum, cell) => sum + num(cell), 0) !== shaft.reduce((sum, cell) => sum + num(cell), 0)) messages.push("Arrow sum conflict.");
    }
    if (constraint.type === "double-arrow" && checked(sourceId) && cells.length >= 3 && cells.every(has)) {
      const ends = num(cells[0]) + num(cells[cells.length - 1]);
      const middle = cells.slice(1, -1).reduce((sum, cell) => sum + num(cell), 0);
      if (middle !== ends) messages.push("Double arrow sum conflict.");
    }
    if (constraint.type === "killer-cage" && checked("killer-cages")) { const nums = cells.filter(has).map(num); if (new Set(nums).size !== nums.length) messages.push("Killer cage has repeated digits."); if (String(constraint.value ?? "").trim() !== "" && Number(constraint.value) > 0 && nums.length === cells.length && nums.reduce((a,b)=>a+b,0) !== Number(constraint.value)) messages.push("Killer cage sum conflict."); }
  }
  return [...new Set(messages)];
}
