# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **8** — passed **4**, failed **4**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:9snrpdy9fe` | FAIL | — | — | Archive file index 588 |

Error for `archive:9snrpdy9fe`: `TimeoutError()`

| `archive:Dt3rqrQPGR` | PASS | True | 0.000000% | Archive file index 619 |
| `archive:L9jqGq4Qtq` | PASS | True | 0.000000% | Archive file index 667 |
| `archive:Lf4B9t2p29` | PASS | True | 0.000000% | Archive file index 674 |
| `archive:MONOPOLYSUDOKU` | FAIL | — | — | Archive file index 683 |

Error for `archive:MONOPOLYSUDOKU`: `TimeoutError()`

| `archive:ays2k7hm6t` | FAIL | — | — | Archive file index 788 |

Error for `archive:ays2k7hm6t`: `TimeoutError()`

| `archive:b193jegg4x` | FAIL | — | — | Archive file index 791 |

Error for `archive:b193jegg4x`: `TimeoutError()`

| `archive:bmh85ce33k` | PASS | True | 0.009198% | Archive file index 866 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
