# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **15**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/dM9JP4TgGR` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/dQdgL4pRt9` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/dgj3Gj84Qh` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/dmQ8MHm29g` | PASS | True | 0.000433% | Deterministic archive sample |
| `archive:sudoku/dqb9NQbrj7` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/f382RtF2Rd` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/f7hr9rq96H` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/fBR7n3H4Dg` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/fJnrmHf8QT` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/fQLnmjdF6T` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/fbqQB8jrhn` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/fm92h9Dn93` | PASS | True | 0.004673% | Deterministic archive sample |
| `archive:sudoku/frjRNFMDjB` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/g2NBLTF6h8` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/g8JDR3TR6p` | PASS | True | 0.033779% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
