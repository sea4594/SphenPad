# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **24**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:27v1lv24c3` | FAIL | — | — | Archive file index 109 |

Error for `archive:27v1lv24c3`: `TimeoutError()`

| `archive:28d8kmh1jf` | PASS | True | 0.000000% | Archive file index 111 |
| `archive:2ba20kauml` | PASS | True | 0.024617% | Archive file index 123 |
| `archive:2dpL9GLQnB` | PASS | True | 0.000000% | Archive file index 126 |
| `archive:2hk0wen7pj` | PASS | True | 0.000000% | Archive file index 133 |
| `archive:2i3vnmx1ye` | PASS | True | 0.000000% | Archive file index 135 |
| `archive:2l8u234v2c` | PASS | True | 0.007304% | Archive file index 139 |
| `archive:2mcr6exf3p` | PASS | True | 0.002705% | Archive file index 141 |
| `archive:2mltluk4bn` | PASS | True | 0.000000% | Archive file index 142 |
| `archive:2p785kmt7f` | PASS | True | 0.000000% | Archive file index 152 |
| `archive:2qstow5gy2` | PASS | True | 0.000000% | Archive file index 153 |
| `archive:2th0gtj8e1` | PASS | True | 0.000000% | Archive file index 157 |
| `archive:2ts0g02hfp` | PASS | True | 0.000000% | Archive file index 158 |
| `archive:2yiw0yc01y` | PASS | True | 0.004869% | Archive file index 165 |
| `archive:2zohak8sgm` | PASS | True | 0.000000% | Archive file index 167 |
| `archive:2zpmxlxrge` | PASS | True | 0.000000% | Archive file index 168 |
| `archive:3141fzvlnl` | PASS | True | 0.000000% | Archive file index 171 |
| `archive:34d3ku00r2` | PASS | True | 0.000000% | Archive file index 175 |
| `archive:36fnN33h7L` | PASS | True | 0.000866% | Archive file index 178 |
| `archive:3MGDd6Tg8q` | PASS | True | 0.000000% | Archive file index 187 |
| `archive:3ahh9s2agf` | PASS | True | 0.046529% | Archive file index 190 |
| `archive:3bo6pr2r62` | PASS | True | 0.000000% | Archive file index 194 |
| `archive:3cm1bpm2jv` | PASS | True | 0.000000% | Archive file index 195 |
| `archive:3dtkgwg47h` | PASS | True | 0.003787% | Archive file index 202 |
| `archive:3fb9325t0p` | PASS | True | 0.000000% | Archive file index 207 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
