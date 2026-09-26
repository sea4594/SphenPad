# Phase 11D — Generic authored-object editing and cosmetics

Phase 11D adds a generic object layer on top of the existing `CreatorProject` -> `PuzzleDefinition`/`SudokuPadScene`/`PuzzleLogic` bridge. It does not introduce a second puzzle model or a separate player renderer.

## Generic authored-object identity and selection

Creator constraints continue to use their stable constraint IDs. Non-semantic cosmetic parts now receive stable `data-sphenpad-object-id` identities, with optional object names. Older creator visuals without an object ID are assigned one when opened, so legacy authored visuals remain editable.

The Elements inspector now lists authored instances for the selected element type. Selecting an instance opens a shared property inspector instead of relying on per-tool one-off removal rows.

## Constraint management

The generic inspector supports:
- rename;
- enable/disable;
- per-constraint `ignoreInSolver` state;
- clue/value editing;
- duplicate;
- delete;
- send backward / bring forward ordering; and
- common appearance properties where a visual representation exists.

Disabled semantic constraints are skipped by creator validation. `ignoreInSolver` is separately persisted and also suppresses creator semantic checking while leaving the object visually enabled.

Duplicate operations clone the semantic constraint and all of its tagged visual parts under a new stable ID. Delete removes both the semantic constraint and every associated visual fragment.

## Appearance and layering

The common property editor can update color/fill/border/text color, text, opacity, thickness, width, height, angle, font size, and rounded shape state. Cosmetic graphics can move between underlay and overlay layers. Reorder actions preserve a multi-part object as a group within each visual collection.

## Cosmetics

Newly authored cosmetic lines, cages, and symbols are now stored in `CreatorProject.cosmetics` rather than being represented as fake semantic constraints. Existing legacy cosmetic constraints remain readable/editable for compatibility.

The creator also exposes convenience cosmetic tools for:
- free text;
- rectangles/circles via shape appearance properties;
- multiple image objects positioned by selected cells; and
- a metadata-backed puzzle background image.

Cosmetic image graphics use the existing SudokuPad/SphenPad image asset resolver path and support URL/data-URL source, size, opacity, angle, and underlay/overlay placement. Background images retain the existing metadata-based background mechanism and can edit source, opacity, target layer, enable state, and deletion.

## Compatibility

The CreatorProject schema version remains v1 because all 11D additions are optional/open-ended fields already preserved by the authoring bridge. Existing v1 CreatorProject records and authored JSON v4 files remain valid.

The only renderer addition is recognition of the optional SphenPad creator `imageUrl` graphic property. Ordinary SudokuPad graphics are unchanged, and image assets still resolve through the existing asset resolver.

## Files added/changed

- `src/sudokupad/creator/objectEditing.ts` — generic object identity, listing, properties, enable/ignore, duplicate/delete/reorder/layer actions, cosmetics, and background helpers.
- `src/sudokupad/creator/checker.ts` — disabled/solver-ignored constraints are excluded from semantic creator checks.
- `src/ui/PuzzleEditorPage.tsx` — authored-object list, shared property inspector, object actions, and expanded cosmetic authoring.
- `src/sudokupad/types/source.ts` — optional creator cosmetic image fields.
- `src/sudokupad/render/renderScene.ts` — cosmetic image rendering through the existing tagged-image asset pipeline.
- `src/app/styles.css` — object list/property inspector styling.
- `scripts/test-creator-object-editing.ts` — focused 11D regression coverage.
