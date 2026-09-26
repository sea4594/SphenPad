# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **22**, failed **3**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:HM48mhR9ff` | PASS | True | 0.005197% | Archive file index 646 |
| `archive:HmMdQDq98p` | PASS | True | 0.000000% | Archive file index 651 |
| `archive:HmmDgD66rH` | PASS | True | 0.000000% | Archive file index 652 |
| `archive:JnpJ7TpdPd` | PASS | True | 0.000000% | Archive file index 665 |
| `archive:L9jqGq4Qtq` | FAIL | — | — | Archive file index 667 |

Error for `archive:L9jqGq4Qtq`: `TimeoutError()`

| `archive:LFB3qhjfNB` | PASS | True | 0.002311% | Archive file index 668 |
| `archive:Lf4B9t2p29` | FAIL | — | — | Archive file index 674 |

Error for `archive:Lf4B9t2p29`: `TimeoutError()`

| `archive:LnNgNPRpDL` | PASS | True | 0.005758% | Archive file index 675 |
| `archive:M2hm8gQj8p` | PASS | True | 0.000000% | Archive file index 676 |
| `archive:M7JdLN3P98` | PASS | True | 0.000000% | Archive file index 677 |
| `archive:MDBMQfF877` | PASS | True | 0.000000% | Archive file index 681 |
| `archive:MONOPOLYSUDOKU` | FAIL | — | — | Archive file index 683 |

Error for `archive:MONOPOLYSUDOKU`: `TimeoutError()`

| `archive:Md74JbqTDm` | PASS | True | 0.000000% | Archive file index 685 |
| `archive:N2qRrPLM3b` | PASS | True | 0.000000% | Archive file index 686 |
| `archive:NfJTHg3Q2M` | PASS | True | 0.015149% | Archive file index 694 |
| `archive:PHBrnqT7QJ` | PASS | True | 0.000000% | Archive file index 702 |
| `archive:PNRdJfg8Mr` | PASS | True | 0.000000% | Archive file index 704 |
| `archive:Pf34pB3Rd8` | PASS | True | 0.000000% | Archive file index 707 |
| `archive:PfjHpGmrGR` | PASS | True | 0.000000% | Archive file index 708 |
| `archive:QMtbDHH9mL` | PASS | True | 0.000000% | Archive file index 719 |
| `archive:QQ2JJHHBM8` | PASS | True | 0.000000% | Archive file index 720 |
| `archive:R8fhNnT2HJ` | PASS | True | 0.009198% | Archive file index 724 |
| `archive:RT3gNDfh6H` | PASS | True | 0.000000% | Archive file index 732 |
| `archive:T4FNnnm2RQ` | PASS | True | 0.000000% | Archive file index 736 |
| `archive:TN438mdjj7` | PASS | True | 0.000000% | Archive file index 741 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
