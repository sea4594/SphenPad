# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **11**, failed **4**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:e27trjd6zv` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:e7g39h4vyj` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:eb90s76a4e` | FAIL | — | — | Deterministic archive sample |

Error for `archive:eb90s76a4e`: `TimeoutError()`

| `archive:eep49o4qx6` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:ei2pkdyk0w` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:eo2tx5yh0c` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:esjz6meusc` | FAIL | — | — | Deterministic archive sample |

Error for `archive:esjz6meusc`: `TimeoutError()`

| `archive:ew0fmz0exc` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:f2DNr9b4tb` | FAIL | False | 100.000000% | Deterministic archive sample |

First structural difference for `archive:f2DNr9b4tb`: `node 0: stock=('svg', {'viewBox': '-48 -64 640 656'}, '') candidate=('svg', {'viewBox': '-48 -48 640 640'}, '')`

| `archive:f5vq2fborp` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:f93bjjsyai` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:fa86g835k3` | PASS | True | 0.065735% | Deterministic archive sample |
| `archive:fddFpq7HLn` | PASS | True | 0.002705% | Deterministic archive sample |
| `archive:fgh2j8zmrx` | PASS | True | 0.004328% | Deterministic archive sample |
| `archive:fi311m5b4u` | FAIL | False | 0.364623% | Deterministic archive sample |

First structural difference for `archive:fi311m5b4u`: `node 19: stock=('text', {'style': 'fill:var(--color-black);stroke:var(--color-white);font-size: 31px;', 'x': '32', 'y': '557.8'}, '🐀') candidate=('image', {'alt': '🐀', 'class': 'twemoji', 'height': '37', 'href': 'twemoji:asset', 'width': '39', 'x': '12.656', 'y': '536.987'}, '')`


## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
