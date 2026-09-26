# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **18**, failed **7**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:kzmsrodbh6` | PASS | True | 0.007845% | Archive file index 1447 |
| `archive:l00604nlbr` | FAIL | — | — | Archive file index 1448 |

Error for `archive:l00604nlbr`: `TimeoutError()`

| `archive:l01qpi8oc3` | FAIL | — | — | Archive file index 1449 |

Error for `archive:l01qpi8oc3`: `TimeoutError()`

| `archive:l7ymh0s7kf` | PASS | True | 0.000000% | Archive file index 1454 |
| `archive:lc3vr050ng` | PASS | True | 0.000000% | Archive file index 1458 |
| `archive:lhid2td2zu` | FAIL | — | — | Archive file index 1459 |

Error for `archive:lhid2td2zu`: `TimeoutError()`

| `archive:lipt9yn6r4` | FAIL | — | — | Archive file index 1460 |

Error for `archive:lipt9yn6r4`: `TimeoutError()`

| `archive:lkmxt8n8dz` | PASS | True | 0.011362% | Archive file index 1463 |
| `archive:lkztmzmo88` | PASS | True | 0.014067% | Archive file index 1464 |
| `archive:lldn0vubxi` | FAIL | — | — | Archive file index 1465 |

Error for `archive:lldn0vubxi`: `TimeoutError()`

| `archive:lqvpt4f0lv` | PASS | True | 0.002705% | Archive file index 1469 |
| `archive:lxla37je17` | PASS | True | 0.000000% | Archive file index 1474 |
| `archive:m2nrLqqt6m` | PASS | True | 0.000000% | Archive file index 1476 |
| `archive:m7fj6dp5si` | PASS | True | 0.007574% | Archive file index 1482 |
| `archive:m7yoyjrok3` | PASS | True | 0.001329% | Archive file index 1483 |
| `archive:mNtG4hF28M` | PASS | True | 0.000000% | Archive file index 1487 |
| `archive:mjek1gdfcg` | PASS | True | 0.000000% | Archive file index 1502 |
| `archive:ml7mbpvpxj` | PASS | True | 0.000000% | Archive file index 1505 |
| `archive:mm4b2w1a65` | PASS | True | 0.052751% | Archive file index 1509 |
| `archive:mmsgaq4ylr` | PASS | True | 0.000000% | Archive file index 1512 |
| `archive:mqx8o45al4` | PASS | True | 0.000000% | Archive file index 1516 |
| `archive:muytgcj0ni` | PASS | True | 0.000000% | Archive file index 1520 |
| `archive:mvqojfwq9a` | FAIL | — | — | Archive file index 1522 |

Error for `archive:mvqojfwq9a`: `TimeoutError()`

| `archive:mwz7l2lvoi` | FAIL | — | — | Archive file index 1525 |

Error for `archive:mwz7l2lvoi`: `TimeoutError()`

| `archive:n13kcw13ck` | PASS | True | 0.000000% | Archive file index 1531 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
