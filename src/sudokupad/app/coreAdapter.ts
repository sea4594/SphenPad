import { normalizePuzzleKey } from "../../core/id";
import type { PuzzleDefinition, PuzzleMeta } from "../../core/model";
import { emptySudokuPadUrlSettings } from "../loader/urlSettings";
import { loadResolvedSudokuPadPayload, loadSudokuPadPuzzle, type LoadSudokuPadPuzzleOptions } from "../loader/importPuzzle";
import { resolveSudokuPadInput } from "../loader/resolveInput";
import type { SudokuPadImportContext, SudokuPadImportResult } from "../types/import";
import type { SudokuPadMetadata } from "../types/source";
import { SPHENPAD_PUZZLE_DEFINITION_SCHEMA_VERSION } from "../version";
import { sphenPadSudokuPadFetchOptions } from "./network";

export const SUDOKUPAD_IMPORT_REVISION = 20;

function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const result = String(value).trim();
  return result || undefined;
}

function rulesText(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const values = value.map(text).filter((entry): entry is string => Boolean(entry));
    return values.length ? values.join("\n\n") : undefined;
  }
  return text(value);
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function metaFromSudokuPad(metadata: SudokuPadMetadata): PuzzleMeta {
  const solveCount = numeric(metadata.solveCount ?? metadata.solves ?? metadata.solveCounter ?? metadata.numSolves ?? metadata.nsolves);
  return {
    ...(text(metadata.title) ? { title: text(metadata.title) } : {}),
    ...(text(metadata.author) ? { author: text(metadata.author) } : {}),
    ...(text(metadata.collection ?? metadata.series ?? metadata.set) ? { collection: text(metadata.collection ?? metadata.series ?? metadata.set) } : {}),
    ...(rulesText(metadata.rules) ? { rules: rulesText(metadata.rules) } : {}),
    ...(text(metadata.msgcorrect ?? metadata.postSolveMessage ?? metadata.postsolve) ? { postSolveMessage: text(metadata.msgcorrect ?? metadata.postSolveMessage ?? metadata.postsolve) } : {}),
    ...(solveCount !== undefined ? { solveCount } : {}),
  };
}

export function definitionFromSudokuPadImport(result: SudokuPadImportResult): { key: string; def: PuzzleDefinition; raw: SudokuPadImportResult["sourcePuzzle"] } {
  const sourceId = result.context.sourceId || result.sourcePuzzle.id || result.input.sourceId;
  const key = normalizePuzzleKey(sourceId || result.scene.puzzleId || "sudokupad-puzzle");
  const givens = result.scene.cells.flatMap((row) => row.flatMap((cell) => cell.given === undefined ? [] : [{ rc: { r: cell.row, c: cell.col }, v: String(cell.given) }]));
  const def: PuzzleDefinition = {
    schemaVersion: SPHENPAD_PUZZLE_DEFINITION_SCHEMA_VERSION,
    id: key,
    sourceId,
    sourcePayload: result.sourcePayload,
    sourceContext: result.context,
    importRevision: SUDOKUPAD_IMPORT_REVISION,
    size: Math.max(result.scene.rows, result.scene.cols),
    rows: result.scene.rows,
    cols: result.scene.cols,
    meta: metaFromSudokuPad(result.scene.metadata),
    givens,
    scene: result.scene,
    logic: result.logic,
  };
  return { key, def, raw: result.sourcePuzzle };
}

export interface LoadSudokuPadForAppOptions {
  preloadedPayload?: string;
  skipCounterFetch?: boolean;
}

export async function loadSudokuPadForApp(input: string, options: LoadSudokuPadForAppOptions = {}): Promise<{ key: string; def: PuzzleDefinition; raw: SudokuPadImportResult["sourcePuzzle"] }> {
  const fetchOptions: LoadSudokuPadPuzzleOptions = { ...sphenPadSudokuPadFetchOptions() };
  let result: SudokuPadImportResult;
  if (options.preloadedPayload !== undefined) {
    const resolved = await resolveSudokuPadInput(input, { ...fetchOptions, resolvedPayload: true });
    const context: SudokuPadImportContext = {
      sourceId: resolved.sourceId || input,
      ...(resolved.format ? { format: resolved.format } : {}),
      urlSettings: resolved.urlSettings,
    };
    result = await loadResolvedSudokuPadPayload(options.preloadedPayload, { ...fetchOptions, context });
  } else {
    result = await loadSudokuPadPuzzle(input, fetchOptions);
  }
  return definitionFromSudokuPadImport(result);
}

export async function rehydrateImportedSudokuPadDefinition(def: PuzzleDefinition): Promise<PuzzleDefinition> {
  if (def.scene && def.logic) return def;
  if (!def.sourcePayload || def.meta.creatorPuzzle) return def;
  const context: SudokuPadImportContext = def.sourceContext ?? {
    sourceId: def.sourceId,
    urlSettings: emptySudokuPadUrlSettings(),
  };
  const result = await loadResolvedSudokuPadPayload(def.sourcePayload, {
    ...sphenPadSudokuPadFetchOptions(),
    context,
  });
  const rebuilt = definitionFromSudokuPadImport(result).def;
  return {
    ...rebuilt,
    // Preserve SphenPad/archive metadata that is not part of the SudokuPad payload.
    meta: { ...rebuilt.meta, ...def.meta },
    id: def.id || rebuilt.id,
    sourceId: def.sourceId || rebuilt.sourceId,
    sourcePayload: def.sourcePayload,
    sourceContext: def.sourceContext ?? rebuilt.sourceContext,
  };
}
