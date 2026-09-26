# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **22**, failed **3**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:okh6idt7fe` | PASS | True | 0.000000% | Archive file index 1616 |
| `archive:okwmaphg80` | PASS | True | 0.000000% | Archive file index 1617 |
| `archive:ot5h01fnjr` | PASS | True | 0.000000% | Archive file index 1628 |
| `archive:p21cjfonte` | PASS | True | 0.002164% | Archive file index 1637 |
| `archive:p4HNq6LPFg` | PASS | True | 0.000000% | Archive file index 1640 |
| `archive:p676oglsv8` | FAIL | — | — | Archive file index 1643 |

Error for `archive:p676oglsv8`: `TimeoutError()`

| `archive:p683PqhgHD` | PASS | True | 0.000000% | Archive file index 1644 |
| `archive:p6s6me7gcf` | FAIL | — | — | Archive file index 1647 |

Error for `archive:p6s6me7gcf`: `TimeoutError()`

| `archive:p8ushghwpc` | FAIL | — | — | Archive file index 1650 |

Error for `archive:p8ushghwpc`: `TimeoutError()`

| `archive:pHtP9fR3gB` | PASS | True | 0.012985% | Archive file index 1653 |
| `archive:pd589n0d3g` | PASS | True | 0.006492% | Archive file index 1663 |
| `archive:pdnc0ckv87` | PASS | True | 0.000000% | Archive file index 1665 |
| `archive:pgLhjFH3bR` | PASS | True | 0.000000% | Archive file index 1670 |
| `archive:pgbxx02f1l` | PASS | True | 0.000000% | Archive file index 1671 |
| `archive:pmv1jze5n3` | PASS | True | 0.000000% | Archive file index 1677 |
| `archive:pnyv6sn7qm` | PASS | True | 0.000000% | Archive file index 1681 |
| `archive:prGPj6tpT8` | PASS | True | 0.000000% | Archive file index 1687 |
| `archive:prg8idgvw2` | PASS | True | 0.000000% | Archive file index 1688 |
| `archive:pxw6dzgcdp` | PASS | True | 0.000000% | Archive file index 1692 |
| `archive:pyv0ykw8h5` | PASS | True | 0.003246% | Archive file index 1695 |
| `archive:pz0m04p9ag` | PASS | True | 0.000000% | Archive file index 1697 |
| `archive:q2mRJFjH9r` | PASS | True | 0.000000% | Archive file index 1703 |
| `archive:q5iopoxvbm` | PASS | True | 0.000000% | Archive file index 1706 |
| `archive:q6rcz0d0og` | PASS | True | 0.000000% | Archive file index 1709 |
| `archive:q7khd7z32d` | PASS | True | 0.033273% | Archive file index 1711 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
