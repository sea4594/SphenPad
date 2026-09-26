# SudokuPad 0.612.0 Renderer Conformance Checklist

Use this checklist to decide when an independent implementation can reasonably claim compatibility with the captured stock SudokuPad build.

## Payload resolution
- [ ] Unprefixed SudokuPad short IDs resolve through local API, legacy proxy, then Firebase fallback.
- [ ] `scl` supported.
- [ ] `ctc` alias supported.
- [ ] `fpuz` supported.
- [ ] `fpuzzles` alias supported.
- [ ] `scf` supported.
- [ ] `pack` supported.
- [ ] Unknown/unrecognized payloads fail loudly rather than silently rendering partial data.

## SCL/CTC
- [ ] PuzzleZipper property map matches.
- [ ] Empty-array removal matches.
- [ ] boolean compacting matches.
- [ ] integer-string compacting matches.
- [ ] color compacting matches.
- [ ] quote transform matches.
- [ ] outer compression/decompression matches.
- [ ] Captured payload round-trip tests pass.

## F-Puzzles
- [x] Every recognized key in `FPUZZLES_RECOGNIZED_KEYS` has a fixture.
- [x] Primary importer processing order matches.
- [x] regions match.
- [x] given values match.
- [x] center/corner marks match.
- [x] cell colors match.
- [x] arrows/bulbs match.
- [x] killer cages match.
- [x] generic cages match.
- [x] little killers match.
- [x] ratio/difference dots match.
- [x] XV matches.
- [x] thermometers match.
- [x] palindromes match.
- [x] sandwich sums match.
- [x] odd/even match.
- [x] extra regions match.
- [x] clones match.
- [x] quadruples match.
- [x] between lines match.
- [x] min/max match.
- [x] generic lines match.
- [x] rectangles/circles/text cosmetics match.
- [x] disjoint groups/global rules retained.
- [x] foglight/fogofwar/triggereffect match.
- [x] unknown F-Puzzles keys are logged.

## Native scene graph
- [ ] Cells preserved.
- [ ] Regions preserved.
- [ ] Cages preserved.
- [ ] Lines preserved.
- [ ] Arrows preserved.
- [ ] Underlays preserved.
- [ ] Overlays preserved.
- [ ] Metadata + legacy metaData preserved.
- [ ] Fog fields preserved.
- [ ] Global fields preserved.
- [ ] Unknown fields preserved.

## SVG root
- [ ] Cell size is 64 units.
- [ ] All 14 layers exist.
- [ ] Layer order exactly matches captured HTML.
- [ ] Elements append to correct target groups.

## Generic SVG
- [ ] Safe unknown SVG attributes pass through.
- [ ] `on*` attributes rejected.
- [ ] x/y/width/height rounding matches.
- [ ] multiline text matches.

## Lines
- [ ] Waypoint-to-path transform matches.
- [ ] linecap round.
- [ ] linejoin round.
- [ ] explicit `d` works.
- [ ] thickness=1 compatibility mutation tested.
- [ ] outside-grid paths work.
- [ ] fractional coordinates work.

## Arrows
- [ ] stroke arrowhead.
- [ ] filled arrowhead.
- [ ] default/custom headLength.
- [ ] headAngle.
- [ ] headIndent.
- [ ] endpoint retraction.
- [ ] marker units/sizing.
- [ ] short segments.
- [ ] opacity.

## Rectangles/graphics
- [ ] fill/stroke defaults.
- [ ] borderSize precedence.
- [ ] border == fill suppression.
- [ ] geometry formula.
- [ ] rotation.
- [ ] rounded default radius.
- [ ] explicit roundedRadius.
- [ ] opacity.
- [ ] safe extra SVG attributes.

## Text
- [ ] color/fill normalization.
- [ ] textStroke normalization.
- [ ] textAnchor normalization.
- [ ] default offsets.
- [ ] font size.
- [ ] rotation.
- [ ] maxWidth/textLength behavior.
- [ ] small-text background box.
- [ ] multiline tspans.
- [ ] black/white CSS variable normalization.

## Cages
- [ ] cell-set outline algorithm ported exactly.
- [ ] single-cell outline.
- [ ] rectangular outline.
- [ ] concave outline.
- [ ] disconnected outline.
- [ ] killer style.
- [ ] box style.
- [ ] windoku style.
- [ ] extra-region style.
- [ ] F-Puzzles indexer styles.
- [ ] labels.
- [ ] long labels/max width.
- [ ] hidden/no-style behavior.

