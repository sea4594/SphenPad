import type { CellRC, PuzzleDefinition, PuzzleMeta } from "../../core/model";
import { compressPuzzleBase64 } from "../codecs/base64Puzzle";
import { zipPuzzleJson } from "../codecs/puzzleZipper";
import { parseResolvedSudokuPadPayload } from "../loader/puzzleData";
import { loadSudokuPadPuzzle } from "../loader/importPuzzle";
import { normalizeSudokuPadSourcePuzzle } from "../normalize/normalizePuzzle";
import type { PuzzleLogicConstraint } from "../types/logic";
import type { SudokuPadPoint, SudokuPadSourcePuzzle } from "../types/source";
import type { FpuzzlesPart, FpuzzlesPuzzle } from "../fpuzzles/types";
import { importFpuzzlesPuzzle } from "../fpuzzles/import";
import { decodeFpuzzlesPayload } from "../fpuzzles/codec";
import { creatorProjectFromDefinition, definitionFromCreatorProject, parseCreatorProject } from "./project";
import { authoredPuzzleFile, definitionFromAuthoredPuzzleFile, type SphenPadAuthoredPuzzleFile } from "./nativeAuthoring";
import { ensureCreatorObjectIds } from "./objectEditing";
import { syncCreatorFog } from "./globalConstraints";

export type CreatorInterchangeFormat = "creator-project" | "sphenpad-authored" | "scl" | "sudokupad" | "fpuzzles" | "sudokupad-json";
export type CreatorInterchangeSeverity = "info" | "warning" | "loss";
export interface CreatorInterchangeIssue { severity: CreatorInterchangeSeverity; code: string; message: string; path?: string; }
export interface CreatorInterchangeReport { format: CreatorInterchangeFormat; issues: CreatorInterchangeIssue[]; preserved: string[]; }
export interface CreatorImportResult { def: PuzzleDefinition; report: CreatorInterchangeReport; }
export interface CreatorExportResult { sourcePuzzle: SudokuPadSourcePuzzle; scl: string; sudokuPadUrl: string; report: CreatorInterchangeReport; }

