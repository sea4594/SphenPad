# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `progress`

Fixtures: **3** — passed **2**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `progress-fog-correct-reveal` | PASS | True | 0.000000% | Correct player value dynamically reveals ordinary fog |
| `progress-fog-wrong-no-reveal` | PASS | True | 0.000000% | Incorrect player value does not reveal solution-backed fog |
| `progress-deep-fog-hidden-given` | FAIL | False | 4.783951% | Re-entering a hidden given reveals that cell and renders player value in the unmasked value layer |

First structural difference for `progress-deep-fog-hidden-given`: `node 10: stock=('path', {'d': 'M64 0 L160 0 L256 0 L256 96 L256 160 L256 256 L160 256 L96 256 L0 256 L0 160 L0 64 L64 64 Z', 'vector-effect': 'non-scaling-stroke'}, '') candidate=('path', {'d': 'M0 0 L96 0 L160 0 L256 0 L256 96 L256 160 L256 256 L160 256 L96 256 L0 256 L0 160 L0 96 Z', 'vector-effect': 'non-scaling-stroke'}, '')`


## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
