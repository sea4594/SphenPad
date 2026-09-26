# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **4** — passed **0**, failed **4**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:fi311m5b4u` | FAIL | False | 0.084358% | Deterministic archive sample |

First structural difference for `archive:fi311m5b4u`: `node 19: stock=('image', {'alt': '🐀', 'class': 'twemoji', 'height': '37.801', 'href': 'twemoji:asset', 'width': '38.946', 'x': '12.661', 'y': '536.197'}, '') candidate=('image', {'alt': '🐀', 'class': 'twemoji', 'height': '37', 'href': 'twemoji:asset', 'width': '39', 'x': '12.656', 'y': '536.987'}, '')`

| `archive:james-sinclair/schrodingers-carry-on` | FAIL | False | 0.345009% | Deterministic archive sample |

First structural difference for `archive:james-sinclair/schrodingers-carry-on`: `node 42: stock=('path', {'class': 'cell-grid', 'd': 'M0 0 L384 0 M0 64 L384 64 M0 128 L384 128 M0 192 L384 192 M0 256 L384 256 M0 320 L384 320 M0 384 L384 384 M0 448 L384 448 M0 0 L0 448 M64 0 L64 448 M128 0 L128 448 M192 0 L192 448 M256 0 L256 448 M320 0 L320 448 M384 0 L384 448'}, '') candidate=('path', {'d': 'M0 0 L384 0 M0 64 L384 64 M0 128 L384 128 M0 192 L384 192 M0 256 L384 256 M0 320 L384 320 M0 384 L384 384 M0 0 L0 384 M64 0 L64 384 M128 0 L128 384 M192 0 L192 384 M256 0 L256 384 M320 0`

| `archive:k4zgmts5h9` | FAIL | False | 0.063111% | Deterministic archive sample |

First structural difference for `archive:k4zgmts5h9`: `node 100: stock=('image', {'alt': '🧁', 'class': 'twemoji', 'height': '37.074', 'href': 'twemoji:asset', 'width': '38.076', 'x': '474.74', 'y': '466.574'}, '') candidate=('image', {'alt': '🧁', 'class': 'twemoji', 'height': '37', 'href': 'twemoji:asset', 'width': '38', 'x': '474.731', 'y': '466.631'}, '')`

| `archive:ksj8nzm463` | FAIL | False | 0.949795% | Deterministic archive sample |

First structural difference for `archive:ksj8nzm463`: `node 14: stock=('image', {'alt': '🐂', 'class': 'twemoji', 'height': '34.029', 'href': 'twemoji:asset', 'width': '35.126', 'x': '78.531', 'y': '79.848'}, '') candidate=('image', {'alt': '🐂', 'class': 'twemoji', 'height': '33', 'href': 'twemoji:asset', 'width': '35', 'x': '78.531', 'y': '80.191'}, '')`


## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