const clone = <T,>(value: T): T => value == null ? value : JSON.parse(JSON.stringify(value)) as T;
const TAG_PREFIX = "data-sphenpad-";
const cosmeticElementForCollection = (key: string) => key === "cages" ? "cosmetic-cages" : key === "lines" || key === "arrows" ? "cosmetic-lines" : "cosmetic-shapes";
function nextId(prefix: string, index: number) { return `import-${prefix}-${index + 1}`; }
function issue(report: CreatorInterchangeReport, severity: CreatorInterchangeSeverity, code: string, message: string, path?: string) { report.issues.push({ severity, code, message, ...(path ? { path } : {}) }); }
function report(format: CreatorInterchangeFormat): CreatorInterchangeReport { return { format, issues: [], preserved: [] }; }
function stripCreatorFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripCreatorFields) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) if (!key.startsWith(TAG_PREFIX) && !["creatorBackgroundName", "creatorBackgroundEnabled", "creatorBackgroundElementId", "creatorBackgroundStoredOpacity"].includes(key)) out[key] = stripCreatorFields(entry);
    return out as T;
  }
  return value;
}
function rc(point: SudokuPadPoint): CellRC { return { r: Number(point[0]), c: Number(point[1]) }; }
function parseRc(value: string): CellRC | undefined { const match = value.match(/^R(\d+)C(\d+)$/i); return match ? { r: Number(match[1]) - 1, c: Number(match[2]) - 1 } : undefined; }
function cellsFromPart(part: FpuzzlesPart): CellRC[] { return (part.cells ?? []).map(parseRc).filter((cell): cell is CellRC => Boolean(cell)); }
function lineFromPart(part: FpuzzlesPart): CellRC[][] { return (part.lines ?? []).map((line) => line.map(parseRc).filter((cell): cell is CellRC => Boolean(cell))).filter((line) => line.length > 1); }
function addConstraint(def: PuzzleDefinition, constraint: PuzzleLogicConstraint, elementId: string, index: number): PuzzleDefinition {
  const next = { ...constraint, id: nextId(elementId, index), sourceElementId: elementId };
  return { ...def, logic: { ...(def.logic ?? {}), constraints: [...(def.logic?.constraints ?? []), next] }, meta: { ...def.meta, creatorElements: [...new Set([...(def.meta.creatorElements ?? []), elementId])] } };
}
function tagImportedCosmetics(def: PuzzleDefinition): PuzzleDefinition {
  if (!def.scene) return def;
  const scene = { ...def.scene } as typeof def.scene;
  const mutable = scene as unknown as Record<string, unknown>;
  for (const key of ["lines", "arrows", "cages", "underlays", "overlays"] as const) {
    const parts = scene[key] as Array<Record<string, unknown>>;
    mutable[key] = parts.map((part, index) => {
      if (typeof part["data-sphenpad-constraint"] === "string") return part;
      return { ...part, "data-sphenpad-element": cosmeticElementForCollection(key), "data-sphenpad-object-id": `import-${key}-${index + 1}` };
    });
  }
  const active = new Set(def.meta.creatorElements ?? []);
  if (scene.lines.length || scene.arrows.length) active.add("cosmetic-lines");
  if (scene.cages.length) active.add("cosmetic-cages");
  if (scene.underlays.length || scene.overlays.length) active.add("cosmetic-shapes");
  return { ...def, scene, meta: { ...def.meta, creatorElements: [...active] } };
}
function metadataToMeta(source: SudokuPadSourcePuzzle): PuzzleMeta {
  const metadata = (source.metadata ?? source.metaData ?? {}) as Record<string, unknown>;
  return { creatorPuzzle: true, title: String(metadata.title ?? ""), author: String(metadata.author ?? ""), rules: Array.isArray(metadata.rules) ? metadata.rules.join("\n") : String(metadata.rules ?? ""), postSolveMessage: String(metadata.msgcorrect ?? "") };
}
function definitionFromSourcePuzzle(source: SudokuPadSourcePuzzle, identity: { id: string; sourceId: string }, format: CreatorInterchangeFormat, outReport: CreatorInterchangeReport): PuzzleDefinition {
  const normalized = normalizeSudokuPadSourcePuzzle(source);
  const rows = normalized.scene.rows, cols = normalized.scene.cols;
  const givens = normalized.scene.cells.flatMap((row, r) => row.flatMap((cell, c) => cell.given === undefined ? [] : [{ rc: { r, c }, v: String(cell.given) }]));
  let def: PuzzleDefinition = { schemaVersion: 4, id: identity.id, sourceId: identity.sourceId, size: Math.max(rows, cols), rows, cols, meta: metadataToMeta(source), givens, scene: normalized.scene, logic: { ...normalized.logic, constraints: [] } };
  const metadata = normalized.scene.metadata as Record<string, unknown>;
  if (metadata.norowcol === true) def.logic = { ...(def.logic ?? {}), sudokuRules: false };
  const globals = new Set([...(source.global ?? []), ...(normalized.logic.global ?? [])].map(String));
  if (globals.has("antiknight") || normalized.logic.antiKnight) def.logic = { ...(def.logic ?? {}), antiKnight: true };
  if (globals.has("antiking") || normalized.logic.antiKing) def.logic = { ...(def.logic ?? {}), antiKing: true };
  let index = 0;
  const add = (constraint: PuzzleLogicConstraint, elementId: string) => { def = addConstraint(def, constraint, elementId, index++); };
  if (source["diagonal+"] === true) add({ type: "diagonal", positive: true, cells: Array.from({ length: Math.min(rows, cols) }, (_, i) => ({ r: i, c: cols - 1 - i })) }, "positive-diagonal");
  if (source["diagonal-"] === true) add({ type: "diagonal", positive: false, cells: Array.from({ length: Math.min(rows, cols) }, (_, i) => ({ r: i, c: i })) }, "negative-diagonal");
  if (globals.has("disjoint")) add({ type: "disjoint-groups" }, "disjoint-groups");
  if (globals.has("nonconsecutive") || globals.has("antinonconsecutive")) add({ type: "nonconsecutive" }, "nonconsecutive");
  for (const cage of normalized.scene.cages) {
    const cells = (cage.cells ?? []).map(rc);
    if (!cells.length) continue;
    if (cage.style === "killer") add({ type: "killer-cage", cells, value: cage.value ?? "" }, "killer-cages");
    else if (cage.style === "extraregion" || cage.unique === true && cage.type === "disjoint") add({ type: "different-values", cells }, "different-values");
  }
  if (normalized.scene.fog) {
    if (normalized.scene.fog.initialLightCells.length) add({ type: "foglight", cells: normalized.scene.fog.initialLightCells.map(rc) }, "fog-lights");
    for (const link of normalized.scene.fog.triggerLinks ?? []) add({ type: "fog-trigger", cells: link.triggerCells.map(rc), triggerCells: link.triggerCells.map(rc), effectCells: link.effectCells.map(rc), patterns: ["Self"], overrides: [], editor: { defaultDisabling: false } }, "custom-fog-clearing");
  }
  def = tagImportedCosmetics(def);
  def = ensureCreatorObjectIds(syncCreatorFog(def));
  outReport.preserved.push("grid dimensions", "givens", "regions", "metadata", "solution metadata", "SudokuPad scene graphics", "fog data");
  if (format === "scl" || format === "sudokupad" || format === "sudokupad-json") issue(outReport, "warning", "semantic-inference", "Native SudokuPad/SCL primarily stores playable graphics rather than SudokuMaker authoring objects. Visuals are preserved as editable cosmetics; only semantics that can be inferred safely are reconstructed as creator constraints.");
  for (const diagnostic of normalized.compatibility.diagnostics ?? []) issue(outReport, diagnostic.severity === "error" ? "loss" : "warning", diagnostic.code, diagnostic.message, diagnostic.path);
  return def;
}
function addFpuzzlesSemantics(defInput: PuzzleDefinition, fpuzzle: FpuzzlesPuzzle, outReport: CreatorInterchangeReport): PuzzleDefinition {
  let def = defInput, index = (def.logic?.constraints ?? []).length;
  const add = (constraint: PuzzleLogicConstraint, elementId: string) => { def = addConstraint(def, constraint, elementId, index++); };
  if (fpuzzle.antiknight) def.logic = { ...(def.logic ?? {}), antiKnight: true };
  if (fpuzzle.antiking) def.logic = { ...(def.logic ?? {}), antiKing: true };
  if (fpuzzle.nonconsecutive && !(def.logic?.constraints ?? []).some((c) => c.type === "nonconsecutive")) add({ type: "nonconsecutive" }, "nonconsecutive");
  if (fpuzzle.disjointgroups && !(def.logic?.constraints ?? []).some((c) => c.type === "disjoint-groups")) add({ type: "disjoint-groups" }, "disjoint-groups");
  const lineMap: Array<[keyof FpuzzlesPuzzle, string, (part: FpuzzlesPart, cells: CellRC[]) => PuzzleLogicConstraint]> = [
    ["thermometer", "thermometers", (_p, cells) => ({ type: "thermometer", cells, path: cells, slow: false })],
    ["palindrome", "palindromes", (_p, cells) => ({ type: "palindrome", cells, path: cells })],
    ["betweenline", "between-lines", (_p, cells) => ({ type: "between-line", cells, path: cells })],
    ["lockout", "lockout-lines", (_p, cells) => ({ type: "lockout-line", cells, path: cells })],
  ];
  for (const [key, elementId, make] of lineMap) for (const part of ((fpuzzle[key] as FpuzzlesPart[] | undefined) ?? [])) for (const cells of lineFromPart(part)) add(make(part, cells), elementId);
  for (const part of fpuzzle.arrow ?? []) {
    const bulbCells = cellsFromPart(part);
    for (const shaft of lineFromPart(part)) {
      const path = [...bulbCells, ...shaft.filter((cell) => !bulbCells.some((bulb) => bulb.r === cell.r && bulb.c === cell.c))];
      if (path.length > 1) add({ type: "arrow", cells: path, path, bulbCellCount: Math.max(1, bulbCells.length || 1) }, "arrows");
    }
  }
  const groupMap: Array<[keyof FpuzzlesPuzzle, string, (part: FpuzzlesPart, cells: CellRC[]) => PuzzleLogicConstraint]> = [
    ["even", "even", (_p, cells) => ({ type: "even", cells })], ["odd", "odd", (_p, cells) => ({ type: "odd", cells })],
    ["minimum", "minimum", (_p, cells) => ({ type: "minimum", cells })], ["maximum", "maximum", (_p, cells) => ({ type: "maximum", cells })],
    ["difference", "difference-kropki", (p, cells) => ({ type: "difference", cells, difference: Number(p.value ?? 1), value: Number(p.value ?? 1), negativeValues: [] })],
    ["ratio", "ratio-kropki", (p, cells) => ({ type: "ratio", cells, ratio: Number(p.value ?? 2), value: Number(p.value ?? 2), negativeValues: [] })],
    ["xv", "xv", (p, cells) => ({ type: "xv", cells, sum: String(p.value ?? "X").toUpperCase() === "V" ? 5 : 10, value: String(p.value ?? "X").toUpperCase() === "V" ? 5 : 10, negativeValues: [] })],
    ["killercage", "killer-cages", (p, cells) => ({ type: "killer-cage", cells, value: p.value ?? "" })],
    ["extraregion", "different-values", (_p, cells) => ({ type: "different-values", cells })],
    ["quadruple", "quadruples", (p, cells) => ({ type: "quadruple", cells, digits: (p.values ?? []).map(Number), value: (p.values ?? []).join("") })],
  ];
  for (const [key, elementId, make] of groupMap) for (const part of ((fpuzzle[key] as FpuzzlesPart[] | undefined) ?? [])) {
    const cells = part.cell ? [parseRc(part.cell)].filter((cell): cell is CellRC => Boolean(cell)) : cellsFromPart(part);
    if (cells.length) add(make(part, cells), elementId);
  }
  for (const part of fpuzzle.clone ?? []) {
    const cells = [...(part.cells ?? []), ...(part.cloneCells ?? [])].map(parseRc).filter((cell): cell is CellRC => Boolean(cell)); if (cells.length > 1) add({ type: "clone", cells }, "clones");
  }
  if (Array.isArray(fpuzzle.negative)) issue(outReport, "warning", "negative-fpuzzles-rules", "F-Puzzles negative-constraint settings are preserved by the SudokuPad rendering import, but some per-family negative authoring switches may need review after import.", "negative");
  issue(outReport, "warning", "fpuzzles-visual-linkage", "Recognized F-Puzzles constraints are reconstructed semantically while their converted SudokuPad graphics are preserved as separately editable cosmetics. This preserves appearance and checking, but editing a semantic constraint does not automatically restyle the imported cosmetic graphic.");
  outReport.preserved.push("recognized F-Puzzles semantic constraints");
  return def;
}

