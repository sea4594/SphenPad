# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **20** — passed **20**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/B4fMfpp3FG` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/BjQP3L8QFr` | PASS | True | 0.000807% | Deterministic archive sample |
| `archive:sudoku/DRMqF6t8td` | PASS | True | 0.002705% | Deterministic archive sample |
| `archive:sudoku/F339rtJT6q` | PASS | True | 0.004599% | Deterministic archive sample |
| `archive:sudoku/FQr78jpf86` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/G7QHB4G3M9` | PASS | True | 0.004058% | Deterministic archive sample |
| `archive:sudoku/GTdJRB7TPG` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/H8JHPgbjtj` | PASS | True | 0.005767% | Deterministic archive sample |
| `archive:sudoku/Ht3bdPRdGm` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/JNB9hBhbFP` | PASS | True | 0.002164% | Deterministic archive sample |
| `archive:sudoku/L7rG2F6JLM` | PASS | True | 0.004869% | Deterministic archive sample |
| `archive:sudoku/Lm4PT4Ht99` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/MNN7LtLL3G` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/N87266GQRD` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/NRqj3LMrLr` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/PLhnmLPH8b` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/QBTLGT3tNF` | PASS | True | 0.005951% | Deterministic archive sample |
| `archive:sudoku/QghGGpd2ht` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/RGLfL4BgJ2` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/T3tMM749d7` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
