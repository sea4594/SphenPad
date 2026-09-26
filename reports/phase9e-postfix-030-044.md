# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **15**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:3eipqnv8xm` | PASS | True | 0.019477% | Deterministic archive sample |
| `archive:3i3xlin7gl` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:3ma2z9n9lr` | PASS | True | 0.008115% | Deterministic archive sample |
| `archive:3pev731294` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:3uz3y611dl` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:3xnydynuih` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:420s9bg0dc` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:4761am7zw5` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:4HQfd437LD` | PASS | True | 0.009549% | Deterministic archive sample |
| `archive:4ctb5mbrk8` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:4ftr2ntfg4` | PASS | True | 0.002164% | Deterministic archive sample |
| `archive:4jjr2ooiit` | PASS | True | 0.003246% | Deterministic archive sample |
| `archive:4o3b5oqvf2` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:4qt4n1bnz3` | PASS | True | 0.010821% | Deterministic archive sample |
| `archive:4tc1g21b3x` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
