import type { SudokuPadSourcePuzzle } from "../types/source";
import { fixPuzzleSlashes, saveDecodeURIComponent, saveDecompressPuzzle } from "./base64Puzzle";
import { saveJsonUnzip } from "./puzzleZipper";

const SCL_PREFIX = /^(scl|ctc)([\s\S]*)$/m;

export function isSclPayload(value: string): boolean {
  return SCL_PREFIX.test(value);
}

export function stripSclPrefix(value: string): string {
  const match = value.match(SCL_PREFIX);
  return match ? match[2] : value;
}

/** Mirrors PuzzleLoader.decompressPuzzleId for native SCL/CTC input. */
export function decompressSclPayload(value: string): string {
  let payload = stripSclPrefix(value);
  payload = saveDecodeURIComponent(payload);
  payload = fixPuzzleSlashes(payload) ?? payload;
  return saveDecompressPuzzle(payload);
}

function isSourcePuzzle(value: unknown): value is SudokuPadSourcePuzzle {
  return !!value && typeof value === "object" && Array.isArray((value as { cells?: unknown }).cells);
}

export function parseSclPayload(value: string): SudokuPadSourcePuzzle {
  const decoded = saveJsonUnzip(decompressSclPayload(value));
  if (!isSourcePuzzle(decoded)) {
    throw new Error("SCL/CTC payload did not decode to a SudokuPad puzzle with a cells array");
  }
  return decoded;
}
