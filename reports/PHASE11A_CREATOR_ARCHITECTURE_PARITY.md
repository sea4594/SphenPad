# Phase 11A — SudokuMaker parity inventory and creator architecture

## Upstream evidence
This inventory was derived from the supplied deployed SudokuMaker artifacts, not from the existing SphenPad catalog alone.
- `sudokumaker.app.har` SHA-256: `33ced4d707e1cf83aa55c04e1c79f31e9fcd8e3ea48bf251d2461cc820b08b44`
- `puzzleQueries-DKblPzGJ.js` SHA-256: `64a07d581a1b457d855819f57b1395d32d440a53e72ba0b081012d267170db94`
- Authoritative pre-11A checkpoint SHA-256: `60933b3d9d051da3bd800d53804e705401ca8a248387ade8c1c8730f1390e962`

The deployed main bundle defines 47 first-class constraint/tool types. The exact machine-readable inventory, numeric upstream IDs, Phase 10D SphenPad status, SphenPad aliases, and target Phase 11 sub-phase live in `src/sudokupad/creator/sudokumakerParity.ts`.

## Definitive first-class tool inventory
Grid/base: Givens, Regions, SudokuRules.
Global: DiagonalMinus, DiagonalPlus, Antiking, Antiknight, DisjointGroups, Nonconsecutive, GlobalEntropy.
Cell/group/edge: Even, Odd, Maximum, Minimum, Difference, Ratio, XV, Thermometer, KillerCages, Clone, Quadruple, LookAndSayCages, DifferentValues, CountingCircles.
Lines/paths: Renban, Whisper, Palindrome, BetweenLines, RegionSumLine, Sequence, EntropyLines, LockoutLines, Arrow, DoubleArrow.
Outside/indexers: LittleKillers, SandwichSums, XSums, Skyscrapers, NumberedRooms, RowIndexer, ColumnIndexer.
Advanced/cosmetic/fog: Custom, CosmeticLine, CosmeticCage, CosmeticSymbol, FogLights, FogTriggers.

Two first-class upstream types were absent from SphenPad's Phase 10D catalog: `DifferentValues` and `CountingCircles`. 11A adds them to the visible catalog as planned entries; their actual editing/logic belongs to 11F.

Important configurable variants seen in the deployed UI are not separate upstream enum types: Thermometer has a `slow` mode; Whisper has configurable `minDifference` (including Dutch/German presets). SphenPad's additional 3-modular/parity-style line entries are treated as related configurable/custom line variants rather than extra first-class upstream enum types.

## Worker/query parity target
The supplied SudokuMaker worker exposes exactly these project-query endpoints:
- `getCellsSeenByCells`
- `getComponents`
- `validateConstraints`
- `validateGrid`

These are the concrete behavior targets for Phase 11H. The worker also confirms the canonical constraint configuration shapes/defaults used by the first-class types.

## CreatorProject architecture
11A introduces `CreatorProject` (`format: "sphenpad-creator-project"`, version `1`) as the normalized authoring interchange schema. It explicitly stores:
- grid dimensions and digit range;
- title/author/rules/post-solve metadata plus forward-compatible metadata;
- givens and solution;
- named regions;
- semantic constraints and their associated ordered native visuals;
- unbound/cosmetic native visuals;
- creator settings (active catalog elements, names, checker toggles, render settings, semantic global flags);
- compatibility extras needed to round-trip existing Phase 10D creator scenes/logic without dropping unknown fields.

`PuzzleDefinition` remains the runtime/player bridge. This deliberately preserves the Phase 1–10 renderer architecture: creator projects convert to/from the existing `PuzzleDefinition + SudokuPadScene + PuzzleLogic` model instead of adding a second renderer/player path.

## Serialization and migration
The downloadable authored SphenPad JSON format is advanced from v3 to v4. v4 contains the versioned `CreatorProject`; importing legacy v3 authored files remains supported and migrates them through `CreatorProject` before returning a current `PuzzleDefinition`. Existing IndexedDB puzzle records are not rewritten in 11A; persistent first-class project management/storage is 11B.

## Phase boundaries after 11A
- 11B owns project CRUD/autosave/dirty/recent metadata and persistence integration.
- 11C–11G implement the inventory in tool-family slices.
- 11H implements the four worker-equivalent query/validation behaviors.
- 11I handles external import/export and round-trips.
- 11J integrates real playtest/My Puzzles flows.
- 11K completes editing ergonomics.
- 11L audits every inventory row and hardens production behavior.

## Non-constraint creator capability inventory
The main bundle also exposes creator operations outside the 47-type constraint enum. The machine-readable grouping is `SUDOKUMAKER_CREATOR_CAPABILITIES` and covers project/spec metadata, constraint add/remove/duplicate/enable/solver-ignore/reorder, property and appearance forms, undo/redo/selection/delete, drag editing, keyboard/hotkeys, clipboard flows, zoom/pan, logical solver/solutions finder, playable projection, and export/interchange surfaces. These are assigned to 11B/11C/11D/11H/11I/11J/11K so the final 11L audit includes both tool parity and editor-operation parity.
