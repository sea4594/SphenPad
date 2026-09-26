import type { PuzzleDefinition } from "../../core/model";
import type { PuzzleLogic } from "../types/logic";
import type { SudokuPadScene } from "../types/scene";
import { SPHENPAD_PUZZLE_DEFINITION_SCHEMA_VERSION } from "../version";

export type NativeScenePuzzleDefinition = PuzzleDefinition & {
  schemaVersion: typeof SPHENPAD_PUZZLE_DEFINITION_SCHEMA_VERSION;
  scene: SudokuPadScene;
  logic: PuzzleLogic;
};

export function puzzleDefinitionSchemaVersion(def: PuzzleDefinition): number { return def.schemaVersion ?? 1; }
export function hasNativeSudokuPadScene(def: PuzzleDefinition): def is NativeScenePuzzleDefinition { return Boolean(def.scene && def.logic); }
export function isImportedSudokuPadDefinition(def: PuzzleDefinition): boolean { return !def.meta.creatorPuzzle && typeof def.sourcePayload === "string" && def.sourcePayload.length > 0; }
export function needsDerivedSudokuPadScene(def: PuzzleDefinition): boolean { return isImportedSudokuPadDefinition(def) && !hasNativeSudokuPadScene(def); }
export function withNativeScene(def: PuzzleDefinition, scene: SudokuPadScene, logic: PuzzleLogic): NativeScenePuzzleDefinition {
  return { ...def, schemaVersion: SPHENPAD_PUZZLE_DEFINITION_SCHEMA_VERSION, scene, logic };
}

/**
 * Imported scenes are compiled from sourcePayload, so omit them from storage.
 * Creator scenes are authoritative and persisted. Imported scenes are derived
 * from sourcePayload and omitted from storage to avoid duplicate data.
 */
export function definitionForPersistence(def: PuzzleDefinition): PuzzleDefinition {
  if (isImportedSudokuPadDefinition(def)) {
    const persisted: PuzzleDefinition = { ...def };
    delete persisted.scene;
    delete persisted.logic;
    delete persisted.sourceData;
    return persisted;
  }
  if (def.meta.creatorPuzzle && def.scene && def.logic) {
    const persisted: PuzzleDefinition = { ...def };
    delete persisted.sourceData;
    return { ...persisted, schemaVersion: SPHENPAD_PUZZLE_DEFINITION_SCHEMA_VERSION };
  }
  return def;
}
