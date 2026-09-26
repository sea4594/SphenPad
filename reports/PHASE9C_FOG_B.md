# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `progress`

Fixtures: **2** — passed **1**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `progress-triggered-fog` | PASS | True | 0.000000% | Triggered fog link responds to player progress |
| `progress-fog-outside-clue` | FAIL | False | 0.000000% | Dynamic fog plus outside-grid authored clue |

First structural difference for `progress-fog-outside-clue`: `node 2: stock=('mask', {'height': '297.12152099609375', 'id': 'fog-mask-fog', 'maskUnits': 'userSpaceOnUse', 'width': '256', 'x': '0', 'y': '-41.12150573730469'}, '') candidate=('mask', {'height': '296.5187683105469', 'id': 'fog-mask-fog', 'maskUnits': 'userSpaceOnUse', 'width': '256', 'x': '0', 'y': '-40.51874923706055'}, '')`


## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
