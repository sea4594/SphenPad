# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **23**, failed **2**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/qTdnQ2MjL8` | PASS | True | 0.008115% | Archive file index 3483 |
| `archive:sudoku/qgnrth64HH` | PASS | True | 0.008657% | Archive file index 3489 |
| `archive:sudoku/qmFmHfmH2q` | PASS | True | 0.000000% | Archive file index 3492 |
| `archive:sudoku/r2TmnnnmGR` | PASS | True | 0.000000% | Archive file index 3498 |
| `archive:sudoku/r4QbD3Bb6F` | PASS | True | 0.000000% | Archive file index 3503 |
| `archive:sudoku/r89wh6qj90` | PASS | True | 0.000000% | Archive file index 3504 |
| `archive:sudoku/r8GLfr32Dj` | PASS | True | 0.005410% | Archive file index 3505 |
| `archive:sudoku/r8HJJ2mHTh` | PASS | True | 0.000000% | Archive file index 3506 |
| `archive:sudoku/rFJd9mN82f` | FAIL | — | — | Archive file index 3512 |

Error for `archive:sudoku/rFJd9mN82f`: `TimeoutError()`

| `archive:sudoku/rJDLMnH7LB` | FAIL | — | — | Archive file index 3514 |

Error for `archive:sudoku/rJDLMnH7LB`: `TimeoutError()`

| `archive:sudoku/rJqFpfNPFq` | PASS | True | 0.000000% | Archive file index 3516 |
| `archive:sudoku/rL2QBLRhRd` | PASS | True | 0.000000% | Archive file index 3517 |
| `archive:sudoku/rLjhGRbDPN` | PASS | True | 0.000000% | Archive file index 3520 |
| `archive:sudoku/rPTbfNrPRH` | PASS | True | 0.002705% | Archive file index 3525 |
| `archive:sudoku/rPbrd838pr` | PASS | True | 0.002164% | Archive file index 3526 |
| `archive:sudoku/rRmm2D6LfN` | PASS | True | 0.000000% | Archive file index 3531 |
| `archive:sudoku/rm4H3mggT7` | PASS | True | 0.000000% | Archive file index 3542 |
| `archive:sudoku/rnTpr4Qp7p` | PASS | True | 0.002164% | Archive file index 3543 |
| `archive:sudoku/rpd3h3nrp2` | PASS | True | 0.000000% | Archive file index 3545 |
| `archive:sudoku/t378bRqqgR` | PASS | True | 0.000000% | Archive file index 3551 |
| `archive:sudoku/t3tR9bGgjG` | PASS | True | 0.001623% | Archive file index 3552 |
| `archive:sudoku/t43n9QnBLp` | PASS | True | 0.000000% | Archive file index 3553 |
| `archive:sudoku/t7Lfmrnj4H` | PASS | True | 0.001623% | Archive file index 3556 |
| `archive:sudoku/t9R8FpbtRJ` | PASS | True | 0.009739% | Archive file index 3559 |
| `archive:sudoku/t9h6rqDj64` | PASS | True | 0.008657% | Archive file index 3560 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
