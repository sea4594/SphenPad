import type { SudokuPadUrlSettings } from "../types/formats";
import type { SudokuPadRenderSettings } from "../types/settings";

const RENDER_SETTING_MAP: Record<string, keyof SudokuPadRenderSettings> = {
  darkmode: "darkMode",
  largedigits: "largeDigits",
  altmarks: "alternateMarks",
  hidecolours: "hideColours",
  dashedgrid: "dashedGrid",
  nogrid: "noGrid",
  outlinesondigits: "outlineDigits",
  outlinesonlines: "outlineLines",
  arrowsabovelines: "arrowsAboveLines",
  hidebgimage: "hideBackgroundImage",
  disableemoji: "disableEmoji",
  labelrowscols: "labelRowsCols",
  compactmarks: "compactMarks",
};

function querySettingValue(value: string): boolean {
  return ["true", "t", "1", ""].includes(value.toLowerCase());
}

export function parseSudokuPadUrlSettings(url: URL): SudokuPadUrlSettings {
  const raw: Record<string, boolean> = {};
  const render: Partial<SudokuPadRenderSettings> = {};
  for (const [key, value] of url.searchParams) {
    if (!key.startsWith("setting-")) continue;
    const settingName = key.replace(/^setting-/, "").replace(/(colo)r/i, "$1ur");
    const parsed = querySettingValue(value);
    raw[settingName] = parsed;
    const renderKey = RENDER_SETTING_MAP[settingName];
    if (renderKey) (render as Record<string, unknown>)[renderKey] = parsed;
  }
  const hashMatch = url.hash.match(/#puzzle([0-9]+)/);
  return {
    raw,
    render,
    ...(url.searchParams.get("puzzlefont") ? { puzzleFont: url.searchParams.get("puzzlefont")! } : {}),
    ...(url.searchParams.get("digitfont") ? { digitFont: url.searchParams.get("digitfont")! } : {}),
    experimental: url.hash.includes("experimental"),
    ...(url.pathname.match(/^\/barbie\//) ? { routeTheme: "barbie" as const } : {}),
    ...(hashMatch ? { packIndex: Number.parseInt(hashMatch[1], 10) || 0 } : {}),
  };
}

export function emptySudokuPadUrlSettings(): SudokuPadUrlSettings {
  return { raw: {}, render: {}, experimental: false };
}
