# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **23**, failed **2**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/tDpBjNN8nL` | PASS | True | 0.000000% | Archive file index 3566 |
| `archive:sudoku/tFThnGBNTR` | PASS | True | 0.000541% | Archive file index 3568 |
| `archive:sudoku/tJQLHFtF36` | PASS | True | 0.000000% | Archive file index 3576 |
| `archive:sudoku/tLRrPprg8T` | PASS | True | 0.000000% | Archive file index 3577 |
| `archive:sudoku/tMBgMdtJQF` | PASS | True | 0.000000% | Archive file index 3579 |
| `archive:sudoku/tMD6fgrp68` | PASS | True | 0.000000% | Archive file index 3580 |
| `archive:sudoku/tMHDPtqHgG` | PASS | True | 0.000000% | Archive file index 3582 |
| `archive:sudoku/tMq37fgf63` | PASS | True | 0.014040% | Archive file index 3583 |
| `archive:sudoku/tdrMgQDbM8` | PASS | True | 0.000000% | Archive file index 3588 |
| `archive:sudoku/tgQJNqqB6r` | FAIL | — | — | Archive file index 3590 |

Error for `archive:sudoku/tgQJNqqB6r`: `TimeoutError()`

| `archive:sudoku/tmGJtPD44R` | PASS | True | 0.000000% | Archive file index 3593 |
| `archive:sudoku/tpttQ7GTm2` | PASS | True | 0.059514% | Archive file index 3599 |
| `archive:sudoku/ttPm9G96h6` | PASS | True | 0.010821% | Archive file index 3602 |
| `archive:svg41662qt` | PASS | True | 0.013526% | Archive file index 3605 |
| `archive:swwi1ob4u3` | PASS | True | 0.000000% | Archive file index 3610 |
| `archive:t4fevoplnv` | PASS | True | 0.000000% | Archive file index 3616 |
| `archive:t4vu4ndtl3` | FAIL | — | — | Archive file index 3617 |

Error for `archive:t4vu4ndtl3`: `TimeoutError()`

| `archive:t9hgy6k213` | PASS | True | 0.000000% | Archive file index 3622 |
| `archive:t9yym962w0` | PASS | True | 0.000000% | Archive file index 3623 |
| `archive:tQ4tLpRB86` | PASS | True | 0.011903% | Archive file index 3625 |
| `archive:tb6486Tqgg` | PASS | True | 0.000000% | Archive file index 3627 |
| `archive:tkn1nytyis` | PASS | True | 0.000000% | Archive file index 3635 |
| `archive:tsxhzpwal7` | PASS | True | 0.000000% | Archive file index 3642 |
| `archive:twqc1a8ybe` | PASS | True | 0.000000% | Archive file index 3647 |
| `archive:txhi4w5d14` | PASS | True | 0.002164% | Archive file index 3648 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
