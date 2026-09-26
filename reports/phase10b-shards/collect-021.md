# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **24**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/68G9P3HpjT` | PASS | True | 0.009969% | Archive file index 2042 |
| `archive:sudoku/6FTpFmNNhp` | PASS | True | 0.001082% | Archive file index 2050 |
| `archive:sudoku/6HqJL2Mpjd` | PASS | True | 0.000000% | Archive file index 2052 |
| `archive:sudoku/6JBh99JDJJ` | PASS | True | 0.000000% | Archive file index 2053 |
| `archive:sudoku/6QfQ4hB79q` | PASS | True | 0.000000% | Archive file index 2060 |
| `archive:sudoku/6jmMrgJHLT` | PASS | True | 0.000000% | Archive file index 2071 |
| `archive:sudoku/6mBf9mr992` | PASS | True | 0.000000% | Archive file index 2072 |
| `archive:sudoku/6nRNmRN7L7` | PASS | True | 0.000000% | Archive file index 2075 |
| `archive:sudoku/6pQgD6jgJn` | PASS | True | 0.001623% | Archive file index 2080 |
| `archive:sudoku/6tnBLrmPgh` | PASS | True | 0.000000% | Archive file index 2087 |
| `archive:sudoku/76q9qg3JDg` | PASS | True | 0.000000% | Archive file index 2092 |
| `archive:sudoku/77Qb4gp8db` | PASS | True | 0.000000% | Archive file index 2093 |
| `archive:sudoku/78Mb3dbbH3` | PASS | True | 0.000000% | Archive file index 2097 |
| `archive:sudoku/78hbnfQjPm` | PASS | True | 0.001082% | Archive file index 2099 |
| `archive:sudoku/7BgqG63BR9` | PASS | True | 0.005951% | Archive file index 2102 |
| `archive:sudoku/7D4tNqhF9L` | PASS | True | 0.000000% | Archive file index 2106 |
| `archive:sudoku/7NLb3Mj896` | PASS | True | 0.008115% | Archive file index 2112 |
| `archive:sudoku/7NdfmMt8HL` | PASS | True | 0.000000% | Archive file index 2113 |
| `archive:sudoku/7Ng2dh2Bfr` | PASS | True | 0.002164% | Archive file index 2115 |
| `archive:sudoku/7Qt3HNR2Pj` | FAIL | — | — | Archive file index 2117 |

Error for `archive:sudoku/7Qt3HNR2Pj`: `TimeoutError()`

| `archive:sudoku/7bBDd6q2J8` | PASS | True | 0.000000% | Archive file index 2121 |
| `archive:sudoku/7dhpg42PrL` | PASS | True | 0.000000% | Archive file index 2124 |
| `archive:sudoku/7g3F33FjQg` | PASS | True | 0.000000% | Archive file index 2128 |
| `archive:sudoku/7gd8qFNRdd` | PASS | True | 0.007574% | Archive file index 2131 |
| `archive:sudoku/7hhdhdft3r` | PASS | True | 0.009198% | Archive file index 2132 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
