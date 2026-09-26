# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `fpuzzles`

Fixtures: **4** — passed **2**, failed **2**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `fpuz-historical-monopoly` | PASS | True | 0.000000% | Converted F-Puzzles input still receives stock hard-coded MONOPOLYSUDOKU background |
| `fpuz-experimental-tmmb` | PASS | True | 0.000000% | Converted F-Puzzles input gets experimental TmMBJj8jbr background and stock thermo hiding |
| `fpuz-font-explicit` | FAIL | True | 0.000000% | Converted F-Puzzles input carries explicit puzzlefont setting; binary font bytes are Phase 10 |
| `fpuz-font-legacy-dark` | FAIL | True | 0.000000% | Converted F-Puzzles input maps legacy digitfont=12 to sevensegment and combines with dark mode |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
