import type { SudokuPadMetadata, SudokuPadSourceGraphic } from "../types/source";

const OPAQUE_COLORS = ["#000000", "#CFCFCF", "#FFFFFF", "none"];
const RE_LEGACY_SOURCE = /^Sudoku Maker pre-version$/;
const cssColorHasAlpha = (color: unknown): boolean => /^\s*(#....(....)?|rgba|transparent)\s*$/.test(String(color));

export function shouldUseLegacyOpacity(color: unknown, metadata: SudokuPadMetadata): boolean {
  const forceOpaque = OPAQUE_COLORS.includes(String(color));
  const isLegacy = RE_LEGACY_SOURCE.test(String(metadata.source ?? ""));
  const hasAlpha = cssColorHasAlpha(color);
  return !(forceOpaque || (!isLegacy && hasAlpha));
}

export function applyLegacyOpacity<T extends SudokuPadSourceGraphic>(graphic: T, metadata: SudokuPadMetadata): T {
  if (shouldUseLegacyOpacity(graphic.backgroundColor, metadata)) {
    const mutable = graphic as SudokuPadSourceGraphic;
    mutable["fill-opacity"] = 0.5;
    mutable["stroke-opacity"] = 0.5;
  }
  return graphic;
}
