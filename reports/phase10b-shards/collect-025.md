# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **24**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/H774tRHPbM` | PASS | True | 0.000000% | Archive file index 2499 |
| `archive:sudoku/HNbtmnHtNL` | PASS | True | 0.000000% | Archive file index 2514 |
| `archive:sudoku/HP83P4q2Pr` | PASS | True | 0.000000% | Archive file index 2515 |
| `archive:sudoku/HRhmB9N2n6` | PASS | True | 0.000000% | Archive file index 2520 |
| `archive:sudoku/Hb4Tb8tgRQ` | PASS | True | 0.000000% | Archive file index 2522 |
| `archive:sudoku/HbR228RMb2` | PASS | True | 0.006492% | Archive file index 2523 |
| `archive:sudoku/Hdpt6h9nBt` | PASS | True | 0.000000% | Archive file index 2524 |
| `archive:sudoku/Hf9QqQMD7J` | PASS | True | 0.000000% | Archive file index 2525 |
| `archive:sudoku/Hh7BP9jBBG` | PASS | True | 0.000000% | Archive file index 2527 |
| `archive:sudoku/Hrbb6dRLqp` | PASS | True | 0.000000% | Archive file index 2534 |
| `archive:sudoku/J4DPNLd6tT` | PASS | True | 0.007304% | Archive file index 2543 |
| `archive:sudoku/JDjq4DqQb3` | PASS | True | 0.145267% | Archive file index 2553 |
| `archive:sudoku/JFgdrLjrdQ` | PASS | True | 0.000000% | Archive file index 2555 |
| `archive:sudoku/JGG2RDFhJq` | PASS | True | 0.000000% | Archive file index 2556 |
| `archive:sudoku/JGPFmGQqMT` | PASS | True | 0.005951% | Archive file index 2558 |
| `archive:sudoku/JJF89PJpgF` | PASS | True | 0.000000% | Archive file index 2564 |
| `archive:sudoku/JT4R8JDjBd` | PASS | True | 0.000000% | Archive file index 2573 |
| `archive:sudoku/JbLpJdjNhB` | PASS | True | 0.007033% | Archive file index 2575 |
| `archive:sudoku/L6FBpNTnhN` | PASS | True | 0.000000% | Archive file index 2600 |
| `archive:sudoku/L82RmGGrD7` | PASS | True | 0.000000% | Archive file index 2604 |
| `archive:sudoku/L9M2DLtfrh` | PASS | True | 0.000000% | Archive file index 2607 |
| `archive:sudoku/LM92bDhjFg` | PASS | True | 0.000000% | Archive file index 2619 |
| `archive:sudoku/LNj2JRDpq6` | FAIL | — | — | Archive file index 2622 |

Error for `archive:sudoku/LNj2JRDpq6`: `TimeoutError()`

| `archive:sudoku/LQBjgh6LH4` | PASS | True | 0.003787% | Archive file index 2627 |
| `archive:sudoku/LRBmTpdnb8` | PASS | True | 0.000000% | Archive file index 2630 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