export function creatorSourcePuzzle(def: PuzzleDefinition): SudokuPadSourcePuzzle {
  if (!def.scene) throw new Error("Creator puzzle has no scene to export");
  const metadata = stripCreatorFields({ ...def.scene.metadata, title: def.meta.title ?? def.scene.metadata.title, author: def.meta.author ?? def.scene.metadata.author, rules: def.meta.rules ?? def.scene.metadata.rules, msgcorrect: def.meta.postSolveMessage ?? def.scene.metadata.msgcorrect, ...(def.logic?.solution ? { solution: def.logic.solution } : {}) });
  if (def.logic?.sudokuRules === false) (metadata as Record<string, unknown>).norowcol = true;
  const cells = def.scene.cells.map((row, r) => row.map((cell, c) => {
    const clean = stripCreatorFields(cell as Record<string, unknown>); delete clean.row; delete clean.col; delete clean.given;
    const given = def.givens.find((item) => item.rc.r === r && item.rc.c === c)?.v ?? cell.given;
    return { ...clean, ...(given !== undefined ? { value: given } : {}) };
  }));
  const source: SudokuPadSourcePuzzle = { ...stripCreatorFields(def.scene.unknown), cells, regions: (def.logic?.regions ?? def.scene.regions.map((region) => region.cells.map(rc))).map((region) => region.map((cell) => [cell.r, cell.c] as SudokuPadPoint)), cages: stripCreatorFields(def.scene.cages), lines: stripCreatorFields(def.scene.lines), arrows: stripCreatorFields(def.scene.arrows), underlays: stripCreatorFields(def.scene.underlays), overlays: stripCreatorFields(def.scene.overlays), metadata };
  const globals = new Set<string>([...(def.scene.global ?? []), ...(def.logic?.global ?? [])]);
  if (def.logic?.antiKnight) globals.add("antiknight"); if (def.logic?.antiKing) globals.add("antiking");
  for (const constraint of def.logic?.constraints ?? []) {
    if (constraint.enabled === false) continue;
    const elementId = String(constraint.sourceElementId ?? "");
    if (constraint.type === "nonconsecutive") globals.add("nonconsecutive");
    if (constraint.type === "disjoint-groups") globals.add("disjoint");
    if (constraint.type === "diagonal") source[constraint.positive === true ? "diagonal+" : "diagonal-"] = true;
    if (elementId === "global-entropy") globals.add("entropy");
    if (elementId === "global-modulo-3") globals.add("modulo3");
  }
  if (globals.size) source.global = [...globals];
  if (def.scene.fog) { source.foglight = clone(def.scene.fog.initialLightCells); source.triggereffect = clone(def.scene.fog.triggerEffects); }
  return source;
}
export function encodeCreatorScl(def: PuzzleDefinition): string { return `scl${compressPuzzleBase64(zipPuzzleJson(creatorSourcePuzzle(def)))}`; }
export function creatorSudokuPadUrl(def: PuzzleDefinition): string { return `https://sudokupad.app/${encodeCreatorScl(def)}`; }
export function exportCreatorInterchange(def: PuzzleDefinition): CreatorExportResult {
  const outReport = report("scl"), sourcePuzzle = creatorSourcePuzzle(def), scl = `scl${compressPuzzleBase64(zipPuzzleJson(sourcePuzzle))}`;
  outReport.preserved.push("grid", "givens", "regions", "metadata", "solution", "render scene", "fog", "supported global flags");
  const custom = (def.logic?.constraints ?? []).filter((constraint) => constraint.type === "custom" && constraint.enabled !== false);
  if (custom.length) issue(outReport, "loss", "custom-runtime-not-exported", `${custom.length} custom constraint backend${custom.length === 1 ? " is" : "s are"} not executable in SudokuPad. Their visible graphics are exported, but SphenPad-only backend code is not embedded as SudokuPad logic.`);
  if ((def.logic?.constraints ?? []).some((constraint) => constraint.ignoreInSolver)) issue(outReport, "warning", "solver-ignore-local", "SphenPad 'ignore in solver/checker' flags are authoring metadata and are not represented in SudokuPad links.");
  return { sourcePuzzle, scl, sudokuPadUrl: `https://sudokupad.app/${scl}`, report: outReport };
}
export function creatorProjectJson(def: PuzzleDefinition): string { return JSON.stringify(creatorProjectFromDefinition(def), null, 2); }
export function authoredPuzzleJson(def: PuzzleDefinition): string { return JSON.stringify(authoredPuzzleFile(def), null, 2); }

