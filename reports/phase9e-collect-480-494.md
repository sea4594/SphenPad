# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **14**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/hrHdD39Pqr` | PASS | True | 0.002804% | Deterministic archive sample |
| `archive:sudoku/j42NrmtQhP` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/j9BgfmMfjN` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/jHr9hRfm94` | PASS | True | 0.007574% | Deterministic archive sample |
| `archive:sudoku/jMnJTDq86t` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/jQdTf2Rtp2` | PASS | True | 0.004328% | Deterministic archive sample |
| `archive:sudoku/jfrf3mHRbN` | FAIL | — | — | Deterministic archive sample |

Error for `archive:sudoku/jfrf3mHRbN`: `TimeoutError()`

| `archive:sudoku/jq7Mq6qFTN` | PASS | True | 0.003246% | Deterministic archive sample |
| `archive:sudoku/jtgN8Hd7f6` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/m4MQ4pTN8b` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/m7Grm47T9H` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/mD6BhP3PdT` | PASS | True | 0.009739% | Deterministic archive sample |
| `archive:sudoku/mHBPJmM8fB` | PASS | True | 0.008657% | Deterministic archive sample |
| `archive:sudoku/mJqT6RDG2L` | PASS | True | 0.003787% | Deterministic archive sample |
| `archive:sudoku/mP3tjTNhmF` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
