# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **20** — passed **20**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:mvjp2dw24q` | PASS | True | 0.003787% | Deterministic archive sample |
| `archive:nGb8TFpQ6h` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:o0n73yxg22` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:ota96nsdfv` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:pmv1jze5n3` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:q7khd7z32d` | PASS | True | 0.001082% | Deterministic archive sample |
| `archive:qss44f03sx` | PASS | True | 0.012173% | Deterministic archive sample |
| `archive:ra3rf0qcnz` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:rwx8a9tkdt` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:skuy1x5ywn` | PASS | True | 0.005410% | Deterministic archive sample |
| `archive:sudoku/2J9BH6RrFQ` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/397PdfPq6D` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/3bJgQPpDdj` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/4DMg6BDj7q` | PASS | True | 0.005650% | Deterministic archive sample |
| `archive:sudoku/4rjdBRPmdF` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/6nb6Ndf63L` | PASS | True | 0.009739% | Deterministic archive sample |
| `archive:sudoku/7Q6dBrG9fN` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/88mBm8N4JN` | PASS | True | 0.003787% | Deterministic archive sample |
| `archive:sudoku/8hJDqhbFRQ` | PASS | True | 0.008657% | Deterministic archive sample |
| `archive:sudoku/9NBn32M3gb` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
