import { parseSudokuPadPuzzlePack } from "../codecs/pack";
import { compressPuzzleBase64 } from "../codecs/base64Puzzle";
import { addSudokuPadDiagnostic, createSudokuPadCompatibilityReport } from "../diagnostics/warnings";
import { normalizeSudokuPadSourcePuzzle } from "../normalize/normalizePuzzle";
import type { SudokuPadImportContext, SudokuPadImportResult } from "../types/import";
import type { ResolvedSudokuPadInput } from "../types/formats";
import { SUDOKUPAD_COMPAT_TARGET_VERSION } from "../version";
import { parseResolvedSudokuPadPayload } from "./puzzleData";
import { resolveSudokuPadInput, type ResolveSudokuPadInputOptions } from "./resolveInput";
import { fetchSudokuPadPuzzlePayload } from "./remotePuzzle";
import { isRemoteSudokuPadPuzzleId } from "./formatRegistry";
import { getSudokuPadPuzzleFont, getSudokuPadPuzzleFontIdFromLegacyIndex } from "../assets/fontRegistry";

export interface LoadSudokuPadPuzzleOptions extends ResolveSudokuPadInputOptions {
  packIndex?: number;
}

async function parseResolvedRecursively(
  resolved: ResolvedSudokuPadInput,
  rootPayload: string,
  options: LoadSudokuPadPuzzleOptions,
  rootInput: ResolvedSudokuPadInput = resolved,
): Promise<SudokuPadImportResult> {
  if (!resolved.payload) throw new Error("Resolved SudokuPad input has no payload");
  const parsed = parseResolvedSudokuPadPayload(resolved.payload);

  if (parsed.format === "pack") {
    const pack = parseSudokuPadPuzzlePack(parsed.packData);
    const index = options.packIndex ?? resolved.urlSettings.packIndex ?? 0;
    const entry = pack.puzzles[index];
    if (!entry) throw new Error(`SudokuPad puzzle pack has no puzzle at index ${index}`);
    const nestedPayload = await fetchSudokuPadPuzzlePayload(entry.puzzle, options);
    const nested: ResolvedSudokuPadInput = {
      originalInput: resolved.originalInput,
      sourceId: entry.puzzle,
      payload: nestedPayload,
      format: undefined,
      urlSettings: { ...resolved.urlSettings, packIndex: index },
    };
    const nextRootInput = {
      ...rootInput,
      urlSettings: { ...rootInput.urlSettings, packIndex: index },
    };
    return parseResolvedRecursively(nested, rootPayload, options, nextRootInput);
  }

  if (!parsed.sourcePuzzle) throw new Error("SudokuPad payload did not resolve to a puzzle");
  const compatibility = createSudokuPadCompatibilityReport(SUDOKUPAD_COMPAT_TARGET_VERSION);
  for (const key of parsed.unsupportedFpuzzlesKeys ?? []) {
    addSudokuPadDiagnostic(compatibility, {
      severity: "warning",
      code: "unknown-fpuzzles-key",
      message: `Unsupported F-Puzzles key in pinned SudokuPad converter: ${key}`,
      path: key,
    });
  }

  const normalized = normalizeSudokuPadSourcePuzzle(parsed.sourcePuzzle, {
    compatibility,
    renderSettings: {
      ...resolved.urlSettings.render,
      experimentalMode: resolved.urlSettings.experimental,
      barbieMode: resolved.urlSettings.routeTheme === "barbie",
    },
  });
  const explicitFont = getSudokuPadPuzzleFont(resolved.urlSettings.puzzleFont)?.id;
  const legacyFont = getSudokuPadPuzzleFontIdFromLegacyIndex(resolved.urlSettings.digitFont);
  if (explicitFont ?? legacyFont) normalized.scene.renderSettings.puzzleFont = explicitFont ?? legacyFont;

  return {
    input: rootInput,
    sourcePayload: rootPayload,
    sourcePuzzle: parsed.sourcePuzzle,
    scene: normalized.scene,
    logic: normalized.logic,
    compatibility: normalized.compatibility,
    context: {
      sourceId: rootInput.sourceId,
      ...(rootInput.format ? { format: rootInput.format } : {}),
      urlSettings: rootInput.urlSettings,
    },
  };
}

/** Complete Phase-4 input entry point for stock SudokuPad formats. */
export async function loadSudokuPadPuzzle(input: string, options: LoadSudokuPadPuzzleOptions = {}): Promise<SudokuPadImportResult> {
  const resolved = await resolveSudokuPadInput(input, options);
  if (!resolved.payload) throw new Error("SudokuPad input could not be resolved");
  return parseResolvedRecursively(resolved, resolved.payload, options);
}

/** Parse a stored/fetched payload without treating an unprefixed legacy payload as a remote ID. */
export interface LoadResolvedSudokuPadPayloadOptions extends Omit<LoadSudokuPadPuzzleOptions, "resolvedPayload"> {
  /** Previously persisted import context; reapplies URL-only settings/pack selection during offline rehydration. */
  context?: SudokuPadImportContext;
}

export async function loadResolvedSudokuPadPayload(
  payload: string,
  options: LoadResolvedSudokuPadPayloadOptions = {},
): Promise<SudokuPadImportResult> {
  // Archived unprefixed payloads are raw API responses. Stock PuzzleLoader.fetchPuzzle
  // wraps those responses as SCL before parsePuzzleData; reproduce that boundary here.
  const canonicalPayload = !/^pack/.test(payload) && isRemoteSudokuPadPuzzleId(payload)
    ? `scl${compressPuzzleBase64(payload)}`
    : payload;
  const resolved = await resolveSudokuPadInput(canonicalPayload, { ...options, resolvedPayload: true });
  if (options.context) {
    resolved.sourceId = options.context.sourceId;
    resolved.format = options.context.format ?? resolved.format;
    resolved.urlSettings = options.context.urlSettings;
  }
  const recursiveOptions = {
    ...options,
    ...(options.context?.urlSettings.packIndex !== undefined ? { packIndex: options.context.urlSettings.packIndex } : {}),
  };
  return parseResolvedRecursively(resolved, payload, recursiveOptions);
}
