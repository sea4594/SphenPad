# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **20** — passed **20**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:4ftr2ntfg4` | PASS | True | 0.002164% | Deterministic archive sample |
| `archive:4jjr2ooiit` | PASS | True | 0.003246% | Deterministic archive sample |
| `archive:4o3b5oqvf2` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:4qt4n1bnz3` | PASS | True | 0.010821% | Deterministic archive sample |
| `archive:4tc1g21b3x` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:510jy8hqjs` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:56zxkbfy2u` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:5c6uuvchca` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:5kx4d90kcm` | PASS | True | 0.012985% | Deterministic archive sample |
| `archive:5ol2he9bbw` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:5u9hvqo4on` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:5yfegmxam3` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:61g1ssiok4` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:64pxbo25nr` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:68n5ump3ql` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:6GhDq9bDFL` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:6f3k4btidk` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:6gv40dsdo2` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:6jFtNj83pm` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:6o5zvf29rt` | PASS | True | 0.004328% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
