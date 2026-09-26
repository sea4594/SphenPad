# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **21**, failed **4**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:james-sinclair/quadrilateral` | PASS | True | 0.000000% | Archive file index 1357 |
| `archive:james-sinclair/slow-burn` | PASS | True | 0.022994% | Archive file index 1362 |
| `archive:james-sinclair/split-decision` | PASS | True | 0.008115% | Archive file index 1363 |
| `archive:james-sinclair/stickiest-notes` | FAIL | — | — | Archive file index 1364 |

Error for `archive:james-sinclair/stickiest-notes`: `TimeoutError()`

| `archive:james-sinclair/unveil` | PASS | True | 0.002164% | Archive file index 1367 |
| `archive:jan0hcmke0` | PASS | True | 0.000000% | Archive file index 1369 |
| `archive:jbliq30p6u` | PASS | True | 0.014067% | Archive file index 1371 |
| `archive:jeyw4ftg8q` | PASS | True | 0.000000% | Archive file index 1377 |
| `archive:jfM6N4BLFT` | PASS | True | 0.000000% | Archive file index 1379 |
| `archive:jgdFdqhmn2` | FAIL | — | — | Archive file index 1384 |

Error for `archive:jgdFdqhmn2`: `TimeoutError()`

| `archive:jl4sby2gl2` | FAIL | — | — | Archive file index 1391 |

Error for `archive:jl4sby2gl2`: `TimeoutError()`

| `archive:jpjbe0lid4` | PASS | True | 0.008657% | Archive file index 1393 |
| `archive:jw1onozqhg` | FAIL | — | — | Archive file index 1400 |

Error for `archive:jw1onozqhg`: `TimeoutError()`

| `archive:k01vyssa50` | PASS | True | 0.000000% | Archive file index 1405 |
| `archive:k1i7tx72h1` | PASS | True | 0.000000% | Archive file index 1408 |
| `archive:k32j83erb7` | PASS | True | 0.000000% | Archive file index 1410 |
| `archive:k3928bukk6` | PASS | True | 0.000000% | Archive file index 1411 |
| `archive:k763dyf84l` | PASS | True | 0.000000% | Archive file index 1415 |
| `archive:k9mm1xgca5` | PASS | True | 0.000000% | Archive file index 1417 |
| `archive:ka3olc7kq1` | PASS | True | 0.003246% | Archive file index 1420 |
| `archive:kccvhsp1ff` | PASS | True | 0.000000% | Archive file index 1424 |
| `archive:kllmj2p8f7` | PASS | True | 0.099279% | Archive file index 1435 |
| `archive:ksj8nzm463` | PASS | True | 0.001292% | Archive file index 1440 |
| `archive:kszsitwn8p` | PASS | True | 0.000000% | Archive file index 1442 |
| `archive:kt1pesfm29` | PASS | True | 0.002164% | Archive file index 1443 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
