import type { SudokuPadCanonicalFormat } from "../types/formats";

export interface SudokuPadFormatInfo {
  prefix: Exclude<SudokuPadCanonicalFormat, "remote" | "unknown">;
  aliases?: string[];
  reAlias: RegExp;
}

function createAliasRegex(prefix: string, aliases: string[] = []): RegExp {
  const all = [...new Set([prefix, ...aliases])].sort((a, b) => b.length - a.length);
  return new RegExp(`^(${all.join("|")})([\\s\\S]*)`, "m");
}

export const SUDOKUPAD_FORMATS: SudokuPadFormatInfo[] = [
  { prefix: "scl", aliases: ["ctc"], reAlias: createAliasRegex("scl", ["ctc"]) },
  { prefix: "fpuz", aliases: ["fpuzzles"], reAlias: createAliasRegex("fpuz", ["fpuzzles"]) },
  { prefix: "scf", reAlias: createAliasRegex("scf") },
  { prefix: "pack", reAlias: createAliasRegex("pack") },
];

export function getSudokuPadFormatInfo(value = ""): SudokuPadFormatInfo | undefined {
  return SUDOKUPAD_FORMATS.find((format) => format.reAlias.test(value));
}

export function getSudokuPadFormat(value = ""): SudokuPadCanonicalFormat | "" {
  return getSudokuPadFormatInfo(value)?.prefix ?? "";
}

export function stripSudokuPadFormat(value: string): string {
  const format = getSudokuPadFormatInfo(value);
  return format ? (value.match(format.reAlias)?.[2] ?? value) : value;
}

export function splitSudokuPadFormat(value: string): [SudokuPadCanonicalFormat | "", string] {
  const format = getSudokuPadFormatInfo(value);
  return format ? [format.prefix, value.match(format.reAlias)?.[2] ?? value] : ["", value];
}

export function isRemoteSudokuPadPuzzleId(value: string): boolean {
  return getSudokuPadFormatInfo(value) === undefined;
}
