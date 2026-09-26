# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **24**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/7qtdB7rFMB` | PASS | True | 0.000000% | Archive file index 2139 |
| `archive:sudoku/8JtTJL3JPQ` | PASS | True | 0.000000% | Archive file index 2165 |
| `archive:sudoku/8RprrG92pb` | PASS | True | 0.012985% | Archive file index 2176 |
| `archive:sudoku/8fJHgNJqmM` | PASS | True | 0.000000% | Archive file index 2181 |
| `archive:sudoku/8jrLJ3QBF8` | PASS | True | 0.000000% | Archive file index 2189 |
| `archive:sudoku/8mrQmDf69T` | PASS | True | 0.000000% | Archive file index 2190 |
| `archive:sudoku/8pJ8D987Tg` | PASS | True | 0.000000% | Archive file index 2193 |
| `archive:sudoku/8r6FPhhLbd` | PASS | True | 0.000000% | Archive file index 2198 |
| `archive:sudoku/8rf39jJJbh` | PASS | True | 0.000000% | Archive file index 2199 |
| `archive:sudoku/944Mg3fnJH` | FAIL | — | — | Archive file index 2204 |

Error for `archive:sudoku/944Mg3fnJH`: `TimeoutError()`

| `archive:sudoku/99JFmbth6r` | PASS | True | 0.004869% | Archive file index 2210 |
| `archive:sudoku/9F9jMN8ntn` | PASS | True | 0.010009% | Archive file index 2214 |
| `archive:sudoku/9MQmRjRnTp` | PASS | True | 0.000541% | Archive file index 2223 |
| `archive:sudoku/9ThTbRRRt9` | PASS | True | 0.000000% | Archive file index 2231 |
| `archive:sudoku/9dhQD6bdfN` | PASS | True | 0.000000% | Archive file index 2234 |
| `archive:sudoku/9hLjJRdRpd` | PASS | True | 0.000000% | Archive file index 2236 |
| `archive:sudoku/9m9LpmQ8JF` | PASS | True | 0.001072% | Archive file index 2242 |
| `archive:sudoku/9mP4DBM4MB` | PASS | True | 0.000000% | Archive file index 2244 |
| `archive:sudoku/9pdTNMfMPF` | PASS | True | 0.010280% | Archive file index 2248 |
| `archive:sudoku/9rb4h4qbQG` | PASS | True | 0.000000% | Archive file index 2250 |
| `archive:sudoku/B2NJqj7HrL` | PASS | True | 0.000000% | Archive file index 2252 |
| `archive:sudoku/B4fGtLFjq6` | PASS | True | 0.000000% | Archive file index 2257 |
| `archive:sudoku/BFRF9D8QjP` | PASS | True | 0.004513% | Archive file index 2268 |
| `archive:sudoku/BLHT4RmMFF` | PASS | True | 0.000000% | Archive file index 2274 |
| `archive:sudoku/Bfd43TJgMP` | PASS | True | 0.000000% | Archive file index 2286 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
