# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **8** — passed **3**, failed **5**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:c2yc4u9yl1` | PASS | True | 0.054644% | Archive file index 897 |
| `archive:cdifwlxo10` | PASS | True | 0.000000% | Archive file index 911 |
| `archive:dqu2xb1itj` | PASS | True | 0.000000% | Archive file index 996 |
| `archive:eb90s76a4e` | FAIL | — | — | Archive file index 1028 |

Error for `archive:eb90s76a4e`: `TimeoutError()`

| `archive:esjz6meusc` | FAIL | — | — | Archive file index 1055 |

Error for `archive:esjz6meusc`: `TimeoutError()`

| `archive:f6xcgzdav3` | FAIL | — | — | Archive file index 1078 |

Error for `archive:f6xcgzdav3`: `TimeoutError()`

| `archive:gbwivexeh7` | FAIL | — | — | Archive file index 1190 |

Error for `archive:gbwivexeh7`: `TimeoutError()`

| `archive:i2r7za43kv` | FAIL | — | — | Archive file index 1278 |

Error for `archive:i2r7za43kv`: `TimeoutError()`


## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
