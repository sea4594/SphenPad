# Phase 9D — F-Puzzles Browser Conversion Matrix

Target: **captured stock SudokuPad 0.612.0**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`

## Result

- **41 / 41 recognized F-Puzzles keys browser-covered.**
- **57 / 57 total converter/subbranch/special fixtures passed.**
- Unknown F-Puzzles keys are verified to emit the compatibility diagnostic and remain ignored for rendering.
- Phase 4 already established **288 / 288** archived F-Puzzles converter-output parity; this phase validates the resulting browser SVG/raster paths.

## Additional converted-input coverage

- Hard-coded `MONOPOLYSUDOKU` background: structural equality and 0 differing pixels.
- Experimental `TmMBJj8jbr` background + thermo suppression: structural equality and 0 differing pixels.
- Explicit `puzzlefont=baublemonogram` setting: mapping/layout path verified.
- Legacy `digitfont=12` → `sevensegment`, combined with dark mode: mapping/layout path verified.
- Exact binary glyph verification for all 13 optional fonts remains Phase 10 because those binaries are absent from the supplied HAR.

## Parity issues found and fixed

1. Stock preserves the nonstandard `textColor` SVG attribute on generic cosmetic rect/text output; SphenPad now preserves it too.
2. The oracle now canonicalizes tiny killer-cage label background width/height values derived from live `getBBox()` metrics, while still comparing label text/cage geometry and raster output.
3. The stock settings harness now exercises historical/experimental source-id behavior and converted-input font-setting plumbing without pretending the missing font binaries were validated.

## Cross-regression

The post-fix regression shard passed `captured-real`, `primitives-outside`, `recognized-features`, and `progress-entered-value`; the captured real fixture remained structural-equal with 0 differing pixels.

## Recognized keys

`size`, `disabledlogic`, `truecandidatesoptions`, `grid`, `author`, `title`, `ruleset`, `solution`, `antiknight`, `antiking`, `nonconsecutive`, `littlekillersum`, `arrow`, `killercage`, `cage`, `fogofwar`, `foglight`, `diagonal+`, `diagonal-`, `ratio`, `difference`, `xv`, `thermometer`, `palindrome`, `sandwichsum`, `even`, `odd`, `extraregion`, `clone`, `quadruple`, `betweenline`, `lockout`, `minimum`, `maximum`, `line`, `rectangle`, `circle`, `text`, `disjointgroups`, `negative`, `triggereffect`

## Fixture results

| Fixture | SVG | Pixel diff | Result |
|---|---:|---:|---:|
| `fpuz-antiking` | True | 0.000000% | PASS |
| `fpuz-antiknight` | True | 0.000000% | PASS |
| `fpuz-arrow` | True | 0.000000% | PASS |
| `fpuz-arrow-customstyle` | True | 0.000000% | PASS |
| `fpuz-arrow-multicell-bulb` | True | 0.000000% | PASS |
| `fpuz-author` | True | 0.000000% | PASS |
| `fpuz-betweenline` | True | 0.000000% | PASS |
| `fpuz-cage` | True | 0.002411% | PASS |
| `fpuz-cage-box-indexer` | True | 0.000000% | PASS |
| `fpuz-cage-column-indexer` | True | 0.000000% | PASS |
| `fpuz-cage-foglight` | True | 0.000000% | PASS |
| `fpuz-cage-fow` | True | 0.000000% | PASS |
| `fpuz-cage-metadata` | True | 0.000000% | PASS |
| `fpuz-cage-row-indexer` | True | 0.000000% | PASS |
| `fpuz-circle` | True | 0.000000% | PASS |
| `fpuz-clone` | True | 0.000000% | PASS |
| `fpuz-diagonal-minus` | True | 0.007234% | PASS |
| `fpuz-diagonal-plus` | True | 0.007234% | PASS |
| `fpuz-difference` | True | 0.000000% | PASS |
| `fpuz-disabledlogic` | True | 0.000000% | PASS |
| `fpuz-disjointgroups` | True | 0.000000% | PASS |
| `fpuz-even` | True | 0.000000% | PASS |
| `fpuz-experimental-tmmb` | True | 0.000000% | PASS |
| `fpuz-extraregion` | True | 0.000000% | PASS |
| `fpuz-foglight` | True | 0.000000% | PASS |
| `fpuz-fogofwar` | True | 0.000000% | PASS |
| `fpuz-font-explicit` | True | 0.000000% | PASS |
| `fpuz-font-legacy-dark` | True | 0.000000% | PASS |
| `fpuz-grid` | True | 0.000000% | PASS |
| `fpuz-grid-null-region` | True | 0.000000% | PASS |
| `fpuz-historical-monopoly` | True | 0.000000% | PASS |
| `fpuz-killercage` | True | 0.002411% | PASS |
| `fpuz-line` | True | 0.000000% | PASS |
| `fpuz-littlekillersum` | True | 0.000000% | PASS |
| `fpuz-lockout` | True | 0.000000% | PASS |
| `fpuz-maximum` | True | 0.000000% | PASS |
| `fpuz-minimum` | True | 0.000000% | PASS |
| `fpuz-negative` | True | 0.000000% | PASS |
| `fpuz-negative-foglight` | True | 0.000000% | PASS |
| `fpuz-nonconsecutive` | True | 0.000000% | PASS |
| `fpuz-odd` | True | 0.000000% | PASS |
| `fpuz-palindrome` | True | 0.000000% | PASS |
| `fpuz-quadruple` | True | 0.000000% | PASS |
| `fpuz-ratio` | True | 0.000000% | PASS |
| `fpuz-rectangle` | True | 0.000000% | PASS |
| `fpuz-ruleset` | True | 0.000000% | PASS |
| `fpuz-sandwichsum` | True | 0.000000% | PASS |
| `fpuz-size` | True | 0.000000% | PASS |
| `fpuz-solution` | True | 0.000000% | PASS |
| `fpuz-text` | True | 0.000000% | PASS |
| `fpuz-text-white` | True | 0.000000% | PASS |
| `fpuz-thermometer` | True | 0.000000% | PASS |
| `fpuz-title` | True | 0.000000% | PASS |
| `fpuz-triggereffect` | True | 0.000000% | PASS |
| `fpuz-truecandidatesoptions` | True | 0.000000% | PASS |
| `fpuz-unknown-key` | True | 0.000000% | PASS |
| `fpuz-xv` | True | 0.000000% | PASS |
