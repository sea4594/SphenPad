/** The stock SudokuPad build this compatibility implementation targets. */
export const SUDOKUPAD_COMPAT_TARGET_VERSION = "0.612.0" as const;

/** Version of SphenPad's JSON-safe native scene representation. */
export const SPHENPAD_SUDOKUPAD_SCENE_VERSION = 2 as const;

/**
 * Version of PuzzleDefinition after native creator-scene migration.
 * v2 introduced scene/logic separation; v3 makes creator scene/logic authoritative.
 */
export const SPHENPAD_PUZZLE_DEFINITION_SCHEMA_VERSION = 3 as const;
