# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **25**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/PqDM6Jjrnq` | PASS | True | 0.000000% | Archive file index 2809 |
| `archive:sudoku/PtD46JNLTP` | PASS | True | 0.049775% | Archive file index 2812 |
| `archive:sudoku/Q22nrd4Mtd` | PASS | True | 0.000000% | Archive file index 2814 |
| `archive:sudoku/Q2FPmtQ8FN` | PASS | True | 0.000000% | Archive file index 2815 |
| `archive:sudoku/Q3NL4tDB7p` | PASS | True | 0.000000% | Archive file index 2816 |
| `archive:sudoku/QLMfpLdG9R` | PASS | True | 0.000000% | Archive file index 2827 |
| `archive:sudoku/QMGbp6Ljtb` | PASS | True | 0.000000% | Archive file index 2830 |
| `archive:sudoku/QR7MMGHpfJ` | PASS | True | 0.000000% | Archive file index 2839 |
| `archive:sudoku/QTjg9tFG9r` | PASS | True | 0.000000% | Archive file index 2842 |
| `archive:sudoku/Qdm8h9FQfh` | PASS | True | 0.007574% | Archive file index 2848 |
| `archive:sudoku/QfnM22HGtP` | PASS | True | 0.000000% | Archive file index 2850 |
| `archive:sudoku/QgdG6gP7jq` | PASS | True | 0.000000% | Archive file index 2852 |
| `archive:sudoku/Qj4P74ThNd` | PASS | True | 0.000000% | Archive file index 2856 |
| `archive:sudoku/QnmpJp4R6f` | PASS | True | 0.000000% | Archive file index 2864 |
| `archive:sudoku/Qp3bDLgqrj` | PASS | True | 0.006492% | Archive file index 2866 |
| `archive:sudoku/Qr3Jq7rnLP` | PASS | True | 0.005951% | Archive file index 2868 |
| `archive:sudoku/QtNgbdQBBh` | PASS | True | 0.000000% | Archive file index 2871 |
| `archive:sudoku/R68bTRmnrP` | PASS | True | 0.009198% | Archive file index 2876 |
| `archive:sudoku/R9JdLhd3p8` | PASS | True | 0.003246% | Archive file index 2879 |
| `archive:sudoku/R9p6tLN9Q9` | PASS | True | 0.185844% | Archive file index 2881 |
| `archive:sudoku/RDQq2T2rpG` | PASS | True | 0.005410% | Archive file index 2885 |
| `archive:sudoku/RGLfL4BgJ2` | PASS | True | 0.000000% | Archive file index 2887 |
| `archive:sudoku/RGhRqJJQ3G` | PASS | True | 0.002006% | Archive file index 2888 |
| `archive:sudoku/RJDghqH248` | PASS | True | 0.000000% | Archive file index 2890 |
| `archive:sudoku/RL3rDQjLHg` | PASS | True | 0.000000% | Archive file index 2891 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