export async function importCreatorInterchange(input: string, identity: { id: string; sourceId: string }): Promise<CreatorImportResult> {
  const trimmed = input.trim(); if (!trimmed) throw new Error("Import is empty");
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (record.format === "sphenpad-creator-project") return { def: definitionFromCreatorProject(parseCreatorProject(parsed), identity), report: { ...report("creator-project"), preserved: ["complete editable CreatorProject"] } };
      if (record.format === "sphenpad") return { def: definitionFromAuthoredPuzzleFile(parsed as SphenPadAuthoredPuzzleFile, identity), report: { ...report("sphenpad-authored"), preserved: ["complete SphenPad authored project"] } };
      if (Array.isArray(record.grid)) {
        const fpuzzle = parsed as FpuzzlesPuzzle, imported = importFpuzzlesPuzzle(fpuzzle), outReport = report("fpuzzles");
        let def = definitionFromSourcePuzzle(imported.puzzle, identity, "fpuzzles", outReport); def = addFpuzzlesSemantics(def, fpuzzle, outReport);
        for (const key of imported.unsupportedKeys) issue(outReport, "loss", "unsupported-fpuzzles-key", `F-Puzzles field '${key}' is not supported by the pinned SudokuPad converter and could not be imported.`, key);
        return { def, report: outReport };
      }
      if (Array.isArray(record.cells)) { const outReport = report("sudokupad-json"); return { def: definitionFromSourcePuzzle(parsed as SudokuPadSourcePuzzle, identity, "sudokupad-json", outReport), report: outReport }; }
    }
  } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  const format: CreatorInterchangeFormat = /^fpuz(?:zles)?/i.test(trimmed) ? "fpuzzles" : /^scl|^ctc/i.test(trimmed) ? "scl" : /sudokupad\.app/i.test(trimmed) ? "sudokupad" : "scl";
  if (format === "fpuzzles") {
    const fpuzzle = decodeFpuzzlesPayload(trimmed), imported = importFpuzzlesPuzzle(fpuzzle), outReport = report("fpuzzles");
    let def = definitionFromSourcePuzzle(imported.puzzle, identity, "fpuzzles", outReport); def = addFpuzzlesSemantics(def, fpuzzle, outReport);
    for (const key of imported.unsupportedKeys) issue(outReport, "loss", "unsupported-fpuzzles-key", `F-Puzzles field '${key}' is unsupported.`, key);
    return { def, report: outReport };
  }
  if (format === "scl") { const parsed = parseResolvedSudokuPadPayload(trimmed); if (!parsed.sourcePuzzle) throw new Error("SCL input did not contain a puzzle"); const outReport = report("scl"); return { def: definitionFromSourcePuzzle(parsed.sourcePuzzle, identity, "scl", outReport), report: outReport }; }
  const loaded = await loadSudokuPadPuzzle(trimmed); const outReport = report("sudokupad");
  const def = definitionFromSourcePuzzle(loaded.sourcePuzzle, identity, "sudokupad", outReport);
  for (const diagnostic of loaded.compatibility.diagnostics ?? []) issue(outReport, diagnostic.severity === "error" ? "loss" : "warning", diagnostic.code, diagnostic.message, diagnostic.path);
  return { def, report: outReport };
}
