# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **11** — passed **0**, failed **11**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:2b6nrvt81y` | FAIL | False | 1.741582% | Deterministic archive sample |

First structural difference for `archive:2b6nrvt81y`: `node 36: stock=('path', {'class': 'cage-killer', 'd': 'M389.12 58.88 L389.12 5.12 L506.88 5.12 L506.88 58.88 Z', 'fill': 'none', 'shape-rendering': 'geometricprecision', 'stroke': '#00000000', 'stroke-dasharray': '5 3', 'stroke-dashcorner': '4', 'stroke-width': '1.5px', 'vector-effect': 'non-scaling-stroke'}, '') candidate=('path', {'class': 'cage-killer', 'd': 'M389.12 58.88 L389.12 5.12 L506.88 5.12 L506.88 58.88 Z', 'fill': 'none', 'shape-rendering': 'geometricprecision', 'stroke': 'rgba(0, 0`

| `archive:3pev731294` | FAIL | False | 0.664771% | Deterministic archive sample |

First structural difference for `archive:3pev731294`: `node 14: stock=('text', {'style': 'fill:var(--color-black);stroke:var(--color-white);font-size: 28px;', 'x': '297.6', 'y': '537.2'}, '🧁') candidate=('image', {'alt': '🧁', 'class': 'twemoji', 'height': '33', 'href': 'twemoji:asset', 'width': '35', 'x': '280.131', 'y': '518.591'}, '')`

| `archive:3xnydynuih` | FAIL | False | 100.000000% | Deterministic archive sample |

First structural difference for `archive:3xnydynuih`: `node 0: stock=('svg', {'viewBox': '-48 -64 640 656'}, '') candidate=('svg', {'viewBox': '-48 -48 640 640'}, '')`

| `archive:f2DNr9b4tb` | FAIL | False | 100.000000% | Deterministic archive sample |

First structural difference for `archive:f2DNr9b4tb`: `node 0: stock=('svg', {'viewBox': '-48 -64 640 656'}, '') candidate=('svg', {'viewBox': '-48 -48 640 640'}, '')`

| `archive:fi311m5b4u` | FAIL | False | 0.364623% | Deterministic archive sample |

First structural difference for `archive:fi311m5b4u`: `node 19: stock=('text', {'style': 'fill:var(--color-black);stroke:var(--color-white);font-size: 31px;', 'x': '32', 'y': '557.8'}, '🐀') candidate=('image', {'alt': '🐀', 'class': 'twemoji', 'height': '37', 'href': 'twemoji:asset', 'width': '39', 'x': '12.656', 'y': '536.987'}, '')`

| `archive:james-sinclair/schrodingers-carry-on` | FAIL | False | 0.345009% | Deterministic archive sample |

First structural difference for `archive:james-sinclair/schrodingers-carry-on`: `node 42: stock=('path', {'class': 'cell-grid', 'd': 'M0 0 L384 0 M0 64 L384 64 M0 128 L384 128 M0 192 L384 192 M0 256 L384 256 M0 320 L384 320 M0 384 L384 384 M0 448 L384 448 M0 0 L0 448 M64 0 L64 448 M128 0 L128 448 M192 0 L192 448 M256 0 L256 448 M320 0 L320 448 M384 0 L384 448'}, '') candidate=('path', {'d': 'M0 0 L384 0 M0 64 L384 64 M0 128 L384 128 M0 192 L384 192 M0 256 L384 256 M0 320 L384 320 M0 384 L384 384 M0 0 L0 384 M64 0 L64 384 M128 0 L128 384 M192 0 L192 384 M256 0 L256 384 M320 0`

| `archive:k4zgmts5h9` | FAIL | False | 0.814688% | Deterministic archive sample |

First structural difference for `archive:k4zgmts5h9`: `node 100: stock=('text', {'style': 'fill:var(--color-black);stroke:var(--color-white);font-size: 30.4px;', 'x': '493.7', 'y': '487.6'}, '🧁') candidate=('image', {'alt': '🧁', 'class': 'twemoji', 'height': '37', 'href': 'twemoji:asset', 'width': '38', 'x': '474.731', 'y': '466.631'}, '')`

| `archive:ksj8nzm463` | FAIL | False | 4.703376% | Deterministic archive sample |

First structural difference for `archive:ksj8nzm463`: `node 14: stock=('text', {'style': 'fill:var(--color-black);stroke:var(--color-white);font-size: 28px;', 'x': '96', 'y': '98.8'}, '🐂') candidate=('image', {'alt': '🐂', 'class': 'twemoji', 'height': '33', 'href': 'twemoji:asset', 'width': '35', 'x': '78.531', 'y': '80.191'}, '')`

| `archive:sudoku/2hm49qMB8N` | FAIL | True | 0.273322% | Deterministic archive sample |
| `archive:sudoku/68G9P3HpjT` | FAIL | False | 0.009969% | Deterministic archive sample |

First structural difference for `archive:sudoku/68G9P3HpjT`: `node 82: stock=('text', {'style': 'fill:var(--color-black);stroke:var(--color-white);font-size: 30.4px;', 'x': '518.4', 'y': '246.3'}, '🎁') candidate=('image', {'alt': '🎁', 'class': 'twemoji', 'height': '37', 'href': 'twemoji:asset', 'width': '38', 'x': '499.431', 'y': '225.331'}, '')`

| `archive:sudoku/7Bm24jbQjm` | FAIL | False | 2.864583% | Deterministic archive sample |

First structural difference for `archive:sudoku/7Bm24jbQjm`: `node 53: stock=('text', {'class': 'cell-given', 'style': '', 'x': '96', 'y': '35.8'}, 'd') candidate=('text', {'class': 'cell-given', 'style': '', 'x': '96', 'y': '35.8'}, 'D')`


## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
