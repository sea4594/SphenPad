# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **20** — passed **20**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:00r3q84657` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:12bkbyft2r` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:1p9vh22zea` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:27qnv0oduh` | PASS | True | 0.008115% | Deterministic archive sample |
| `archive:2oxam110an` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:3a0z38vzgq` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:3uz3y611dl` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:4ftr2ntfg4` | PASS | True | 0.002164% | Deterministic archive sample |
| `archive:510jy8hqjs` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:5u9hvqo4on` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:6GhDq9bDFL` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:6si77ldvw5` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:7gNQ4nBtpn` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:83zpp5gwpt` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:8n6RPbqntg` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:9ajocm7gjs` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:9wm6ctm2hv` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:G9J8rDNJtD` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:JhTTN77p7j` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:PMbj498TFt` | PASS | True | 0.000541% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
