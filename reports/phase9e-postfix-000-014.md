# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **14**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:00r3q84657` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:06vt5y9nwu` | FAIL | — | — | Deterministic archive sample |

Error for `archive:06vt5y9nwu`: `TimeoutError()`

| `archive:0g7nns4iny` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:0mrgocdo2k` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:0tiit8lofl` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:0z0pkkno12` | PASS | True | 0.002164% | Deterministic archive sample |
| `archive:12bkbyft2r` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:17j9j9bf82` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:191t7peym8` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:1c1i6cf4wu` | PASS | True | 0.027593% | Deterministic archive sample |
| `archive:1f9u67dq06` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:1p9vh22zea` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:1rbkrrjyqv` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:1xf09aa30a` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:20vtk6jbbz` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
