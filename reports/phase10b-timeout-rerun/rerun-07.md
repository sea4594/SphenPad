# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **8** — passed **5**, failed **3**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/jfrf3mHRbN` | FAIL | — | — | Archive file index 3286 |

Error for `archive:sudoku/jfrf3mHRbN`: `TimeoutError()`

| `archive:sudoku/m2TTpBPtg2` | PASS | True | 0.000000% | Archive file index 3302 |
| `archive:sudoku/m3GGq4Ht96` | PASS | True | 0.000000% | Archive file index 3305 |
| `archive:sudoku/m6JLP2B72M` | PASS | True | 0.000000% | Archive file index 3310 |
| `archive:sudoku/pM7jd2QbmD` | FAIL | — | — | Archive file index 3428 |

Error for `archive:sudoku/pM7jd2QbmD`: `TimeoutError()`

| `archive:sudoku/rFJd9mN82f` | PASS | True | 0.100091% | Archive file index 3512 |
| `archive:sudoku/rJDLMnH7LB` | PASS | True | 0.000000% | Archive file index 3514 |
| `archive:sudoku/tgQJNqqB6r` | FAIL | — | — | Archive file index 3590 |

Error for `archive:sudoku/tgQJNqqB6r`: `TimeoutError()`


## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
