# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `fpuzzles`

Fixtures: **5** — passed **4**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `fpuz-minimum` | PASS | True | 0.000000% | Minimum arrows including adjacent-part suppression |
| `fpuz-maximum` | PASS | True | 0.000000% | Maximum arrows including adjacent-part suppression |
| `fpuz-line` | PASS | True | 0.000000% | Generic line conversion |
| `fpuz-rectangle` | PASS | True | 0.000000% | Rectangle cosmetic |
| `fpuz-circle` | FAIL | False | 0.000000% | Circle cosmetic |

First structural difference for `fpuz-circle`: `node 25: stock=('rect', {'class': 'textbg', 'fill': '#ddf4ff', 'fill-opacity': '0.5', 'height': '50.2', 'opacity': '1', 'rx': '25.1', 'ry': '25.1', 'stroke': '#225577', 'stroke-opacity': '0.5', 'stroke-width': '1', 'textColor': '#112233', 'transform': 'translate(96,96) rotate(15) translate(-96,-96) ', 'width': '50.2', 'x': '70.9', 'y': '70.9'}, '') candidate=('rect', {'class': 'textbg', 'fill': '#ddf4ff', 'fill-opacity': '0.5', 'height': '50.2', 'opacity': '1', 'rx': '25.1', 'ry': '25.1', 'strok`


## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
