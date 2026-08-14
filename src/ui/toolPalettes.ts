export const highlightPalettePages = [
  ["#3d9462", "#406ca6", "#9d5bc7", "#57d38c", "#63a6ff", "#ff8fc3", "#ffe066", "#ffae57", "#ff5f57"],
  ["#63a6ff", "#ff5f57", "#57d38c", "#bfe0ff", "#ffc2bf", "#c7f5d7", "#d9d9d9", "#9b9b9b", "#4f4f4f"],
] as const;

const canonicalHighlightColors = [
  "#ffae57", // orange
  "#ff5f57", // red
  "#3d9462", // dark green
  "#57d38c", // green
  "#c7f5d7", // light green
  "#d9d9d9", // light gray
  "#9b9b9b", // medium gray
  "#4f4f4f", // dark gray
  "#ffc2bf", // light red
  "#ff8fc3", // pink
  "#9d5bc7", // purple
  "#406ca6", // dark blue
  "#63a6ff", // blue
  "#bfe0ff", // light blue
  "#ffe066", // yellow
  "rgba(0,0,0,0)", // white / clear
] as const;

const highlightColorRank: ReadonlyMap<string, number> = new Map(canonicalHighlightColors.map((color, index) => [color, index]));

export function sortHighlightColors(colors: readonly string[]): string[] {
  return colors
    .map((color, index) => ({ color, index, rank: highlightColorRank.get(color.trim().toLowerCase()) ?? 100 }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ color }) => color);
}

export const linePalette = ["#57d38c", "#ff8fc3", "#ffae57", "#ff5f57", "#ffe066", "#63a6ff", "#d9d9d9", "#9b9b9b", "#000000"] as const;
