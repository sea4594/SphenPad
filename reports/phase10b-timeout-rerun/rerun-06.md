# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **8** — passed **5**, failed **3**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/LTMQhdn3b7` | PASS | True | 0.000000% | Archive file index 2632 |
| `archive:sudoku/LTdPqqtpFq` | PASS | True | 0.000000% | Archive file index 2633 |
| `archive:sudoku/MHHnf7PDDQ` | PASS | True | 0.005951% | Archive file index 2669 |
| `archive:sudoku/NGbgngNgnd` | PASS | True | 0.000807% | Archive file index 2733 |
| `archive:sudoku/Nmg943btqh` | FAIL | — | — | Archive file index 2759 |

Error for `archive:sudoku/Nmg943btqh`: `TimeoutError()`

| `archive:sudoku/Pm8N43nTMG` | FAIL | — | — | Archive file index 2804 |

Error for `archive:sudoku/Pm8N43nTMG`: `TimeoutError()`

| `archive:sudoku/g8nbdG8674` | PASS | True | 0.014067% | Archive file index 3139 |
| `archive:sudoku/jMQR24JRBN` | FAIL | — | — | Archive file index 3271 |

Error for `archive:sudoku/jMQR24JRBN`: `TimeoutError()`


## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
