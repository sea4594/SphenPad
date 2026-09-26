# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **24**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/n4LPm2h3fD` | PASS | True | 0.000000% | Archive file index 3367 |
| `archive:sudoku/n8gt4Hgprp` | PASS | True | 0.004328% | Archive file index 3372 |
| `archive:sudoku/nHhdmbMtRp` | PASS | True | 0.000000% | Archive file index 3381 |
| `archive:sudoku/nJ3mJm2ggg` | PASS | True | 0.000000% | Archive file index 3382 |
| `archive:sudoku/nNFRM62pbG` | PASS | True | 0.000000% | Archive file index 3386 |
| `archive:sudoku/nPNp4LMHGQ` | PASS | True | 0.006492% | Archive file index 3387 |
| `archive:sudoku/nR9Tj3th6H` | PASS | True | 0.000000% | Archive file index 3390 |
| `archive:sudoku/nTJ3njPR6r` | PASS | True | 0.050316% | Archive file index 3393 |
| `archive:sudoku/ndM7Hr7PQm` | PASS | True | 0.000000% | Archive file index 3397 |
| `archive:sudoku/nnPMBR9jhR` | PASS | True | 0.000000% | Archive file index 3402 |
| `archive:sudoku/p3Nm96MDBp` | PASS | True | 0.000000% | Archive file index 3408 |
| `archive:sudoku/p7HHFthmjN` | PASS | True | 0.000000% | Archive file index 3412 |
| `archive:sudoku/pG7f49Q4f4` | PASS | True | 0.004183% | Archive file index 3424 |
| `archive:sudoku/pM7jd2QbmD` | FAIL | — | — | Archive file index 3428 |

Error for `archive:sudoku/pM7jd2QbmD`: `TimeoutError()`

| `archive:sudoku/pNPn62jbDR` | PASS | True | 0.005629% | Archive file index 3429 |
| `archive:sudoku/q3jhj7DBGn` | PASS | True | 0.004058% | Archive file index 3446 |
| `archive:sudoku/q7FMdJ4QD9` | PASS | True | 0.000000% | Archive file index 3453 |
| `archive:sudoku/qF8D7mDRnF` | PASS | True | 0.000000% | Archive file index 3460 |
| `archive:sudoku/qFrmgJ98Nh` | PASS | True | 0.007033% | Archive file index 3461 |
| `archive:sudoku/qH42fp9hLh` | PASS | True | 0.000000% | Archive file index 3462 |
| `archive:sudoku/qLDQq7tn94` | PASS | True | 0.000000% | Archive file index 3468 |
| `archive:sudoku/qM96Q9qQ96` | PASS | True | 0.000000% | Archive file index 3471 |
| `archive:sudoku/qN79DqMtBT` | PASS | True | 0.001082% | Archive file index 3472 |
| `archive:sudoku/qNDr3fhnBJ` | PASS | True | 0.000000% | Archive file index 3473 |
| `archive:sudoku/qT84jPJ8b2` | PASS | True | 0.000000% | Archive file index 3479 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
