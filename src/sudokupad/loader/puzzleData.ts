import { fixPuzzleSlashes, saveDecodeURIComponent, saveDecompressPuzzle } from "../codecs/base64Puzzle";
import { saveJsonUnzip } from "../codecs/puzzleZipper";
import { decodeScfPayload } from "../codecs/scf";
import { decodeFpuzzlesPayload } from "../fpuzzles/codec";
import { importFpuzzlesPuzzle } from "../fpuzzles/import";
import type { SudokuPadSourcePuzzle } from "../types/source";
import { getSudokuPadFormat, stripSudokuPadFormat } from "./formatRegistry";

export interface ParsedSudokuPadPayload {
  sourcePuzzle?: SudokuPadSourcePuzzle;
  packData?: unknown;
  format: "scl" | "fpuz" | "scf" | "pack" | "unknown";
  unsupportedFpuzzlesKeys?: string[];
}

/** Matches PuzzleLoader.decompressPuzzleId. */
export function decompressSudokuPadPuzzleId(payload: string): string {
  let value = stripSudokuPadFormat(payload);
  value = saveDecodeURIComponent(value);
  value = fixPuzzleSlashes(value) ?? value;
  return saveDecompressPuzzle(value);
}

function requireSourcePuzzle(value: unknown, label: string): SudokuPadSourcePuzzle {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${label} puzzle payload`);
  return value as SudokuPadSourcePuzzle;
}

/** Parse an already-resolved payload. Unlike input resolution, unprefixed data uses PuzzleLoader's unknown-format fallback. */
export function parseResolvedSudokuPadPayload(payload: string): ParsedSudokuPadPayload {
  const format = getSudokuPadFormat(payload);
  if (format === "scl") {
    return { format: "scl", sourcePuzzle: requireSourcePuzzle(saveJsonUnzip(decompressSudokuPadPuzzleId(payload)), "SCL/CTC") };
  }
  if (format === "fpuz") {
    const fpuzzle = decodeFpuzzlesPayload(payload);
    const imported = importFpuzzlesPuzzle(fpuzzle);
    return { format: "fpuz", sourcePuzzle: imported.puzzle, unsupportedFpuzzlesKeys: imported.unsupportedKeys };
  }
  if (format === "scf") {
    const decoded = decompressSudokuPadPuzzleId(payload);
    return { format: "scf", sourcePuzzle: decodeScfPayload(decoded) };
  }
  if (format === "pack") {
    const decoded = decompressSudokuPadPuzzleId(payload);
    return { format: "pack", packData: JSON.parse(decoded) as unknown };
  }

  // PuzzleLoader.parsePuzzleUnknown -> saveJsonUnzip(decompressPuzzleId(payload)).
  return { format: "unknown", sourcePuzzle: requireSourcePuzzle(saveJsonUnzip(decompressSudokuPadPuzzleId(payload)), "legacy/unknown") };
}
