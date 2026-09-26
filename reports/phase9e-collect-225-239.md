# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **14**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:mvjp2dw24q` | PASS | True | 0.003787% | Deterministic archive sample |
| `archive:mzabnx43dl` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:n3e6mr3qwr` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:n5avmxmtyt` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:n837muu8j6` | PASS | True | 0.002705% | Deterministic archive sample |
| `archive:nGb8TFpQ6h` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:neh0ii8ycb` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:nktjmzm64k` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:nnf5fqru6z` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:ntqufgkvcx` | FAIL | — | — | Deterministic archive sample |

Error for `archive:ntqufgkvcx`: `TimeoutError()`

| `archive:nxbw6uuei0` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:o0n73yxg22` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:o7ukhot5zh` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:oesv536w7e` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:okh6idt7fe` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
