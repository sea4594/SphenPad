# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **23**, failed **2**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:7wxsd2awbv` | PASS | True | 0.011362% | Archive file index 477 |
| `archive:81upsnpdbs` | PASS | True | 0.000000% | Archive file index 483 |
| `archive:82gfkhwo9b` | PASS | True | 0.000000% | Archive file index 486 |
| `archive:83zpp5gwpt` | PASS | True | 0.000000% | Archive file index 487 |
| `archive:868i586sml` | FAIL | — | — | Archive file index 490 |

Error for `archive:868i586sml`: `TimeoutError()`

| `archive:869hsb49kn` | FAIL | — | — | Archive file index 491 |

Error for `archive:869hsb49kn`: `TimeoutError()`

| `archive:8LPdQB8PbG` | PASS | True | 0.000000% | Archive file index 499 |
| `archive:8b7y7246mu` | PASS | True | 0.000000% | Archive file index 501 |
| `archive:8cs9gx5dfg` | PASS | True | 0.000000% | Archive file index 504 |
| `archive:8df315rarb` | PASS | True | 0.000000% | Archive file index 506 |
| `archive:8f71xo5gv5` | PASS | True | 0.000000% | Archive file index 508 |
| `archive:8l2cabq2sj` | PASS | True | 0.000000% | Archive file index 516 |
| `archive:8m29x14m56` | PASS | True | 0.013526% | Archive file index 517 |
| `archive:8oftyu592v` | PASS | True | 0.000000% | Archive file index 522 |
| `archive:8pndh89Ptm` | PASS | True | 0.000000% | Archive file index 524 |
| `archive:8uefwr5pkz` | PASS | True | 0.000000% | Archive file index 528 |
| `archive:8vzgxh2w8i` | PASS | True | 0.031478% | Archive file index 530 |
| `archive:90n1ck63vq` | PASS | True | 0.000000% | Archive file index 534 |
| `archive:94v9ipg7hq` | PASS | True | 0.000000% | Archive file index 540 |
| `archive:974h2rBNf9` | PASS | True | 0.000000% | Archive file index 543 |
| `archive:9JLLbT9Jj7` | PASS | True | 0.000000% | Archive file index 553 |
| `archive:9c6on7okjr` | PASS | True | 0.005898% | Archive file index 555 |
| `archive:9ecadg11io` | PASS | True | 0.001623% | Archive file index 557 |
| `archive:9g93q6jrmB` | PASS | True | 0.000000% | Archive file index 560 |
| `archive:9ign5knige` | PASS | True | 0.000000% | Archive file index 562 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
