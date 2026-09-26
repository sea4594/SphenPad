# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **8** — passed **1**, failed **7**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:06vt5y9nwu` | FAIL | — | — | Archive file index 7 |

Error for `archive:06vt5y9nwu`: `TimeoutError()`

| `archive:100ywt1d63` | FAIL | — | — | Archive file index 38 |

Error for `archive:100ywt1d63`: `TimeoutError()`

| `archive:27v1lv24c3` | FAIL | — | — | Archive file index 109 |

Error for `archive:27v1lv24c3`: `TimeoutError()`

| `archive:4b16rwzym1` | FAIL | — | — | Archive file index 261 |

Error for `archive:4b16rwzym1`: `TimeoutError()`

| `archive:7d9f9mb2y3` | FAIL | — | — | Archive file index 439 |

Error for `archive:7d9f9mb2y3`: `TimeoutError()`

| `archive:7llvcaivec` | FAIL | — | — | Archive file index 452 |

Error for `archive:7llvcaivec`: `TimeoutError()`

| `archive:868i586sml` | PASS | True | 0.002705% | Archive file index 490 |
| `archive:869hsb49kn` | FAIL | — | — | Archive file index 491 |

Error for `archive:869hsb49kn`: `TimeoutError()`


## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
