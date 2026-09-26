import { compressPuzzleBase64 } from "../codecs/base64Puzzle";
import { zipPuzzleJson } from "../codecs/puzzleZipper";
import { isRemoteSudokuPadPuzzleId } from "./formatRegistry";

export interface SudokuPadFetchOptions {
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  urls?: (puzzleId: string) => string[];
}

const cache = new Map<string, string>();

export function clearSudokuPadFetchCache(puzzleId?: string): void {
  if (puzzleId) cache.delete(puzzleId);
  else cache.clear();
}

export function apiEncodePuzzleId(puzzleId: string): string {
  return puzzleId.split("/").map(encodeURIComponent).join("/");
}

export const apiPuzzleUrlLocal = (puzzleId: string): string => `/api/puzzle/${apiEncodePuzzleId(puzzleId)}`;
export const apiPuzzleUrlLegacyProxy = (puzzleId: string): string => `https://sudokupad.svencodes.com/ctclegacy/${encodeURIComponent(puzzleId)}`;
export const apiPuzzleUrlLegacy = (puzzleId: string): string => `https://firebasestorage.googleapis.com/v0/b/sudoku-sandbox.appspot.com/o/${encodeURIComponent(puzzleId)}?alt=media`;
export const apiPuzzleUrls = (puzzleId: string): string[] => [apiPuzzleUrlLocal(puzzleId), apiPuzzleUrlLegacyProxy(puzzleId), apiPuzzleUrlLegacy(puzzleId)];

async function fetchTextWithTimeout(fetchFn: typeof fetch, url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} while fetching SudokuPad puzzle`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/** Port of PuzzleLoader.fetchPuzzle for stock SudokuPad payload fetching. */
export async function fetchSudokuPadPuzzlePayload(puzzleId: string, options: SudokuPadFetchOptions = {}): Promise<string> {
  if (!isRemoteSudokuPadPuzzleId(puzzleId)) return puzzleId;
  const cached = cache.get(puzzleId);
  if (cached !== undefined) return cached;

  const fetchFn = options.fetchFn ?? globalThis.fetch;
  if (!fetchFn) throw new Error("No fetch implementation available for SudokuPad remote puzzle");
  const timeoutMs = options.timeoutMs ?? 10_000;
  let lastError: unknown;
  const urls = options.urls?.(puzzleId) ?? apiPuzzleUrls(puzzleId);

  for (const url of urls) {
    try {
      let puzzle = await fetchTextWithTimeout(fetchFn, url, timeoutMs);
      if (url.includes("firebasestorage")) puzzle = zipPuzzleJson(puzzle);
      if (!/^pack/.test(puzzle) && isRemoteSudokuPadPuzzleId(puzzle)) {
        puzzle = `scl${compressPuzzleBase64(puzzle)}`;
      }
      cache.set(puzzleId, puzzle);
      return puzzle;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Unable to fetch SudokuPad puzzle ${puzzleId}`);
}
