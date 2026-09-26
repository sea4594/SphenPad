# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **15**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:23xbq0xofa` | PASS | True | 0.025428% | Deterministic archive sample |
| `archive:27qnv0oduh` | PASS | True | 0.008115% | Deterministic archive sample |
| `archive:29pegnk9xe` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:2b6nrvt81y` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:2e89u1hmiw` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:2i3vnmx1ye` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:2mltluk4bn` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:2oxam110an` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:2susajautc` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:2vyqqhy6ky` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:30jk32po6i` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:34vev6zoay` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:3D64nRR387` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:3a0z38vzgq` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:3cnbyztbq0` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
