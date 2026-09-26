# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **25**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:slzvdt2kqg` | PASS | True | 0.000000% | Archive file index 1857 |
| `archive:sudoku/22Thbg68Hp` | PASS | True | 0.000000% | Archive file index 1871 |
| `archive:sudoku/23DT9TQHfF` | PASS | True | 0.000000% | Archive file index 1872 |
| `archive:sudoku/23rLgH2f6b` | PASS | True | 0.000000% | Archive file index 1874 |
| `archive:sudoku/29B449j9RJ` | PASS | True | 0.007574% | Archive file index 1880 |
| `archive:sudoku/2GqrMGFb3L` | PASS | True | 0.000000% | Archive file index 1885 |
| `archive:sudoku/2J9BH6RrFQ` | PASS | True | 0.000000% | Archive file index 1886 |
| `archive:sudoku/2Ln6hRj4Gm` | PASS | True | 0.007943% | Archive file index 1888 |
| `archive:sudoku/2Lp4R6L272` | PASS | True | 0.002164% | Archive file index 1889 |
| `archive:sudoku/2M8Hmp6rdR` | PASS | True | 0.000000% | Archive file index 1890 |
| `archive:sudoku/2QNMDD7mjr` | PASS | True | 0.000000% | Archive file index 1894 |
| `archive:sudoku/2TBjp2hhbh` | PASS | True | 0.008023% | Archive file index 1897 |
| `archive:sudoku/2gj4qQd4Qd` | PASS | True | 0.000000% | Archive file index 1905 |
| `archive:sudoku/2j4Bdt62rR` | PASS | True | 0.000000% | Archive file index 1908 |
| `archive:sudoku/2jrpnNd2DD` | PASS | True | 0.000000% | Archive file index 1909 |
| `archive:sudoku/2mnGfDQdmj` | PASS | True | 0.000000% | Archive file index 1910 |
| `archive:sudoku/2pHbDJMt4Q` | PASS | True | 0.010280% | Archive file index 1913 |
| `archive:sudoku/33Mj28bTQP` | PASS | True | 0.000000% | Archive file index 1918 |
| `archive:sudoku/36gndhn8ND` | PASS | True | 0.016772% | Archive file index 1922 |
| `archive:sudoku/39GDNpTT9J` | PASS | True | 0.000000% | Archive file index 1928 |
| `archive:sudoku/3BqbqHQq3B` | PASS | True | 0.000000% | Archive file index 1933 |
| `archive:sudoku/3FJJtfL2Dh` | PASS | True | 0.048693% | Archive file index 1938 |
| `archive:sudoku/3GD4Fp9RGr` | PASS | True | 0.000000% | Archive file index 1940 |
| `archive:sudoku/3GtDr9bTRb` | PASS | True | 0.000000% | Archive file index 1943 |
| `archive:sudoku/3HRPmtLJNF` | PASS | True | 0.000000% | Archive file index 1945 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
