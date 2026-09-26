import type { SudokuPadRenderSettings } from "./settings";

export const SUDOKUPAD_FORMAT_PREFIXES = ["scl", "ctc", "fpuz", "fpuzzles", "scf", "pack"] as const;

export type SudokuPadFormatPrefix = (typeof SUDOKUPAD_FORMAT_PREFIXES)[number];
export type SudokuPadCanonicalFormat = "scl" | "fpuz" | "scf" | "pack" | "unknown" | "remote";

export interface SudokuPadUrlSettings {
  raw: Record<string, boolean>;
  render: Partial<SudokuPadRenderSettings>;
  puzzleFont?: string;
  digitFont?: string;
  experimental: boolean;
  /** Path-driven stock presentation mode (currently only /barbie/). */
  routeTheme?: "barbie";
  packIndex?: number;
}

export interface ResolvedSudokuPadInput {
  originalInput: string;
  sourceId: string;
  payload?: string;
  format?: SudokuPadCanonicalFormat;
  urlSettings: SudokuPadUrlSettings;
}
