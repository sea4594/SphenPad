# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **20**, failed **5**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/j3m76TrmfD` | PASS | True | 0.000000% | Archive file index 3251 |
| `archive:sudoku/jBDjqmRdpg` | PASS | True | 0.007574% | Archive file index 3260 |
| `archive:sudoku/jJRTHJfDQG` | PASS | True | 0.000000% | Archive file index 3267 |
| `archive:sudoku/jMQR24JRBN` | FAIL | — | — | Archive file index 3271 |

Error for `archive:sudoku/jMQR24JRBN`: `TimeoutError()`

| `archive:sudoku/jPN8QBBnHr` | PASS | True | 0.000000% | Archive file index 3276 |
| `archive:sudoku/jQQf2DBMLT` | PASS | True | 0.005951% | Archive file index 3278 |
| `archive:sudoku/jf6RnbgLFm` | PASS | True | 0.011903% | Archive file index 3283 |
| `archive:sudoku/jfrf3mHRbN` | FAIL | — | — | Archive file index 3286 |

Error for `archive:sudoku/jfrf3mHRbN`: `TimeoutError()`

| `archive:sudoku/jqFJNfRhnM` | PASS | True | 0.000000% | Archive file index 3294 |
| `archive:sudoku/jrdBR9H43F` | PASS | True | 0.004869% | Archive file index 3297 |
| `archive:sudoku/m23L8jF87m` | PASS | True | 0.000000% | Archive file index 3300 |
| `archive:sudoku/m2TTpBPtg2` | FAIL | — | — | Archive file index 3302 |

Error for `archive:sudoku/m2TTpBPtg2`: `TimeoutError()`

| `archive:sudoku/m3GGq4Ht96` | FAIL | — | — | Archive file index 3305 |

Error for `archive:sudoku/m3GGq4Ht96`: `TimeoutError()`

| `archive:sudoku/m6JLP2B72M` | FAIL | — | — | Archive file index 3310 |

Error for `archive:sudoku/m6JLP2B72M`: `TimeoutError()`

| `archive:sudoku/mD6BhP3PdT` | PASS | True | 0.009739% | Archive file index 3320 |
| `archive:sudoku/mFgHtTDMDg` | PASS | True | 0.000000% | Archive file index 3322 |
| `archive:sudoku/mGtft8fRN9` | PASS | True | 0.007146% | Archive file index 3326 |
| `archive:sudoku/mHBPJmM8fB` | PASS | True | 0.008657% | Archive file index 3327 |
| `archive:sudoku/mJ3HbD6n9p` | PASS | True | 0.010280% | Archive file index 3329 |
| `archive:sudoku/mJbnFrPFBg` | PASS | True | 0.000000% | Archive file index 3332 |
| `archive:sudoku/mP3tjTNhmF` | PASS | True | 0.000000% | Archive file index 3340 |
| `archive:sudoku/mfL29d7tG7` | PASS | True | 0.000000% | Archive file index 3347 |
| `archive:sudoku/mpphgLMpfg` | PASS | True | 0.001082% | Archive file index 3358 |
| `archive:sudoku/mq6MdnhmtD` | PASS | True | 0.000000% | Archive file index 3359 |
| `archive:sudoku/mr3fHnMfQp` | PASS | True | 0.000000% | Archive file index 3362 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
