# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **13**, failed **2**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/4mH66tpGmM` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/4rjdBRPmdF` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/68G9P3HpjT` | FAIL | False | 0.009969% | Deterministic archive sample |

First structural difference for `archive:sudoku/68G9P3HpjT`: `node 82: stock=('text', {'style': 'fill:var(--color-black);stroke:var(--color-white);font-size: 30.4px;', 'x': '518.4', 'y': '246.3'}, '🎁') candidate=('image', {'alt': '🎁', 'class': 'twemoji', 'height': '37', 'href': 'twemoji:asset', 'width': '38', 'x': '499.431', 'y': '225.331'}, '')`

| `archive:sudoku/6Dnqr8TLQ7` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/6NMrnGH9n7` | PASS | True | 0.000866% | Deterministic archive sample |
| `archive:sudoku/6b4fM2jNL4` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/6j3GrPqpDb` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/6nb6Ndf63L` | PASS | True | 0.009739% | Deterministic archive sample |
| `archive:sudoku/6r4hPpFg9m` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/74pnqPrLt2` | PASS | True | 0.004328% | Deterministic archive sample |
| `archive:sudoku/783gJP776Q` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/7Bm24jbQjm` | FAIL | False | 2.864583% | Deterministic archive sample |

First structural difference for `archive:sudoku/7Bm24jbQjm`: `node 53: stock=('text', {'class': 'cell-given', 'style': '', 'x': '96', 'y': '35.8'}, 'd') candidate=('text', {'class': 'cell-given', 'style': '', 'x': '96', 'y': '35.8'}, 'D')`

| `archive:sudoku/7HdFPr9MG7` | PASS | True | 0.004328% | Deterministic archive sample |
| `archive:sudoku/7Q6dBrG9fN` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/7bprG39P87` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
