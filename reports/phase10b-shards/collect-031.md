# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **24**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/g8nbdG8674` | FAIL | — | — | Archive file index 3139 |

Error for `archive:sudoku/g8nbdG8674`: `TimeoutError()`

| `archive:sudoku/g9mprpmd3g` | PASS | True | 0.000000% | Archive file index 3143 |
| `archive:sudoku/gP3MLq8HTr` | PASS | True | 0.000000% | Archive file index 3157 |
| `archive:sudoku/gTQ3fMq6nM` | PASS | True | 0.000000% | Archive file index 3159 |
| `archive:sudoku/gbp9G4tdJM` | PASS | True | 0.005410% | Archive file index 3161 |
| `archive:sudoku/gdH4d4ThtQ` | PASS | True | 0.000000% | Archive file index 3163 |
| `archive:sudoku/ghGLRhdjHP` | PASS | True | 0.009198% | Archive file index 3169 |
| `archive:sudoku/gmhm44MnFg` | PASS | True | 0.006492% | Archive file index 3176 |
| `archive:sudoku/gphj7LF93b` | PASS | True | 0.000000% | Archive file index 3180 |
| `archive:sudoku/h2jhgN93q8` | PASS | True | 0.000000% | Archive file index 3186 |
| `archive:sudoku/h3MNDhttmF` | PASS | True | 0.002382% | Archive file index 3187 |
| `archive:sudoku/h3gMpBTFhJ` | PASS | True | 0.009198% | Archive file index 3188 |
| `archive:sudoku/h48d9dNn2B` | PASS | True | 0.001009% | Archive file index 3189 |
| `archive:sudoku/h7GLR6J69b` | PASS | True | 0.000000% | Archive file index 3193 |
| `archive:sudoku/h92bTBgj9h` | PASS | True | 0.000000% | Archive file index 3196 |
| `archive:sudoku/h92qrddJMN` | PASS | True | 0.005410% | Archive file index 3197 |
| `archive:sudoku/h9q22bptmF` | PASS | True | 0.000000% | Archive file index 3200 |
| `archive:sudoku/hFRMdthhM3` | PASS | True | 0.000000% | Archive file index 3204 |
| `archive:sudoku/hL28FggBj3` | PASS | True | 0.008115% | Archive file index 3213 |
| `archive:sudoku/hTHqF2DP3b` | PASS | True | 0.000000% | Archive file index 3221 |
| `archive:sudoku/hfpFTGNLrr` | PASS | True | 0.000000% | Archive file index 3229 |
| `archive:sudoku/hhHNrNjhB9` | PASS | True | 0.000000% | Archive file index 3233 |
| `archive:sudoku/hmRBD2d4jf` | PASS | True | 0.000000% | Archive file index 3238 |
| `archive:sudoku/hrgPfnGMLb` | PASS | True | 0.000000% | Archive file index 3246 |
| `archive:sudoku/j3RRHDn7M9` | PASS | True | 0.000000% | Archive file index 3249 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
