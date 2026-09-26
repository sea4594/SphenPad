# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **22**, failed **3**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:dtjb5r5iwe` | PASS | True | 0.008657% | Archive file index 998 |
| `archive:du7tb8qbxq` | PASS | True | 0.014067% | Archive file index 999 |
| `archive:duy38j7tv8` | PASS | True | 0.000000% | Archive file index 1002 |
| `archive:e3zml763km` | PASS | True | 0.000000% | Archive file index 1017 |
| `archive:e4i4jbq62m` | PASS | True | 0.005410% | Archive file index 1018 |
| `archive:e7g39h4vyj` | PASS | True | 0.000000% | Archive file index 1021 |
| `archive:e9455aftlh` | PASS | True | 0.000000% | Archive file index 1024 |
| `archive:e99mf1heg8` | PASS | True | 0.000000% | Archive file index 1025 |
| `archive:eb90s76a4e` | FAIL | — | — | Archive file index 1028 |

Error for `archive:eb90s76a4e`: `TimeoutError()`

| `archive:eco0hsqvv4` | PASS | True | 0.007234% | Archive file index 1030 |
| `archive:eeczcw2suq` | PASS | True | 0.000000% | Archive file index 1032 |
| `archive:ehliu8yyko` | PASS | True | 0.000000% | Archive file index 1040 |
| `archive:el9sus7p0o` | PASS | True | 0.000000% | Archive file index 1044 |
| `archive:emienzh9f1` | PASS | True | 0.000000% | Archive file index 1045 |
| `archive:encxi3ci5i` | PASS | True | 0.000000% | Archive file index 1046 |
| `archive:endeavor-bremster` | PASS | True | 0.001054% | Archive file index 1047 |
| `archive:eoucbc58v9` | PASS | True | 0.000000% | Archive file index 1049 |
| `archive:esjz6meusc` | FAIL | — | — | Archive file index 1055 |

Error for `archive:esjz6meusc`: `TimeoutError()`

| `archive:et4mh85g07` | PASS | True | 0.001623% | Archive file index 1056 |
| `archive:eu8ylhn5ta` | PASS | True | 0.006492% | Archive file index 1060 |
| `archive:f6xcgzdav3` | FAIL | — | — | Archive file index 1078 |

Error for `archive:f6xcgzdav3`: `TimeoutError()`

| `archive:f75ku3v4p7` | PASS | True | 0.000000% | Archive file index 1079 |
| `archive:f8ndB28nDT` | PASS | True | 0.000000% | Archive file index 1080 |
| `archive:fPr4BGqb36` | PASS | True | 0.000000% | Archive file index 1087 |
| `archive:fd4j9hQfBn` | PASS | True | 0.000000% | Archive file index 1094 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
