# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `progress`

Fixtures: **8** — passed **8**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `progress-conflict-errors` | PASS | None | — | Preserve SphenPad conflict-checker overlays through the production progress adapter |
| `progress-conflict-errors-disabled` | PASS | None | — | Preserve SphenPad conflict-checker setting when disabled |
| `progress-sudorkle-complete` | PASS | True | 0.000000% | Production completion status creates stock final Sudorkle overlay |
| `progress-sphenpad-highlight-wedges` | PASS | None | — | Preserve SphenPad multi-highlight palette through native SVG renderer |
| `progress-sphenpad-single-line` | PASS | None | — | Preserve SphenPad center-line tool |
| `progress-sphenpad-double-line` | PASS | None | — | Preserve SphenPad double-line behavior |
| `progress-sphenpad-edge-line` | PASS | None | — | Preserve SphenPad edge-line tool |
| `progress-sphenpad-line-marks` | PASS | None | — | Preserve SphenPad center/edge line marks |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
