# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **12**, failed **3**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:iugptjcutc` | PASS | True | 0.002164% | Deterministic archive sample |
| `archive:j1609txzkd` | PASS | True | 0.000676% | Deterministic archive sample |
| `archive:j6e5jfpw08` | PASS | True | 0.058350% | Deterministic archive sample |
| `archive:jMg44R2tpb` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:james-sinclair/craven-unshaded` | PASS | True | 0.002164% | Deterministic archive sample |
| `archive:james-sinclair/irwell` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:james-sinclair/schrodingers-carry-on` | FAIL | False | 0.345009% | Deterministic archive sample |

First structural difference for `archive:james-sinclair/schrodingers-carry-on`: `node 42: stock=('path', {'class': 'cell-grid', 'd': 'M0 0 L384 0 M0 64 L384 64 M0 128 L384 128 M0 192 L384 192 M0 256 L384 256 M0 320 L384 320 M0 384 L384 384 M0 448 L384 448 M0 0 L0 448 M64 0 L64 448 M128 0 L128 448 M192 0 L192 448 M256 0 L256 448 M320 0 L320 448 M384 0 L384 448'}, '') candidate=('path', {'d': 'M0 0 L384 0 M0 64 L384 64 M0 128 L384 128 M0 192 L384 192 M0 256 L384 256 M0 320 L384 320 M0 384 L384 384 M0 0 L0 384 M64 0 L64 384 M128 0 L128 384 M192 0 L192 384 M256 0 L256 384 M320 0`

| `archive:james-sinclair/underling` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:jcj5nibbdm` | PASS | True | 0.028404% | Deterministic archive sample |
| `archive:jfM6N4BLFT` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:jhwz7m5dbe` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:jpjbe0lid4` | PASS | True | 0.008657% | Deterministic archive sample |
| `archive:jw1onozqhg` | FAIL | — | — | Deterministic archive sample |

Error for `archive:jw1onozqhg`: `TimeoutError()`

| `archive:k18i652bjj` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:k4zgmts5h9` | FAIL | False | 0.814688% | Deterministic archive sample |

First structural difference for `archive:k4zgmts5h9`: `node 100: stock=('text', {'style': 'fill:var(--color-black);stroke:var(--color-white);font-size: 30.4px;', 'x': '493.7', 'y': '487.6'}, '🧁') candidate=('image', {'alt': '🧁', 'class': 'twemoji', 'height': '37', 'href': 'twemoji:asset', 'width': '38', 'x': '474.731', 'y': '466.631'}, '')`


## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
