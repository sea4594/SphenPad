# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **25**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:gfr7xipywo` | PASS | True | 0.000000% | Archive file index 1198 |
| `archive:gfx29v36nv` | PASS | True | 0.000000% | Archive file index 1199 |
| `archive:ggnPfBHNrT` | PASS | True | 0.000000% | Archive file index 1200 |
| `archive:gh20vntsxl` | PASS | True | 0.000000% | Archive file index 1201 |
| `archive:giuk6t4rfg` | PASS | True | 0.002214% | Archive file index 1203 |
| `archive:gjwn9e0c5u` | PASS | True | 0.000000% | Archive file index 1204 |
| `archive:gtbtt6llob` | PASS | True | 0.000000% | Archive file index 1214 |
| `archive:h1zrlsc75s` | PASS | True | 0.000000% | Archive file index 1220 |
| `archive:h2sdbmic8x` | PASS | True | 0.000000% | Archive file index 1221 |
| `archive:h3oqqmu2wp` | PASS | True | 0.000000% | Archive file index 1222 |
| `archive:h9w1mp7gmd` | PASS | True | 0.000000% | Archive file index 1226 |
| `archive:hFtf3bNPn8` | PASS | True | 0.000000% | Archive file index 1228 |
| `archive:hTmNgdNbdt` | PASS | True | 0.000000% | Archive file index 1232 |
| `archive:hc775p3w0o` | PASS | True | 0.029757% | Archive file index 1236 |
| `archive:he396mr00y` | PASS | True | 0.000000% | Archive file index 1238 |
| `archive:hgtT6hP4GJ` | PASS | True | 0.016231% | Archive file index 1241 |
| `archive:hm38DDftrd` | PASS | True | 0.000000% | Archive file index 1246 |
| `archive:hr3yy4ec3p` | PASS | True | 0.000000% | Archive file index 1258 |
| `archive:hrinu3frw3` | PASS | True | 0.000000% | Archive file index 1260 |
| `archive:hrsm0gqb5o` | PASS | True | 0.027863% | Archive file index 1261 |
| `archive:htkeovqz4k` | PASS | True | 0.005951% | Archive file index 1264 |
| `archive:hvqwgq1bqo` | PASS | True | 0.000000% | Archive file index 1267 |
| `archive:hxw93rhz53` | PASS | True | 0.000000% | Archive file index 1271 |
| `archive:i08b8g32oc` | PASS | True | 0.000000% | Archive file index 1275 |
| `archive:i0lz556ia7` | PASS | True | 0.000000% | Archive file index 1277 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
