# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **23**, failed **2**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:6nqzhupznu` | PASS | True | 0.003246% | Archive file index 398 |
| `archive:6ul7danidn` | PASS | True | 0.000000% | Archive file index 408 |
| `archive:6uqtssso3q` | PASS | True | 0.000000% | Archive file index 409 |
| `archive:6xlki7zd3x` | PASS | True | 0.000000% | Archive file index 410 |
| `archive:6z3zy41pm6` | PASS | True | 0.000000% | Archive file index 414 |
| `archive:6zpysyrai2` | PASS | True | 0.000000% | Archive file index 415 |
| `archive:70gesrzbl4` | PASS | True | 0.000000% | Archive file index 416 |
| `archive:72xo00v9n2` | PASS | True | 0.004328% | Archive file index 418 |
| `archive:73oh4m8m8m` | PASS | True | 0.000000% | Archive file index 419 |
| `archive:76L6n8tPhM` | PASS | True | 0.000000% | Archive file index 426 |
| `archive:76p1fymv2s` | PASS | True | 0.000000% | Archive file index 428 |
| `archive:7Q693FQRNj` | PASS | True | 0.000000% | Archive file index 435 |
| `archive:7d9f9mb2y3` | FAIL | — | — | Archive file index 439 |

Error for `archive:7d9f9mb2y3`: `TimeoutError()`

| `archive:7fapjms0yv` | PASS | True | 0.000000% | Archive file index 443 |
| `archive:7fr0yash7p` | PASS | True | 0.000000% | Archive file index 444 |
| `archive:7fvnto2d90` | PASS | True | 0.000000% | Archive file index 445 |
| `archive:7gyocv8k7m` | PASS | True | 0.000541% | Archive file index 447 |
| `archive:7llvcaivec` | FAIL | — | — | Archive file index 452 |

Error for `archive:7llvcaivec`: `TimeoutError()`

| `archive:7moj9pjur7` | PASS | True | 0.000000% | Archive file index 457 |
| `archive:7mse59d0ww` | PASS | True | 0.000000% | Archive file index 458 |
| `archive:7n6wneuch2` | PASS | True | 0.055997% | Archive file index 459 |
| `archive:7nrei23yv6` | PASS | True | 0.000000% | Archive file index 461 |
| `archive:7t1yva729p` | PASS | True | 0.000000% | Archive file index 469 |
| `archive:7v1z5iuelo` | PASS | True | 0.000000% | Archive file index 472 |
| `archive:7v7lat2oxd` | PASS | True | 0.000000% | Archive file index 473 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
