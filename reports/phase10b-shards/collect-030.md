# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **25**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/d6HQqjdNqf` | PASS | True | 0.000000% | Archive file index 3032 |
| `archive:sudoku/d6LrT33G7f` | PASS | True | 0.000000% | Archive file index 3033 |
| `archive:sudoku/dH7LbLfBRQ` | PASS | True | 0.010280% | Archive file index 3037 |
| `archive:sudoku/dQ3QLHb6qP` | PASS | True | 0.009739% | Archive file index 3046 |
| `archive:sudoku/dffJr73j2F` | PASS | True | 0.000000% | Archive file index 3055 |
| `archive:sudoku/djBQ6LpQng` | PASS | True | 0.000000% | Archive file index 3061 |
| `archive:sudoku/dqb9NQbrj7` | PASS | True | 0.000000% | Archive file index 3070 |
| `archive:sudoku/drfJJ3M8rM` | PASS | True | 0.000000% | Archive file index 3071 |
| `archive:sudoku/dt3bPmdffN` | PASS | True | 0.000000% | Archive file index 3073 |
| `archive:sudoku/f4F3rNQBBr` | PASS | True | 0.000000% | Archive file index 3079 |
| `archive:sudoku/f7PG9pDR78` | PASS | True | 0.000000% | Archive file index 3082 |
| `archive:sudoku/f8mQfj7Png` | PASS | True | 0.000000% | Archive file index 3085 |
| `archive:sudoku/f9Dbmgj3MJ` | PASS | True | 0.000000% | Archive file index 3086 |
| `archive:sudoku/f9h3FHGDBn` | PASS | True | 0.000000% | Archive file index 3087 |
| `archive:sudoku/fH46JBGT7L` | PASS | True | 0.001082% | Archive file index 3094 |
| `archive:sudoku/fJnrmHf8QT` | PASS | True | 0.000000% | Archive file index 3097 |
| `archive:sudoku/fj78pdJMhT` | PASS | True | 0.000000% | Archive file index 3114 |
| `archive:sudoku/fjhJTgjhJ6` | PASS | True | 0.000000% | Archive file index 3115 |
| `archive:sudoku/fjrpMdgLr6` | PASS | True | 0.007033% | Archive file index 3116 |
| `archive:sudoku/fq3F2mrp4R` | PASS | True | 0.000000% | Archive file index 3122 |
| `archive:sudoku/frjRNFMDjB` | PASS | True | 0.000000% | Archive file index 3124 |
| `archive:sudoku/ftF76fpqdQ` | PASS | True | 0.003787% | Archive file index 3126 |
| `archive:sudoku/g2DNj8FHm2` | PASS | True | 0.007574% | Archive file index 3129 |
| `archive:sudoku/g6jHNM4rnT` | PASS | True | 0.007033% | Archive file index 3135 |
| `archive:sudoku/g8LBNq46FM` | PASS | True | 0.001003% | Archive file index 3138 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
