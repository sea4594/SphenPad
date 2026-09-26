# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **3** — passed **2**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/2hm49qMB8N` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:sudoku/68G9P3HpjT` | FAIL | False | 0.009969% | Deterministic archive sample |

First structural difference for `archive:sudoku/68G9P3HpjT`: `node 82: stock=('image', {'alt': '🎁', 'class': 'twemoji', 'height': '36.224', 'href': 'twemoji:asset', 'width': '38.419', 'x': '499.43', 'y': '225.787'}, '') candidate=('image', {'alt': '🎁', 'class': 'twemoji', 'height': '37', 'href': 'twemoji:asset', 'width': '38', 'x': '499.431', 'y': '225.331'}, '')`

| `archive:sudoku/7Bm24jbQjm` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
