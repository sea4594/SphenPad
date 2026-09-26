# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **24**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:webapp/mPpbBGRQgG` | PASS | True | 0.003787% | Archive file index 3837 |
| `archive:webapp/rH87NM4mrg` | PASS | True | 0.004328% | Archive file index 3848 |
| `archive:webapp/rJt3468PBN` | PASS | True | 0.000000% | Archive file index 3849 |
| `archive:webapp/rpP7FHfLLD` | PASS | True | 0.000000% | Archive file index 3853 |
| `archive:webapp/t9DqTQqbL4` | PASS | True | 0.000000% | Archive file index 3855 |
| `archive:wixrf6c2bx` | PASS | True | 0.000000% | Archive file index 3866 |
| `archive:wm7f10e5fh` | PASS | True | 0.001623% | Archive file index 3868 |
| `archive:wobk83t65m` | PASS | True | 0.000000% | Archive file index 3870 |
| `archive:ws3dy3a8gi` | PASS | True | 0.000000% | Archive file index 3874 |
| `archive:wsu6gvu952` | PASS | True | 0.008115% | Archive file index 3875 |
| `archive:wtvea3yu16` | PASS | True | 0.000000% | Archive file index 3876 |
| `archive:wv01avmfs9` | PASS | True | 0.000000% | Archive file index 3878 |
| `archive:wxbluqtoso` | PASS | True | 0.000000% | Archive file index 3882 |
| `archive:wxkk82qye4` | PASS | True | 0.000000% | Archive file index 3885 |
| `archive:x75we00sgg` | PASS | True | 0.000000% | Archive file index 3900 |
| `archive:xag582l3t0` | FAIL | — | — | Archive file index 3903 |

Error for `archive:xag582l3t0`: `TimeoutError()`

| `archive:xd80bvl2nu` | PASS | True | 0.000000% | Archive file index 3909 |
| `archive:xel56nrbmp` | PASS | True | 0.000000% | Archive file index 3910 |
| `archive:xfim768h1h` | PASS | True | 0.014067% | Archive file index 3912 |
| `archive:xkbz6iw8mm` | PASS | True | 0.008927% | Archive file index 3916 |
| `archive:xnt9jxy2an` | PASS | True | 0.000000% | Archive file index 3923 |
| `archive:xqgzhq4bqn` | PASS | True | 0.000000% | Archive file index 3926 |
| `archive:xug1fmiw9y` | PASS | True | 0.000000% | Archive file index 3930 |
| `archive:y5u0ncu31x` | PASS | True | 0.000000% | Archive file index 3940 |
| `archive:y7x01mea2l` | PASS | True | 0.000000% | Archive file index 3943 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
