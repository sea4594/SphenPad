# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **22**, failed **3**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:bpxci0jt2o` | PASS | True | 0.000000% | Archive file index 873 |
| `archive:btl00ki232` | PASS | True | 0.000000% | Archive file index 880 |
| `archive:bupkl5df4h` | PASS | True | 0.000000% | Archive file index 882 |
| `archive:bwevls7kjx` | PASS | True | 0.000000% | Archive file index 884 |
| `archive:by04qqkuna` | PASS | True | 0.000000% | Archive file index 887 |
| `archive:bz66g9hv44` | PASS | True | 0.015149% | Archive file index 890 |
| `archive:bzxfyaldby` | PASS | True | 0.019477% | Archive file index 891 |
| `archive:c0tbslozh0` | PASS | True | 0.000000% | Archive file index 892 |
| `archive:c2yc4u9yl1` | FAIL | — | — | Archive file index 897 |

Error for `archive:c2yc4u9yl1`: `TimeoutError()`

| `archive:cdifwlxo10` | FAIL | — | — | Archive file index 911 |

Error for `archive:cdifwlxo10`: `TimeoutError()`

| `archive:cewxiqqtgm` | PASS | True | 0.018125% | Archive file index 915 |
| `archive:ceyt69ga5p` | PASS | True | 0.002164% | Archive file index 916 |
| `archive:cf66mq38as` | PASS | True | 0.005354% | Archive file index 917 |
| `archive:ck24rsi50z` | PASS | True | 0.000000% | Archive file index 924 |
| `archive:crekl5kk58` | PASS | True | 0.000000% | Archive file index 932 |
| `archive:cum7kp045w` | PASS | True | 0.000000% | Archive file index 939 |
| `archive:cveeva5iz3` | PASS | True | 0.002164% | Archive file index 940 |
| `archive:d21nrto778` | PASS | True | 0.000000% | Archive file index 946 |
| `archive:d3MqnbrJqQ` | PASS | True | 0.000000% | Archive file index 948 |
| `archive:da3cezx5at` | PASS | True | 0.058992% | Archive file index 967 |
| `archive:db1522df7f` | PASS | True | 0.001082% | Archive file index 970 |
| `archive:dg8irdpkl3` | PASS | True | 0.000000% | Archive file index 980 |
| `archive:dk0wreok2y` | PASS | True | 0.000000% | Archive file index 985 |
| `archive:dndxixp4qb` | PASS | True | 0.000000% | Archive file index 989 |
| `archive:dqu2xb1itj` | FAIL | — | — | Archive file index 996 |

Error for `archive:dqu2xb1itj`: `TimeoutError()`


## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
