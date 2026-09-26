# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **13**, failed **2**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:ka3olc7kq1` | PASS | True | 0.003246% | Deterministic archive sample |
| `archive:kglg9thtij` | PASS | True | 0.005410% | Deterministic archive sample |
| `archive:kknb9z9cjy` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:ksj8nzm463` | FAIL | False | 4.703376% | Deterministic archive sample |

First structural difference for `archive:ksj8nzm463`: `node 14: stock=('text', {'style': 'fill:var(--color-black);stroke:var(--color-white);font-size: 28px;', 'x': '96', 'y': '98.8'}, '🐂') candidate=('image', {'alt': '🐂', 'class': 'twemoji', 'height': '33', 'href': 'twemoji:asset', 'width': '35', 'x': '78.531', 'y': '80.191'}, '')`

| `archive:kzmsrodbh6` | PASS | True | 0.007845% | Deterministic archive sample |
| `archive:l7ymh0s7kf` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:lipt9yn6r4` | FAIL | — | — | Deterministic archive sample |

Error for `archive:lipt9yn6r4`: `TimeoutError()`

| `archive:lm7480sxiy` | PASS | True | 0.004328% | Deterministic archive sample |
| `archive:lxla37je17` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:m6sunffs9u` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:mNtG4hF28M` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:mfGtTnRHt7` | PASS | True | 0.007033% | Deterministic archive sample |
| `archive:miv6k9rwi0` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:mm3L97tf47` | PASS | True | 0.013526% | Deterministic archive sample |
| `archive:mqrdnrGFb3` | PASS | True | 0.004869% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
