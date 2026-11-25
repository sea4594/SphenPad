import type { PuzzleDefinition } from "../../core/model";
import { findCreatorSolutions, solveCreatorLogically, type CreatorSearchProgress, type CreatorSolverSettings } from "./solver";
import { validateConstraints, validateGrid, workerValuesFromDefinition, type CreatorGridValidation } from "./worker";

export type CreatorSolveRequest = { action: "search" | "logical"; def: PuzzleDefinition; settings: CreatorSolverSettings } | { action: "validate"; def: PuzzleDefinition; source: "givens" | "solution" };
export type CreatorSolveResponse =
  | { action: "search"; result: ReturnType<typeof findCreatorSolutions> }
  | { action: "logical"; result: ReturnType<typeof solveCreatorLogically> }
  | { action: "validate"; result: CreatorGridValidation; constraintErrors: Array<{ id: string; message: string }> }
  | { action: "progress"; progress: CreatorSearchProgress }
  | { action: "error"; message: string };

// Dedicated, creator-only module worker. The editor terminates it on cancel,
// navigation, and every definition revision; it never touches persisted data.
self.onmessage = (event: MessageEvent<CreatorSolveRequest>) => {
  try {
    const request = event.data;
    const { action, def } = request;
    if (action === "validate") {
      const result = validateGrid(def, workerValuesFromDefinition(def, request.source));
      const constraintErrors = [...validateConstraints(def)].filter(([, message]) => message.trim()).map(([id, message]) => ({ id, message }));
      self.postMessage({ action, result, constraintErrors } satisfies CreatorSolveResponse);
      return;
    }
    const { settings } = request;
    const response: CreatorSolveResponse = action === "logical"
      ? { action, result: solveCreatorLogically(def, settings) }
      : { action: "search", result: findCreatorSolutions(def, settings, {
        onProgress: (progress) => self.postMessage({ action: "progress", progress } satisfies CreatorSolveResponse),
      }) };
    self.postMessage(response);
  } catch (error) {
    self.postMessage({ action: "error", message: error instanceof Error ? error.message : "Creator solver failed." } satisfies CreatorSolveResponse);
  }
};
