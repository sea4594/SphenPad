# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **14**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/7gbg37R9fj` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/7pLTpF6tpP` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/83RBg4Qh4m` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/88mBm8N4JN` | PASS | True | 0.003246% | Deterministic archive sample |
| `archive:sudoku/8DgD33JtBt` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/8JhRLBh8bt` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/8P6Qq6QRpj` | PASS | True | 0.009198% | Deterministic archive sample |
| `archive:sudoku/8bDR7nBJft` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/8hJDqhbFRQ` | PASS | True | 0.008657% | Deterministic archive sample |
| `archive:sudoku/8njQg7GTd7` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/8qnQn36NNq` | PASS | True | 0.001082% | Deterministic archive sample |
| `archive:sudoku/944Mg3fnJH` | FAIL | — | — | Deterministic archive sample |

Error for `archive:sudoku/944Mg3fnJH`: `TimeoutError()`

| `archive:sudoku/99TDP9D7B2` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/9GB9bhd2hF` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/9NBn32M3gb` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
