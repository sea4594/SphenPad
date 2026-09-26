# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **15**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/Ht3bdPRdGm` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/J3nbjRB8H8` | PASS | True | 0.007033% | Deterministic archive sample |
| `archive:sudoku/J8MMb74TPM` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/JGG2RDFhJq` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/JHnRqh93pr` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/JNB9hBhbFP` | PASS | True | 0.002164% | Deterministic archive sample |
| `archive:sudoku/JdR6PQFn3g` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/Jj2Tt9N8f3` | PASS | True | 0.004328% | Deterministic archive sample |
| `archive:sudoku/JpG66FjqPN` | PASS | True | 0.003898% | Deterministic archive sample |
| `archive:sudoku/L42nqPggLN` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/L7rG2F6JLM` | PASS | True | 0.004869% | Deterministic archive sample |
| `archive:sudoku/LFJg87q9gt` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/LLM2t7G4NG` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/LNjRFLdJ2r` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/LRBmTpdnb8` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
