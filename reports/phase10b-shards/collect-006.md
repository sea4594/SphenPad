# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **23**, failed **2**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:9jdtqgDPTP` | PASS | True | 0.000000% | Archive file index 566 |
| `archive:9lceh4k7v3` | PASS | True | 0.050316% | Archive file index 568 |
| `archive:9mqofo6f7g` | PASS | True | 0.000000% | Archive file index 570 |
| `archive:9onywsf67u` | PASS | True | 0.000000% | Archive file index 574 |
| `archive:9pbfrrmznf` | PASS | True | 0.000000% | Archive file index 577 |
| `archive:9q6g79ru09` | PASS | True | 0.000000% | Archive file index 579 |
| `archive:9q82og2xas` | PASS | True | 0.000000% | Archive file index 580 |
| `archive:9snrpdy9fe` | FAIL | — | — | Archive file index 588 |

Error for `archive:9snrpdy9fe`: `TimeoutError()`

| `archive:9sxe7q81rb` | PASS | True | 0.084130% | Archive file index 589 |
| `archive:9tt24bqtnq` | PASS | True | 0.000000% | Archive file index 593 |
| `archive:BbJhQR4qrf` | PASS | True | 0.000000% | Archive file index 603 |
| `archive:Bqqp8Fr3PH` | PASS | True | 0.000000% | Archive file index 607 |
| `archive:BtghmrqfDb` | PASS | True | 0.000000% | Archive file index 608 |
| `archive:D34jfpRqTF` | PASS | True | 0.000000% | Archive file index 609 |
| `archive:DGJbq8gmpF` | PASS | True | 0.015149% | Archive file index 612 |
| `archive:DPQ9GBg94B` | PASS | True | 0.000000% | Archive file index 613 |
| `archive:DdfLMG9fGf` | PASS | True | 0.000000% | Archive file index 615 |
| `archive:DmdGJNbj22` | PASS | True | 0.000000% | Archive file index 618 |
| `archive:Dt3rqrQPGR` | FAIL | — | — | Archive file index 619 |

Error for `archive:Dt3rqrQPGR`: `TimeoutError()`

| `archive:F28G66PTLg` | PASS | True | 0.000000% | Archive file index 621 |
| `archive:F9fHgrQqQF` | PASS | True | 0.007574% | Archive file index 623 |
| `archive:FdDGGJQf7R` | PASS | True | 0.000000% | Archive file index 627 |
| `archive:G2djRnp9tm` | PASS | True | 0.000000% | Archive file index 628 |
| `archive:H66NhnG9mm` | PASS | True | 0.000000% | Archive file index 639 |
| `archive:HGGjr3NDm4` | PASS | True | 0.000000% | Archive file index 645 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
