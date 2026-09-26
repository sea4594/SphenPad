# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **14**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/NJgTqnNp9j` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/NRqj3LMrLr` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/NfPFf8BFnd` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/Nmg943btqh` | FAIL | — | — | Deterministic archive sample |

Error for `archive:sudoku/Nmg943btqh`: `TimeoutError()`

| `archive:sudoku/P2MgjGj6JF` | PASS | True | 0.005112% | Deterministic archive sample |
| `archive:sudoku/P6phpMtQfN` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/PB7bNLRffQ` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/PLhnmLPH8b` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/PR79NF7R4g` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/Pf6t9T8b6J` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/PnBnQfpPfR` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/PtLN7jLHBm` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/QBTLGT3tNF` | PASS | True | 0.005951% | Deterministic archive sample |
| `archive:sudoku/QJ9LLGfqDN` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/QNqH98Dg2L` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
