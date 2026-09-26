# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **15**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/9ThTbRRRt9` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/9jJDgBpLjN` | PASS | True | 0.004869% | Deterministic archive sample |
| `archive:sudoku/9mgQ9LgnDj` | PASS | True | 0.007033% | Deterministic archive sample |
| `archive:sudoku/B2NJqj7HrL` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/B4fMfpp3FG` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/BB37qrbDqq` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/BJRQ4DnFp3` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/BPb9d9bbG7` | PASS | True | 0.001082% | Deterministic archive sample |
| `archive:sudoku/BdG6DPp6pL` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/BjQP3L8QFr` | PASS | True | 0.000807% | Deterministic archive sample |
| `archive:sudoku/BpJ3Jgd82T` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/D2hGJbfh3J` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/D6NT6LHTHP` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/DGjdPjDn9P` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/DMdfdnRGDf` | PASS | True | 0.011851% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
