# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **14**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/mfL29d7tG7` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/mmmDpTPHhp` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/mq9fhhbHFq` | PASS | True | 0.002324% | Deterministic archive sample |
| `archive:sudoku/n4LPm2h3fD` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/nB66jBP6JG` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/nHhdmbMtRp` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/nPNp4LMHGQ` | PASS | True | 0.006492% | Deterministic archive sample |
| `archive:sudoku/nbDJmrBbH8` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/nnDBmprdLN` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/p3Nm96MDBp` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/p7T9dHPbR9` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/pB49nQ7qFf` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/pM7jd2QbmD` | FAIL | — | — | Deterministic archive sample |

Error for `archive:sudoku/pM7jd2QbmD`: `TimeoutError()`

| `archive:sudoku/pf8979mT6F` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/ppTdQNN23n` | PASS | True | 0.002705% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
