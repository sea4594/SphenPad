# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **20** — passed **20**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/Tgb6g6rPR7` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/bHjLRDRG48` | PASS | True | 0.005951% | Deterministic archive sample |
| `archive:sudoku/d2LgFB96QP` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/dmQ8MHm29g` | PASS | True | 0.000433% | Deterministic archive sample |
| `archive:sudoku/fJnrmHf8QT` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/g2NBLTF6h8` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/gdr8L98QBn` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/hFdr98R6BQ` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/hnHfBN97Fh` | PASS | True | 0.008657% | Deterministic archive sample |
| `archive:sudoku/jMnJTDq86t` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/m7Grm47T9H` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/mfL29d7tG7` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/nHhdmbMtRp` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/p7T9dHPbR9` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/q8R69ndLt4` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/qrq2PJ7gGf` | PASS | True | 0.007845% | Deterministic archive sample |
| `archive:sudoku/rRJ2Tq4b6f` | PASS | True | 0.000501% | Deterministic archive sample |
| `archive:sudoku/tBfT7DHJ6F` | PASS | True | 0.043824% | Deterministic archive sample |
| `archive:sudoku/y74wrbb125` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:tuf714ivht` | PASS | True | 0.013526% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
