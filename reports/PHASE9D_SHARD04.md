# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `fpuzzles`

Fixtures: **5** — passed **4**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `fpuz-killercage` | FAIL | False | 0.007234% | Killer cage conversion |

First structural difference for `fpuz-killercage`: `node 17: stock=('rect', {'class': 'cage-killer cage-label', 'height': '12.3', 'style': 'fill:rgba(255,255,255,0.9);stroke:none;', 'x': '2.2', 'y': '3.8'}, '') candidate=('rect', {'class': 'cage-killer cage-label', 'height': '12', 'style': 'fill:rgba(255,255,255,0.9);stroke:none;', 'x': '2.2', 'y': '3.8'}, '')`

| `fpuz-cage` | PASS | True | 0.002411% | Generic cage conversion |
| `fpuz-cage-row-indexer` | PASS | True | 0.000000% | Generic cage Row Indexer style inference |
| `fpuz-cage-column-indexer` | PASS | True | 0.000000% | Generic cage Column Indexer style inference |
| `fpuz-cage-box-indexer` | PASS | True | 0.000000% | Generic cage Box Indexer style inference |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
