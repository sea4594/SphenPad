# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **20** — passed **18**, failed **2**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:2i3vnmx1ye` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:2mltluk4bn` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:2oxam110an` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:2susajautc` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:2vyqqhy6ky` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:30jk32po6i` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:34vev6zoay` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:3D64nRR387` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:3a0z38vzgq` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:3cnbyztbq0` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:3eipqnv8xm` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:3i3xlin7gl` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:3ma2z9n9lr` | PASS | True | 0.008115% | Deterministic archive sample |
| `archive:3pev731294` | FAIL | False | 0.664771% | Deterministic archive sample |

First structural difference for `archive:3pev731294`: `node 14: stock=('text', {'style': 'fill:var(--color-black);stroke:var(--color-white);font-size: 28px;', 'x': '297.6', 'y': '537.2'}, '🧁') candidate=('image', {'alt': '🧁', 'class': 'twemoji', 'height': '33', 'href': 'twemoji:asset', 'width': '35', 'x': '280.131', 'y': '518.591'}, '')`

| `archive:3uz3y611dl` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:3xnydynuih` | FAIL | False | 100.000000% | Deterministic archive sample |

First structural difference for `archive:3xnydynuih`: `node 0: stock=('svg', {'viewBox': '-48 -64 640 656'}, '') candidate=('svg', {'viewBox': '-48 -48 640 640'}, '')`

| `archive:420s9bg0dc` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:4761am7zw5` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:4HQfd437LD` | PASS | True | 0.009549% | Deterministic archive sample |
| `archive:4ctb5mbrk8` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