## Grid/cells
- [ ] rows = cells.length.
- [ ] cols = max row length.
- [ ] grid path matches.
- [ ] standard region boxes match.
- [ ] given font/position.
- [ ] entered value font/position.
- [ ] candidate rendering.
- [ ] pencilmark rendering.
- [ ] source-given candidate/corner classes.
- [ ] zero-is-ten.
- [ ] precedence hiding marks.
- [ ] player color wedges if interactive.
- [ ] pen drawings if interactive.

## Feature recognition
- [ ] Kropki.
- [ ] XV.
- [ ] arrow sum.
- [ ] little killer.
- [ ] inequality.
- [ ] sandwich cage.
- [ ] palindrome.
- [ ] Sudoku-X.
- [ ] Windoku.
- [ ] cosmetic/global recognition needed by downstream behavior.
- [ ] unknown feature warning.

## Ordering / opacity
- [ ] default arrows vs lines order.
- [ ] `arrowsabovelines` order.
- [ ] legacy opacity behavior.
- [ ] same-layer insertion order preserved.

## Fog
- [ ] initial foglight.
- [ ] ordinary correct-value 3x3 reveal.
- [ ] edge/corner clipping.
- [ ] triggered fog.
- [ ] clue hiding.
- [ ] fogged layer list exact.
- [ ] mask geometry.
- [ ] final fog edge colors/widths.
- [ ] FOGLIGHT cage compatibility.
- [ ] animation can be omitted only if static final-state compatibility is the goal.

## Background / emoji / bounds
- [ ] payload background image.
- [ ] opacity parsing/clamping.
- [ ] target layer.
- [ ] image covers full viewBox.
- [ ] `preserveAspectRatio=none`.
- [ ] hide-background setting if supported.
- [ ] Twemoji replacement if enabled.
- [ ] content-based viewBox includes outside clues.
- [ ] strokes and markers included in bounds.
- [ ] padding/snapping matches.

## Settings
- [ ] canonical settings profile documented.
- [ ] light mode.
- [ ] dark mode if promised.
- [ ] large digits if promised.
- [ ] alternate marks if promised.
- [ ] hide colors if promised.
- [ ] dashed/no grid if promised.
- [ ] digit/line outlines if promised.
- [ ] arrows-above-lines if promised.
- [ ] puzzle font if promised.
- [ ] emoji toggle if promised.

## Historical compatibility
- [ ] `NJbPwMVNwZ` ID-specific background behavior decided.
- [ ] `MONOPOLYSUDOKU` ID-specific background behavior decided.
- [ ] experimental-only ID exceptions explicitly in/out of scope.

## Differential testing
- [x] Same pinned Chromium/browser for reference and candidate.
- [x] Same fonts. — Phase 10A verified and SHA-256 pinned all 13 exact upstream font binaries.
- [x] SVG structural normalizer.
- [x] Ignore generated marker IDs in comparisons.
- [x] Geometry comparison tolerance defined.
- [x] Raster threshold defined.
- [x] 100+ synthetic unit fixtures.
- [x] combinational fixtures.
- [x] 500+ real-puzzle regression corpus. — Phase 9E: 519 successful unique comparisons. Phase 10B then attempted a fixed 1,000-puzzle sample (21 prior heavies + 979 seeded random archive puzzles), with 982 definitive passing stock-vs-SphenPad comparisons and 18 explicitly performance-unresolved cases.
- [x] zero unexplained unknown fields. — Remaining retained unknowns are explicitly classified: native `settings`/`norowcol` preservation and F-Puzzles keys the pinned stock converter also does not consume; Phase 4 remains exact on all 288 archived F-Puzzles payloads.
- [x] zero unexplained unknown rendering features. — Captured feature audit covers 37/37 modules; all finite authored SVG-affecting features are implemented, with arbitrary user plugins explicitly outside the finite contract.

## Compatibility statement
- [x] Clearly says target is stock SudokuPad 0.612.0.
- [x] Clearly says arbitrary user-installed JS plugins are outside core guarantee.
- [x] Clearly says future SudokuPad updates trigger a re-audit. — Phase 10C pins 67 JS/CSS resources + 13 fonts and provides an upstream-drift detector that never auto-rebases the target.
