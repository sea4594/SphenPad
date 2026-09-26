# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **22**, failed **3**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:i2r7za43kv` | FAIL | — | — | Archive file index 1278 |

Error for `archive:i2r7za43kv`: `TimeoutError()`

| `archive:i8sa44138x` | PASS | True | 0.000000% | Archive file index 1287 |
| `archive:i94uhivr9x` | PASS | True | 0.000000% | Archive file index 1288 |
| `archive:ib3ewxrhep` | PASS | True | 0.000000% | Archive file index 1291 |
| `archive:if8eo8da5h` | PASS | True | 0.000000% | Archive file index 1296 |
| `archive:igzcothc9f` | PASS | True | 0.000000% | Archive file index 1300 |
| `archive:ih1mkn7vk1` | PASS | True | 0.000000% | Archive file index 1301 |
| `archive:ik85shpid7` | FAIL | — | — | Archive file index 1305 |

Error for `archive:ik85shpid7`: `TimeoutError()`

| `archive:inhwpyj59k` | PASS | True | 0.000000% | Archive file index 1310 |
| `archive:iql7m9a36u` | PASS | True | 0.000000% | Archive file index 1312 |
| `archive:iqv3bub9ae` | PASS | True | 0.000000% | Archive file index 1313 |
| `archive:iutvqv1ht8` | FAIL | — | — | Archive file index 1319 |

Error for `archive:iutvqv1ht8`: `TimeoutError()`

| `archive:ix1pl0qk4b` | PASS | True | 0.000000% | Archive file index 1323 |
| `archive:j1609txzkd` | PASS | True | 0.000676% | Archive file index 1325 |
| `archive:j1t45qigg3` | PASS | True | 0.000000% | Archive file index 1326 |
| `archive:j6e5jfpw08` | PASS | True | 0.058350% | Archive file index 1332 |
| `archive:j99cp5qm7t` | PASS | True | 0.000000% | Archive file index 1335 |
| `archive:j9xc6ud326` | PASS | True | 0.000000% | Archive file index 1336 |
| `archive:jB7njtNrM6` | PASS | True | 0.000541% | Archive file index 1337 |
| `archive:jBfHFQHHp9` | PASS | True | 0.000000% | Archive file index 1338 |
| `archive:james-sinclair/double-entendre` | PASS | True | 0.001082% | Archive file index 1347 |
| `archive:james-sinclair/fifteen-cages` | PASS | True | 0.002164% | Archive file index 1349 |
| `archive:james-sinclair/halfway-there` | PASS | True | 0.002164% | Archive file index 1351 |
| `archive:james-sinclair/irwell` | PASS | True | 0.000000% | Archive file index 1352 |
| `archive:james-sinclair/pancho-and-lefty` | PASS | True | 0.000000% | Archive file index 1355 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
