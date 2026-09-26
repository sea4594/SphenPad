# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **15**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/397PdfPq6D` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/3D4p249g4g` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/3GD4Fp9RGr` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/3JqbBfpJHp` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/3QPdQd6Grn` | PASS | True | 0.038954% | Deterministic archive sample |
| `archive:sudoku/3bJgQPpDdj` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/3gJJ7JJpGH` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/3n247BmLHF` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/3rndTLBfqr` | PASS | True | 0.003787% | Deterministic archive sample |
| `archive:sudoku/48bg9rh8jm` | PASS | True | 0.007574% | Deterministic archive sample |
| `archive:sudoku/4DMg6BDj7q` | PASS | True | 0.005650% | Deterministic archive sample |
| `archive:sudoku/4JT3tBgh32` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/4N3ThH99qg` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/4bPt8LRpRb` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/4hGmbgHm4d` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
