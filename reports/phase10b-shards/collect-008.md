# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **22**, failed **3**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:TetrisSudokuTrevorNicholas` | PASS | True | 0.027191% | Archive file index 746 |
| `archive:a15tt4jnj4` | PASS | True | 0.077432% | Archive file index 750 |
| `archive:aejjn7fm52` | PASS | True | 0.000000% | Archive file index 765 |
| `archive:afp5pakhmr` | PASS | True | 0.000000% | Archive file index 767 |
| `archive:anfigouctj` | PASS | True | 0.000000% | Archive file index 773 |
| `archive:arxojcplun` | PASS | True | 0.000000% | Archive file index 775 |
| `archive:atbh8bj6bp` | PASS | True | 0.000000% | Archive file index 777 |
| `archive:ays2k7hm6t` | FAIL | — | — | Archive file index 788 |

Error for `archive:ays2k7hm6t`: `TimeoutError()`

| `archive:b193jegg4x` | FAIL | — | — | Archive file index 791 |

Error for `archive:b193jegg4x`: `TimeoutError()`

| `archive:b2lc8walej` | PASS | True | 0.000000% | Archive file index 795 |
| `archive:b4eoe6njxe` | PASS | True | 0.067629% | Archive file index 799 |
| `archive:bBR8Rj8Ng7` | PASS | True | 0.003787% | Archive file index 808 |
| `archive:bBrphQNn66` | PASS | True | 0.000000% | Archive file index 809 |
| `archive:bTddT728fG` | PASS | True | 0.000000% | Archive file index 817 |
| `archive:bgDhfmrfN4` | PASS | True | 0.000000% | Archive file index 828 |
| `archive:bhHj7B2DfN` | PASS | True | 0.000000% | Archive file index 829 |
| `archive:blobz/chasing-arrows` | PASS | True | 0.000000% | Archive file index 840 |
| `archive:blobz/good-and-plenty` | PASS | True | 0.000000% | Archive file index 847 |
| `archive:blobz/lynx` | PASS | True | 0.000000% | Archive file index 851 |
| `archive:blobz/oil-water-kropki` | PASS | True | 0.002164% | Archive file index 855 |
| `archive:blobz/orchard` | PASS | True | 0.007574% | Archive file index 856 |
| `archive:blobz/the-continental` | PASS | True | 0.000541% | Archive file index 862 |
| `archive:bmh85ce33k` | FAIL | — | — | Archive file index 866 |

Error for `archive:bmh85ce33k`: `TimeoutError()`

| `archive:bnL6qqT9DT` | PASS | True | 0.007146% | Archive file index 867 |
| `archive:bofuhbwz6i` | PASS | True | 0.039225% | Archive file index 870 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
