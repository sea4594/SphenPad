# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **25**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/F92tJ2HbLJ` | PASS | True | 0.000000% | Archive file index 2378 |
| `archive:sudoku/FB378fm267` | PASS | True | 0.000000% | Archive file index 2380 |
| `archive:sudoku/FJf8mBHjH9` | PASS | True | 0.000000% | Archive file index 2388 |
| `archive:sudoku/FLqFBMpTJB` | PASS | True | 0.000000% | Archive file index 2390 |
| `archive:sudoku/FPPb3T2JqT` | PASS | True | 0.000000% | Archive file index 2396 |
| `archive:sudoku/FPg9HPgDqT` | PASS | True | 0.000000% | Archive file index 2397 |
| `archive:sudoku/FQDpNL27R2` | PASS | True | 0.000000% | Archive file index 2398 |
| `archive:sudoku/FQQf6HQfm7` | PASS | True | 0.000000% | Archive file index 2399 |
| `archive:sudoku/FRph2b4g2g` | PASS | True | 0.007787% | Archive file index 2403 |
| `archive:sudoku/Fbf8q9pGJT` | PASS | True | 0.000000% | Archive file index 2406 |
| `archive:sudoku/Fbhjtgr8Mf` | PASS | True | 0.011903% | Archive file index 2407 |
| `archive:sudoku/Fm9HLrhJ69` | PASS | True | 0.000000% | Archive file index 2416 |
| `archive:sudoku/Fp2Tn37qnG` | PASS | True | 0.000000% | Archive file index 2422 |
| `archive:sudoku/Ftfnn4L2tQ` | PASS | True | 0.021371% | Archive file index 2429 |
| `archive:sudoku/G2jJbhbGtQ` | PASS | True | 0.000000% | Archive file index 2431 |
| `archive:sudoku/G9mBNJr24F` | PASS | True | 0.000000% | Archive file index 2440 |
| `archive:sudoku/GGrd2GTMLT` | PASS | True | 0.005951% | Archive file index 2450 |
| `archive:sudoku/GLFmHPbrmh` | PASS | True | 0.000000% | Archive file index 2453 |
| `archive:sudoku/GLmtfHpmnD` | PASS | True | 0.000000% | Archive file index 2455 |
| `archive:sudoku/GMmTTqFhp2` | PASS | True | 0.069793% | Archive file index 2457 |
| `archive:sudoku/GT9f3PBhJ3` | PASS | True | 0.003253% | Archive file index 2467 |
| `archive:sudoku/Gg8MND3M98` | PASS | True | 0.000000% | Archive file index 2473 |
| `archive:sudoku/GjnL983hGT` | PASS | True | 0.000000% | Archive file index 2481 |
| `archive:sudoku/GpfBbHBhPM` | PASS | True | 0.000000% | Archive file index 2487 |
| `archive:sudoku/GtRpGn2tJ4` | PASS | True | 0.000000% | Archive file index 2491 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
