import { decompressPuzzleBase64, fixPuzzleSlashes, saveDecodeURIComponent } from "../codecs/base64Puzzle";
import { saveJsonUnzip } from "../codecs/puzzleZipper";
import type { FpuzzlesPuzzle } from "./types";

export const FPUZZLES_PREFIX_RE = /^(fpuz(?:zles)?)([\s\S]*)/m;

export function stripFpuzzlesPrefix(value: string): string {
  return value.replace(FPUZZLES_PREFIX_RE, "$2");
}

export function decodeFpuzzlesPayload(payload: string): FpuzzlesPuzzle {
  let encoded = stripFpuzzlesPrefix(payload);
  encoded = saveDecodeURIComponent(encoded);
  encoded = fixPuzzleSlashes(encoded) ?? encoded;
  const decompressed = decompressPuzzleBase64(encoded) ?? encoded;
  const decoded = saveJsonUnzip(decompressed);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error("Invalid F-Puzzles payload");
  }
  return decoded as FpuzzlesPuzzle;
}
