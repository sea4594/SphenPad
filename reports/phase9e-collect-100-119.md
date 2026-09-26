# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **20** — passed **18**, failed **2**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:M2hm8gQj8p` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:MONOPOLYSUDOKU` | FAIL | — | — | Deterministic archive sample |

Error for `archive:MONOPOLYSUDOKU`: `TimeoutError()`

| `archive:NHRrNJb98h` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:NhTqdGBQLT` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:PMbj498TFt` | PASS | True | 0.000541% | Deterministic archive sample |
| `archive:PrHjg2jqqF` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:QJ2QgfFn9b` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:QqMFNBt872` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:RL7qR4H6QF` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:TB93qrfhjq` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:TRFJDDjmjt` | PASS | True | 0.010821% | Deterministic archive sample |
| `archive:a1yiqbbfh2` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:aaardvutyh` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:adkms6bibp` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:ajb3ccmjg6` | PASS | True | 0.000738% | Deterministic archive sample |
| `archive:atfgvx1pgc` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:aw4ctbznsl` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:b193jegg4x` | FAIL | — | — | Deterministic archive sample |

Error for `archive:b193jegg4x`: `TimeoutError()`

| `archive:b3wa450x40` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:b8jgau28rd` | PASS | True | 0.001623% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
