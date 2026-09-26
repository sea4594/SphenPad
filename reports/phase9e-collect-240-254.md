# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **13**, failed **2**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:or42ce5os1` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:ota96nsdfv` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:p0xbzd5rlx` | PASS | True | 0.010280% | Deterministic archive sample |
| `archive:p676oglsv8` | FAIL | — | — | Deterministic archive sample |

Error for `archive:p676oglsv8`: `TimeoutError()`

| `archive:p8ushghwpc` | FAIL | — | — | Deterministic archive sample |

Error for `archive:p8ushghwpc`: `TimeoutError()`

| `archive:pTPD72D9qP` | PASS | True | 0.001623% | Deterministic archive sample |
| `archive:pd589n0d3g` | PASS | True | 0.006492% | Deterministic archive sample |
| `archive:pgLhjFH3bR` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:pmv1jze5n3` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:ppclf3vvfp` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:pw9xd2w523` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:pz0m04p9ag` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:q3ik3a630w` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:q7khd7z32d` | PASS | True | 0.001082% | Deterministic archive sample |
| `archive:qLNf2hFdD8` | PASS | True | 0.014067% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
