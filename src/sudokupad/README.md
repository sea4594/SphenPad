# SudokuPad compatibility layer

This directory is the replacement path for the legacy `core/sudokupad.ts` importer and `GridCanvas.tsx` renderer.

Architecture:

```text
input -> resolver/format decoder -> native source puzzle -> normalization -> SudokuPadScene -> SVG renderer
                                                        -> PuzzleLogic (checker semantics)
```

Rules:

- `SudokuPadScene` is the visual source of truth for the new renderer.
- `PuzzleLogic` is semantic/checker data and must remain independent of drawing.
- Imported scenes are derived from `sourcePayload`; do not persist a duplicate expanded scene.
- Creator puzzles will eventually persist their native scene because it is authored state.
- All source/primitive types are open-ended so unknown safe SudokuPad/SVG fields can survive normalization.
- Rendering feature recognition is transient. Do not serialize SudokuPad's circular `part.feature` references.
- All imported and authored puzzles render from the native SudokuPad-compatible scene. Do not introduce a second rendering model.

Implemented so far:

- Phase 1: native models/scaffolding.
- Phase 2: generic SVG renderer.
- Phase 3: exact native SCL/CTC decoding, PuzzleZipper, metadata/native normalization, legacy opacity and rendering-affecting feature recognition.
- Phase 4: exact F-Puzzles conversion, SCF, packs, format registry, URL/settings parsing, remote-ID resolution and the unified stock-format importer.

Pinned compatibility target: stock SudokuPad 0.612.0.
