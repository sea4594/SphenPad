# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **20** — passed **19**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:9557h2w0uy` | PASS | True | 0.008115% | Deterministic archive sample |
| `archive:98offhjkjo` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:9ajocm7gjs` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:9gk44l9w5x` | PASS | True | 0.039225% | Deterministic archive sample |
| `archive:9lceh4k7v3` | PASS | True | 0.048693% | Deterministic archive sample |
| `archive:9os1agpdp7` | PASS | True | 0.006492% | Deterministic archive sample |
| `archive:9q8gyvfhpm` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:9snrpdy9fe` | FAIL | — | — | Deterministic archive sample |

Error for `archive:9snrpdy9fe`: `TimeoutError()`

| `archive:9wm6ctm2hv` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:BTGhbHLhJF` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:D34jfpRqTF` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:DdfLMG9fGf` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:F2GHtpdPDm` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:G9J8rDNJtD` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:Gr6P42rgHH` | PASS | True | 0.027322% | Deterministic archive sample |
| `archive:HB7MTHjGmM` | PASS | True | 0.001858% | Deterministic archive sample |
| `archive:Hgnj2QNJPj` | PASS | True | 0.000541% | Deterministic archive sample |
| `archive:J4mGJq6brH` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:JhTTN77p7j` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:LFHbpFpN8r` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
