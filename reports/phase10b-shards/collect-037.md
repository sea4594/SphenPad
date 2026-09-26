# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **25**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:webapp/DghmLf3JQ3` | PASS | True | 0.000541% | Archive file index 3778 |
| `archive:webapp/Fd6j36j2jr` | PASS | True | 0.005410% | Archive file index 3779 |
| `archive:webapp/FptR6QTqQ2` | PASS | True | 0.000000% | Archive file index 3781 |
| `archive:webapp/GtFjLLNbFT` | PASS | True | 0.000000% | Archive file index 3786 |
| `archive:webapp/HHL3h8gDb3` | PASS | True | 0.006492% | Archive file index 3788 |
| `archive:webapp/J27gFDM7pt` | PASS | True | 0.000000% | Archive file index 3791 |
| `archive:webapp/LTR8GR7D84` | PASS | True | 0.000000% | Archive file index 3796 |
| `archive:webapp/M4Hjb83P9G` | PASS | True | 0.000000% | Archive file index 3798 |
| `archive:webapp/N9QqMTQ6fL` | PASS | True | 0.000000% | Archive file index 3800 |
| `archive:webapp/NmLdm7gjPB` | PASS | True | 0.000000% | Archive file index 3801 |
| `archive:webapp/P4fBQGPP64` | PASS | True | 0.000000% | Archive file index 3802 |
| `archive:webapp/P8Tgqq7DPg` | PASS | True | 0.000000% | Archive file index 3803 |
| `archive:webapp/PpQF74L7g3` | PASS | True | 0.000000% | Archive file index 3806 |
| `archive:webapp/QmPQnPpPQB` | PASS | True | 0.000000% | Archive file index 3808 |
| `archive:webapp/R8fnf423Jd` | PASS | True | 0.000000% | Archive file index 3809 |
| `archive:webapp/RGh4Rq7QPH` | PASS | True | 0.000000% | Archive file index 3810 |
| `archive:webapp/RRTmPhL2r6` | PASS | True | 0.000000% | Archive file index 3811 |
| `archive:webapp/T4Tm8DN6PM` | PASS | True | 0.007033% | Archive file index 3812 |
| `archive:webapp/TJqMbbFTgJ` | PASS | True | 0.009739% | Archive file index 3813 |
| `archive:webapp/Tbff7DQgHt` | PASS | True | 0.000000% | Archive file index 3815 |
| `archive:webapp/Tg3Tddfjp3` | PASS | True | 0.000000% | Archive file index 3816 |
| `archive:webapp/b8BtQTBqdd` | PASS | True | 0.000000% | Archive file index 3817 |
| `archive:webapp/dLT2fM8ddJ` | PASS | True | 0.004869% | Archive file index 3824 |
| `archive:webapp/h6p4D32pfD` | PASS | True | 0.031650% | Archive file index 3829 |
| `archive:webapp/m3tfr2RD8J` | PASS | True | 0.001623% | Archive file index 3835 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
