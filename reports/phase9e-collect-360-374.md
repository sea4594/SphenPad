# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **15**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/G7QHB4G3M9` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/GBJJMBBdfD` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/GGHBGH8G9g` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/GLQDDLDDbT` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/GPDqrrQDG7` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/GTdJRB7TPG` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/GhF7nmRB8J` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/GjnL983hGT` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/Gq7rqdb22G` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/H3Jt9J2fdg` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/H8JHPgbjtj` | PASS | True | 0.005516% | Deterministic archive sample |
| `archive:sudoku/HB3RHhhRJF` | PASS | True | 0.003246% | Deterministic archive sample |
| `archive:sudoku/HP83P4q2Pr` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/Hb4Tb8tgRQ` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/HjmmTp4M6t` | PASS | True | 0.005951% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
