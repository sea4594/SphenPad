# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `synthetic`

Fixtures: **11** — passed **11**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `captured-real` | PASS | True | 0.000000% | Exact puzzle captured in the HAR |
| `primitives-outside` | PASS | True | 0.038236% | Lines, raw path, arrows, rounded/rotated graphics, multiline/outside text, marks, killer cage |
| `recognized-features` | PASS | True | 0.007234% | Kropki/XV/palindrome/Sudoku-X recognition |
| `labels-compact-marks` | PASS | True | 0.000000% | FeatureRowColLabels + FeatureCompactMarks |
| `dark-grid-settings` | PASS | True | 0.000000% | CSS-heavy visual settings |
| `arrows-above-lines` | PASS | True | 0.000000% | Same-layer insertion order |
| `barbie-route` | PASS | True | 0.000000% | feature-customcolors /barbie/ rendering |
| `fog-static` | PASS | True | 0.000000% | Final/static fog mask geometry |
| `emoji` | PASS | None | 0.159144% | Twemoji replacement; coordinates are viewport/board-scale dependent in stock, so validate by raster |
| `external-background` | PASS | True | 0.000000% | Metadata external asset loading |
| `sudorkle-final` | PASS | True | 0.000000% | Final post-flip Sudorkle state; animation markup ignored structurally |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
