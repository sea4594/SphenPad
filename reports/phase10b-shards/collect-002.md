# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **24**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:3gdgz1a4il` | PASS | True | 0.000000% | Archive file index 208 |
| `archive:3gkoee7rau` | PASS | True | 0.000000% | Archive file index 209 |
| `archive:3jqijal91m` | PASS | True | 0.010280% | Archive file index 213 |
| `archive:3l6bzhg2ji` | PASS | True | 0.000000% | Archive file index 215 |
| `archive:3ma2z9n9lr` | PASS | True | 0.008115% | Archive file index 216 |
| `archive:3qz1km5o1d` | PASS | True | 0.000000% | Archive file index 225 |
| `archive:3yhq2n7z2q` | PASS | True | 0.000000% | Archive file index 239 |
| `archive:3yyqe1we8y` | PASS | True | 0.000000% | Archive file index 240 |
| `archive:44t9pol5x3` | PASS | True | 0.000541% | Archive file index 247 |
| `archive:46bismbam8` | PASS | True | 0.000000% | Archive file index 248 |
| `archive:4761am7zw5` | PASS | True | 0.000000% | Archive file index 250 |
| `archive:47mfkmst0b` | PASS | True | 0.000000% | Archive file index 251 |
| `archive:4HQfd437LD` | PASS | True | 0.009549% | Archive file index 257 |
| `archive:4RFJTgRBQ2` | PASS | True | 0.000000% | Archive file index 259 |
| `archive:4b16rwzym1` | FAIL | — | — | Archive file index 261 |

Error for `archive:4b16rwzym1`: `TimeoutError()`

| `archive:4bdcevn6ms` | PASS | True | 0.000541% | Archive file index 262 |
| `archive:4dszmln0se` | PASS | True | 0.000000% | Archive file index 265 |
| `archive:4ev7ufnh17` | PASS | True | 0.000000% | Archive file index 267 |
| `archive:4ftr2ntfg4` | PASS | True | 0.002164% | Archive file index 270 |
| `archive:4i0mviwdne` | PASS | True | 0.000000% | Archive file index 276 |
| `archive:4keyz4eat2` | PASS | True | 0.003692% | Archive file index 280 |
| `archive:4mlp7jvob1` | PASS | True | 0.000000% | Archive file index 282 |
| `archive:4mtPGFb6dm` | PASS | True | 0.000000% | Archive file index 283 |
| `archive:4p33ukq3kd` | PASS | True | 0.000000% | Archive file index 286 |
| `archive:4swipiexba` | PASS | True | 0.000000% | Archive file index 294 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
