# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **10** — passed **8**, failed **2**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:00r3q84657` | PASS | True | 0.000000% | Archive file index 0 |
| `archive:06pymw27cj` | PASS | True | 0.000000% | Archive file index 6 |
| `archive:06vt5y9nwu` | FAIL | — | — | Archive file index 7 |

Error for `archive:06vt5y9nwu`: `TimeoutError()`

| `archive:0k3ackq8an` | PASS | True | 0.007574% | Archive file index 17 |
| `archive:0pshsj5ykr` | PASS | True | 0.000000% | Archive file index 24 |
| `archive:0zkbctsdwi` | PASS | True | 0.000000% | Archive file index 36 |
| `archive:100ywt1d63` | FAIL | — | — | Archive file index 38 |

Error for `archive:100ywt1d63`: `TimeoutError()`

| `archive:11dz689p6l` | PASS | True | 0.000000% | Archive file index 40 |
| `archive:12bkbyft2r` | PASS | True | 0.000000% | Archive file index 41 |
| `archive:14arl2fm9c` | PASS | True | 0.000000% | Archive file index 42 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
