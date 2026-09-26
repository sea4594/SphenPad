export type StockFeatureParityCategory =
  | "authored-render"
  | "input"
  | "optional-svg-setting"
  | "gameplay-overlay"
  | "app-ui"
  | "tooling"
  | "unbounded-plugin";

export interface StockFeatureParityEntry {
  file: string;
  feature: string;
  category: StockFeatureParityCategory;
  affectsAuthoredPuzzleSvg: boolean;
  implemented: boolean;
  note: string;
}

/**
 * Audited against every feature-*.js loaded by the captured SudokuPad 0.612.0 build.
 * “implemented” means SphenPad either reproduces puzzle-SVG behavior or the feature
 * was verified to be outside the authored-puzzle rendering contract.
 */
export const STOCK_FEATURE_PARITY: readonly StockFeatureParityEntry[] = [
  { file: "feature-conflictchecker.js", feature: "conflictchecker", category: "gameplay-overlay", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Gameplay error highlighting; SphenPad has separate live conflict logic." },
  { file: "feature-marksolveddigits.js", feature: "marksolveddigits", category: "app-ui", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Keypad/control styling only." },
  { file: "feature-showseencells.js", feature: "showseencells", category: "gameplay-overlay", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Selection-dependent optional highlight; not authored puzzle content." },
  { file: "feature-labelrowscols.js", feature: "labelrowscols", category: "optional-svg-setting", affectsAuthoredPuzzleSvg: true, implemented: true, note: "Exact post-overlay row/column label layer and geometry implemented." },
  { file: "feature-fog.js", feature: "fog", category: "authored-render", affectsAuthoredPuzzleSvg: true, implemented: true, note: "Fog source normalization, clue hiding, trigger links and SVG masks implemented." },
  { file: "feature-bgimage.js", feature: "bgimage", category: "authored-render", affectsAuthoredPuzzleSvg: true, implemented: true, note: "Metadata background image, opacity/target, GIF first-frame behavior and asset loading implemented." },
  { file: "feature-fpuz.js", feature: "fpuztool", category: "tooling", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Export/open-in-F-Puzzles tool only; F-Puzzles import itself is implemented in the stock input pipeline." },
  { file: "feature-gifting.js", feature: "gifting", category: "app-ui", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Gift dialog/message UI only." },
  { file: "feature-compactmarks.js", feature: "compactmarks", category: "optional-svg-setting", affectsAuthoredPuzzleSvg: true, implemented: true, note: "Exact 5+-digit candidate range compaction implemented." },
  { file: "feature-puzzleevents.js", feature: "puzzleevents", category: "gameplay-overlay", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Transient confetti/snow/easter-egg effects outside authored board rendering." },
  { file: "feature-replaygif.js", feature: "replaygif", category: "tooling", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Replay export tool only." },
  { file: "feature-replaysave.js", feature: "replaysave", category: "tooling", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Replay file export/import UI only." },
  { file: "feature-uitheme.js", feature: "uitheme", category: "app-ui", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Application chrome theme variables; does not modify puzzle SVG primitives." },
  { file: "feature-cellpaste.js", feature: "cellpaste", category: "tooling", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Input/clipboard behavior only." },
  { file: "feature-settingssave.js", feature: "settingssave", category: "tooling", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Settings persistence only." },
  { file: "feature-solvedcounter.js", feature: "solvedcounter", category: "app-ui", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Solved counter UI only." },
  { file: "feature-debug.js", feature: "debug", category: "tooling", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Developer/debug overlays intentionally outside puzzle compatibility." },
  { file: "feature-shorturl.js", feature: "shorturl", category: "tooling", affectsAuthoredPuzzleSvg: false, implemented: true, note: "URL generation UI only." },
  { file: "feature-customcolors.js", feature: "customcolors", category: "optional-svg-setting", affectsAuthoredPuzzleSvg: true, implemented: true, note: "Stock /barbie/... path pink grid/givens styling implemented." },
  { file: "feature-endless.js", feature: "endless", category: "app-ui", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Puzzle-flow/UI mode only." },
  { file: "feature-emoji.js", feature: "emoji", category: "authored-render", affectsAuthoredPuzzleSvg: true, implemented: true, note: "Twemoji SVG replacement and stock unsupported-arrow substitutions implemented." },
  { file: "feature-rulealert.js", feature: "rulealert", category: "app-ui", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Rule dialog alert UI only." },
  { file: "feature-streamtool.js", feature: "streamtool", category: "tooling", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Broadcast/stream effects and cursors are external presentation tooling." },
  { file: "feature-screenshot.js", feature: "screenshot", category: "tooling", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Screenshot/export tool only." },
  { file: "feature-puzzlepack.js", feature: "puzzlepack", category: "input", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Pack decoding/selection implemented in the unified input layer." },
  { file: "feature-userplugins.js", feature: "userplugins", category: "unbounded-plugin", affectsAuthoredPuzzleSvg: true, implemented: false, note: "Arbitrary user JavaScript/CSS is intentionally outside finite stock puzzle-payload compatibility." },
  { file: "feature-seasonal.js", feature: "seasonal", category: "app-ui", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Seasonal application chrome/effects only." },
  { file: "feature-sudokupadpro.js", feature: "sudokupadpro", category: "app-ui", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Test/pro application UI behavior only." },
  { file: "feature-hairgag.js", feature: "hairgag", category: "app-ui", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Application gag/UI only." },
  { file: "feature-largepuzzle.js", feature: "largepuzzle", category: "app-ui", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Board zoom/pan/layout only; it does not change SVG scene content." },
  { file: "feature-layout.js", feature: "layout", category: "app-ui", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Application layout/controls sizing only." },
  { file: "feature-gridrules.js", feature: "gridrules", category: "app-ui", affectsAuthoredPuzzleSvg: false, implemented: true, note: "metadata.grids drives rules-panel text only; metadata remains preserved." },
  { file: "feature-markup.js", feature: "markup", category: "app-ui", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Rules/markup UI behavior only." },
  { file: "feature-copycells.js", feature: "copycells", category: "tooling", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Clipboard tool only." },
  { file: "feature-project9x9.js", feature: "project9x9", category: "app-ui", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Special controls/layout profile; does not alter authored SVG geometry." },
  { file: "feature-puzzlefont.js", feature: "puzzlefont", category: "authored-render", affectsAuthoredPuzzleSvg: true, implemented: true, note: "All 13 captured font definitions, legacy index mapping, offsets and scales implemented." },
  { file: "feature-aiassistant.js", feature: "aiassistant", category: "app-ui", affectsAuthoredPuzzleSvg: false, implemented: true, note: "Assistant/UI integration only." },
] as const;

export function stockFeatureParityFailures(): readonly StockFeatureParityEntry[] {
  return STOCK_FEATURE_PARITY.filter((entry) => entry.affectsAuthoredPuzzleSvg && !entry.implemented && entry.category !== "unbounded-plugin");
}
