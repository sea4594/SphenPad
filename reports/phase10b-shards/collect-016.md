# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **23**, failed **2**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:n2yv7e76cf` | PASS | True | 0.000000% | Archive file index 1533 |
| `archive:n3s05tso9a` | PASS | True | 0.001082% | Archive file index 1536 |
| `archive:n486ffPb4H` | PASS | True | 0.004328% | Archive file index 1539 |
| `archive:n6HgP4g2rF` | PASS | True | 0.011903% | Archive file index 1545 |
| `archive:n7a6oi1gyy` | PASS | True | 0.000000% | Archive file index 1547 |
| `archive:nQtDb24Tpn` | PASS | True | 0.000000% | Archive file index 1557 |
| `archive:nd0191ecm9` | PASS | True | 0.000000% | Archive file index 1559 |
| `archive:neh0ii8ycb` | PASS | True | 0.000000% | Archive file index 1562 |
| `archive:ng69xsjco3` | PASS | True | 0.007033% | Archive file index 1563 |
| `archive:nhgbbb9rdn` | PASS | True | 0.002568% | Archive file index 1564 |
| `archive:nn9ohqnsnz` | PASS | True | 0.000000% | Archive file index 1574 |
| `archive:npvkzvpizp` | PASS | True | 0.000000% | Archive file index 1578 |
| `archive:ntqufgkvcx` | FAIL | — | — | Archive file index 1582 |

Error for `archive:ntqufgkvcx`: `TimeoutError()`

| `archive:nxbw6uuei0` | PASS | True | 0.000000% | Archive file index 1589 |
| `archive:nxmw997fai` | PASS | True | 0.002436% | Archive file index 1590 |
| `archive:nxt5rs16e9` | PASS | True | 0.002705% | Archive file index 1591 |
| `archive:nz3ntjqn78` | PASS | True | 0.000000% | Archive file index 1593 |
| `archive:nz9u2li1vk` | PASS | True | 0.000000% | Archive file index 1594 |
| `archive:o0m3wgk6gp` | PASS | True | 0.000000% | Archive file index 1595 |
| `archive:o4u3kz1764` | FAIL | — | — | Archive file index 1600 |

Error for `archive:o4u3kz1764`: `TimeoutError()`

| `archive:o6x08u2omv` | PASS | True | 0.000000% | Archive file index 1601 |
| `archive:o7ukhot5zh` | PASS | True | 0.000000% | Archive file index 1602 |
| `archive:ocw0x2hxdd` | PASS | True | 0.000000% | Archive file index 1606 |
| `archive:ofafbe2382` | PASS | True | 0.000000% | Archive file index 1610 |
| `archive:oiqfym9ehw` | PASS | True | 0.000000% | Archive file index 1613 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
