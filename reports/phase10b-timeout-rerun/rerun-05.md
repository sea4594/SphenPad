# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **8** — passed **5**, failed **3**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:p6s6me7gcf` | PASS | True | 0.000000% | Archive file index 1647 |
| `archive:p8ushghwpc` | FAIL | — | — | Archive file index 1650 |

Error for `archive:p8ushghwpc`: `TimeoutError()`

| `archive:rpdtjt36r7` | FAIL | — | — | Archive file index 1809 |

Error for `archive:rpdtjt36r7`: `TimeoutError()`

| `archive:sudoku/7Qt3HNR2Pj` | PASS | True | 0.000000% | Archive file index 2117 |
| `archive:sudoku/944Mg3fnJH` | FAIL | — | — | Archive file index 2204 |

Error for `archive:sudoku/944Mg3fnJH`: `TimeoutError()`

| `archive:sudoku/D7fqF9rbgg` | PASS | True | 0.000000% | Archive file index 2314 |
| `archive:sudoku/DrDLbHmj6h` | PASS | True | 0.000000% | Archive file index 2355 |
| `archive:sudoku/LNj2JRDpq6` | PASS | True | 0.000000% | Archive file index 2622 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
