export interface SudokuPadPuzzleFontDefinition {
  id: string;
  name: string;
  path: string;
  x?: number;
  y?: number;
  scale?: number;
}

/** Exact custom digit-font registry from SudokuPad 0.612.0. */
export const SUDOKUPAD_PUZZLE_FONTS: readonly SudokuPadPuzzleFontDefinition[] = [
  { id: "baublemonogram", name: "Bauble Monogram", path: "/assets/fonts/Bauble_Monogram.ttf", y: -10, scale: 1.2 },
  { id: "bonnet", name: "Bonnet", path: "/assets/fonts/Bonnet__.ttf", y: 5, scale: 1.2 },
  { id: "cartoonblocks", name: "Cartoon Blocks", path: "/assets/fonts/CartoonBlocksChristmas-Regular.ttf", scale: 1.3 },
  { id: "dickensianchristmas", name: "Dickensian Christmas", path: "/assets/fonts/DickensianChristmas.ttf", y: -3 },
  { id: "firstsnow", name: "First Snow", path: "/assets/fonts/Firstsnow-nRYmg.ttf", scale: 1.5 },
  { id: "christmastinsel", name: "Christmas Tinsel", path: "/assets/fonts/PWChristmasTinsel.ttf", y: -5, scale: 1.25 },
  { id: "christmasfont", name: "Christmas Font", path: "/assets/fonts/PWChristmasfont.ttf", y: -5 },
  { id: "happychristmas", name: "Happy Christmas", path: "/assets/fonts/PWHappyChristmas.ttf", y: -5, scale: 1.1 },
  { id: "rudolph", name: "Rudolph", path: "/assets/fonts/Rudolph.otf", scale: 1.2 },
  { id: "snowballs", name: "Snowballs", path: "/assets/fonts/Snowballs.ttf", y: -5, scale: 1.4 },
  { id: "stnichols", name: "St. Nichols", path: "/assets/fonts/stnicholas.ttf", y: 5, scale: 1.1 },
  { id: "xtree", name: "X-Tree", path: "/assets/fonts/XTREE.TTF", y: 10, scale: 1.2 },
  { id: "sevensegment", name: "Seven Segment", path: "/assets/fonts/SevenSegment.ttf", y: 5, scale: 1.1 },
] as const;

export function getSudokuPadPuzzleFont(id: string | undefined): SudokuPadPuzzleFontDefinition | undefined {
  return id ? SUDOKUPAD_PUZZLE_FONTS.find((font) => font.id === id) : undefined;
}

/** Legacy `digitfont=N` is an array index into FontDefs in stock SudokuPad. */
export function getSudokuPadPuzzleFontIdFromLegacyIndex(index: string | number | undefined): string | undefined {
  if (index === undefined || index === null || index === "") return undefined;
  const key = String(index);
  if (!/^(0|[1-9][0-9]*)$/.test(key)) return undefined;
  const value = Number(key);
  return Number.isInteger(value) ? SUDOKUPAD_PUZZLE_FONTS[value]?.id : undefined;
}
