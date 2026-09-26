# Phase 11E — Line/path constraint authoring

Date: 2026-09-25
Status: COMPLETE for the Phase 11E handoff scope.

## Scope completed

Phase 11E extends the Phase 11D generic object/property system with native semantic authoring for SudokuMaker's line/path family. It keeps `CreatorProject` as the authoring source of truth and the existing `PuzzleDefinition` + `SudokuPadScene` + `PuzzleLogic` bridge as the runtime representation.

Implemented authoring families:

- Thermometer, including the upstream slow-thermometer variant.
- Whisper with configurable minimum difference and German/Dutch presets derived from the current digit count.
- Renban.
- Palindrome.
- Between Line.
- Region Sum Line, including the upstream repeated-region/single-region-total option.
- Sequence Line with arbitrary constant difference, including zero.
- Grouped/Entropy Line with editable disjoint digit groups, plus Entropic, 3-Modular, and Parity presets.
- Lockout Line with digit-count-derived endpoint minimum difference.
- Arrow with configurable bulb-cell count.
- Double Arrow.

## Path editing

Line objects are created from the ordered current cell selection. Existing line objects can replace their complete path from the current selection or reverse their path. Rebuilding a path preserves the object's stable constraint ID and common visual appearance settings while regenerating family-specific endpoint/bulb/arrow graphics.

Fine-grained mouse/drag point editing, snapping, and advanced path manipulation remain in Phase 11K as specified by the handoff.

## Properties and parity details

The Phase 11E inspector adds semantic properties beyond the generic Phase 11D appearance controls:

- Thermometer: standard vs slow behavior.
- Whisper: German, Dutch, or custom minimum difference.
- Region Sum Line: combine repeated visits to the same region into one region total.
- Grouped lines: editable `|`-separated disjoint digit groups.
- Arrow: bulb cell count.
- Sequence/Between/Lockout/Double Arrow: rule-specific property help while retaining generic appearance controls.

The defaults were derived from the supplied SudokuMaker deployed bundle, including digit-count-dependent German/Dutch whisper and Lockout values rather than assuming a 1–9 grid.

## Compatibility

Phase 10D/11D creator files may contain generic line constraint types such as `slow-thermometers`, `between-lines`, `3-modular-lines`, or `double-arrows`. `normalizeCreatorLineConstraints` converts these records to the Phase 11E semantic types on creator load/save/check while preserving source element identity, path, stable object ID, and existing visuals.

## Validation added in 11E

Creator validation now checks authored/given values against the implemented line semantics when the relevant cells are populated. It covers strict/slow thermometers, whispers, renban, palindrome, between lines, region-sum lines, sequence lines, grouped lines, lockout lines, arrows, and double arrows. It also reports malformed line paths, impossible arrow bulb/shaft structure, and invalid/overlapping grouped-line digit groups.

This is authoring-time validation only. The SudokuMaker-equivalent worker APIs, full-grid diagnostics, and solver-backed validation remain Phase 11H.
