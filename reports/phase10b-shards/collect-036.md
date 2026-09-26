# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **25**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:u1u3olem22` | PASS | True | 0.013526% | Archive file index 3652 |
| `archive:u2pnuvnrcy` | PASS | True | 0.000000% | Archive file index 3654 |
| `archive:u3e1puzryz` | PASS | True | 0.000000% | Archive file index 3655 |
| `archive:uoyv9ny78e` | PASS | True | 0.004006% | Archive file index 3673 |
| `archive:upl9la4vp8` | PASS | True | 0.081155% | Archive file index 3675 |
| `archive:ur11o44tv3` | PASS | True | 0.000000% | Archive file index 3677 |
| `archive:utaq8fddwh` | PASS | True | 0.000000% | Archive file index 3684 |
| `archive:uy5efqsnus` | PASS | True | 0.000000% | Archive file index 3688 |
| `archive:uyakkp4064` | PASS | True | 0.000000% | Archive file index 3689 |
| `archive:uz0380wkfg` | PASS | True | 0.000000% | Archive file index 3690 |
| `archive:v2ey7c3lac` | PASS | True | 0.000000% | Archive file index 3695 |
| `archive:vagzppve3v` | PASS | True | 0.000000% | Archive file index 3702 |
| `archive:vlkzbme0k2` | PASS | True | 0.000000% | Archive file index 3713 |
| `archive:vsuh3lbq7r` | PASS | True | 0.003246% | Archive file index 3724 |
| `archive:w3ve69np9y` | PASS | True | 0.000000% | Archive file index 3734 |
| `archive:w5gfd237vx` | PASS | True | 0.000000% | Archive file index 3736 |
| `archive:w6ftuh51wn` | PASS | True | 0.000000% | Archive file index 3737 |
| `archive:w6uzuj1m0m` | PASS | True | 0.000000% | Archive file index 3738 |
| `archive:wa9fbfdl75` | PASS | True | 0.000000% | Archive file index 3739 |
| `archive:wcqbcsw8lr` | PASS | True | 0.000000% | Archive file index 3743 |
| `archive:webapp/29GpBRDJrN` | PASS | True | 0.063571% | Archive file index 3746 |
| `archive:webapp/4FFRfBF9dt` | PASS | True | 0.003246% | Archive file index 3753 |
| `archive:webapp/7Jrg7g4FMF` | PASS | True | 0.000000% | Archive file index 3762 |
| `archive:webapp/9G8mNR8Rj3` | PASS | True | 0.002584% | Archive file index 3770 |
| `archive:webapp/B8hF4G7dfG` | PASS | True | 0.000000% | Archive file index 3774 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
