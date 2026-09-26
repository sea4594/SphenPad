# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **20** — passed **19**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:6si77ldvw5` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:6y7vhnhdof` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:73oh4m8m8m` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:76L6n8tPhM` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:7FngrT9ftq` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:7d9f9mb2y3` | FAIL | — | — | Deterministic archive sample |

Error for `archive:7d9f9mb2y3`: `TimeoutError()`

| `archive:7gNQ4nBtpn` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:7ls9303nax` | PASS | True | 0.001082% | Deterministic archive sample |
| `archive:7nnwvn08yz` | PASS | True | 0.005410% | Deterministic archive sample |
| `archive:7sf4felfun` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:7v7lat2oxd` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:7yx3e6616s` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:83zpp5gwpt` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:88frf3hrkd` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:8MH7NnDL4d` | PASS | True | 0.010821% | Deterministic archive sample |
| `archive:8ebxp1fhz8` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:8jf1461dp3` | PASS | True | 0.004328% | Deterministic archive sample |
| `archive:8n6RPbqntg` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:8u7avt009b` | PASS | True | 0.003517% | Deterministic archive sample |
| `archive:90n1ck63vq` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
