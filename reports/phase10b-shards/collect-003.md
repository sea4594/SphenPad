# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **25**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:4w0t03s87w` | PASS | True | 0.007574% | Archive file index 300 |
| `archive:4xlxw5wmad` | PASS | True | 0.000000% | Archive file index 301 |
| `archive:4yizx5451j` | PASS | True | 0.000000% | Archive file index 302 |
| `archive:510jy8hqjs` | PASS | True | 0.000000% | Archive file index 304 |
| `archive:55e6o5g53o` | PASS | True | 0.000000% | Archive file index 309 |
| `archive:56zxkbfy2u` | PASS | True | 0.000000% | Archive file index 311 |
| `archive:58u9d7sohd` | PASS | True | 0.000000% | Archive file index 313 |
| `archive:59fo21vx0w` | PASS | True | 0.000000% | Archive file index 315 |
| `archive:5b1du6ra7d` | PASS | True | 0.000000% | Archive file index 316 |
| `archive:5c6uuvchca` | PASS | True | 0.000000% | Archive file index 318 |
| `archive:5kx4d90kcm` | PASS | True | 0.012985% | Archive file index 325 |
| `archive:5ol2he9bbw` | PASS | True | 0.000000% | Archive file index 331 |
| `archive:5or0u7cv0o` | PASS | True | 0.000000% | Archive file index 332 |
| `archive:5qa0a0nbpi` | PASS | True | 0.000000% | Archive file index 333 |
| `archive:5ukl9ip012` | PASS | True | 0.000000% | Archive file index 339 |
| `archive:5vhdcvx1rz` | PASS | True | 0.000000% | Archive file index 341 |
| `archive:60ow3k645m` | PASS | True | 0.005410% | Archive file index 350 |
| `archive:61g1ssiok4` | PASS | True | 0.000000% | Archive file index 352 |
| `archive:65113ete79` | PASS | True | 0.000000% | Archive file index 359 |
| `archive:68jb7y05c9` | PASS | True | 0.000000% | Archive file index 364 |
| `archive:68spijnw4s` | PASS | True | 0.000000% | Archive file index 367 |
| `archive:69x5obq89n` | PASS | True | 0.000000% | Archive file index 369 |
| `archive:6Jg2PBGPBL` | PASS | True | 0.000000% | Archive file index 373 |
| `archive:6gNrFMdqF7` | PASS | True | 0.000000% | Archive file index 381 |
| `archive:6gv40dsdo2` | PASS | True | 0.000000% | Archive file index 385 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
