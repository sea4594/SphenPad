# Phase 11F — Cell / group / edge / corner / cage constraints

Phase 11F extends the native `CreatorProject -> PuzzleDefinition -> SudokuPadScene + PuzzleLogic` authoring path. It does not introduce a second renderer or solver-player representation.

## Implemented SudokuMaker families

- Cell marks: Even, Odd, Minimum, Maximum.
- Edge clues: Difference Kropki, Ratio Kropki, XV.
- Cages/groups/corners: Killer Cages, Clone groups, Quadruples, Look-and-Say Cages, Different Values / Extra Regions, Counting Circles.

These correspond to upstream SudokuMaker first-class types 100-103, 200-202, and 301-306. `extra-region` is retained as a SphenPad catalog alias for SudokuMaker's `DifferentValues` semantic type.

## Native semantic model

`src/sudokupad/creator/groupConstraints.ts` owns creation, normalization, visual generation, cell replacement, and property updates for these families. Stable constraint IDs continue to bind multi-part visuals to one editable object via the Phase 11D authored-object layer.

Legacy generic creator records using source/catalog IDs such as `difference-kropki`, `ratio-kropki`, and older killer records are normalized into the semantic 11F model without changing their authored identity or scene bridge.

## Upstream-compatible rule details

The supplied SudokuMaker worker was used as the rule source of truth.

- Minimum/Maximum compare each marked cell with orthogonally adjacent cells outside the same marked set; Minimum and Maximum marks cannot overlap.
- Difference dots support arbitrary positive differences plus optional puzzle-wide negative differences and the upstream negative-ratio override behavior.
- Ratio dots support arbitrary integer ratios plus optional puzzle-wide negative ratios and the upstream negative-difference override behavior.
- XV clues support X=10 and V=5 plus independent negative-X / negative-V behavior on unmarked orthogonal edges.
- Killer Cages are all-different; a positive clue additionally fixes the sum. A blank clue remains a valid all-different cage.
- A Clone group is a set of cells constrained to contain the same digit, matching SudokuMaker's worker `groups` component behavior.
- Quadruple digits are a multiset that must occur among the 2-4 cells touching the marked corner; repeated clue digits are preserved.
- Look-and-Say cage clues use SudokuMaker's count/digit pairs, e.g. `1522` means one 5 and two 2s; `05` forbids 5.
- Different Values enforces all-different on the selected cells; a digit-count-sized set is the Extra Region case.
- Counting Circles follows the upstream rule: a digit in a circle equals the total number of circles containing that digit.

## Creator UI

All 11F types are first-class selectable authored objects. The shared inspector now supports replacing their cells from the current selection and exposes the family-specific properties needed for parity:

- Difference / ratio value, negative values, and cross-family override switches.
- X/V choice plus negative X and V switches.
- Killer sum/clue.
- Quadruple multiset digits.
- Look-and-Say count/digit pairs.
- Rule-specific help for clones, different values, counting circles, fortress cells, and parity marks.

Appearance, enabled state, ignore-in-solver/checker, duplication, deletion, ordering, and stable identity continue to come from the generic Phase 11D object layer.

## Validation

Creator-side validation now checks the implemented 11F semantics as givens become available, plus structural errors such as non-adjacent edge clues, malformed corner clues, oversized all-different sets/cages, malformed Look-and-Say clues, and overlapping Minimum/Maximum cells. Disabled or ignored objects are excluded. Full SudokuMaker worker-equivalent component diagnostics remain Phase 11H.
