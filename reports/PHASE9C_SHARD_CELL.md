# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `progress`

Fixtures: **5** — passed **5**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `progress-entered-value` | PASS | True | 0.000000% | Production progress adapter: entered value |
| `progress-center-marks` | PASS | True | 0.000000% | Production progress adapter: center marks |
| `progress-corner-marks` | PASS | True | 0.000000% | Production progress adapter: sorted corner marks |
| `progress-value-precedence` | PASS | True | 0.000000% | Value visually suppresses center/corner marks |
| `progress-given-precedence` | PASS | True | 0.000000% | Outside fog, authored given remains visually authoritative |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
