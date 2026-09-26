# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **15**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/QTJhB83Bfh` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/Qd3HHTrB94` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/QghGGpd2ht` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/QmmLfpNBtm` | PASS | True | 0.009301% | Deterministic archive sample |
| `archive:sudoku/QpMDNMDFQq` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/R3rTGMB6BT` | PASS | True | 0.004328% | Deterministic archive sample |
| `archive:sudoku/R9Mb877pqm` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/RGLfL4BgJ2` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/RM396Mnt7m` | PASS | True | 0.007574% | Deterministic archive sample |
| `archive:sudoku/RQQjRj3RPG` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/RfjqGgLRht` | PASS | True | 0.002164% | Deterministic archive sample |
| `archive:sudoku/RmmfTLFJqB` | PASS | True | 0.008123% | Deterministic archive sample |
| `archive:sudoku/Rr7p8BNH7R` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/T3tMM749d7` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/TBdjr7BB4J` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
