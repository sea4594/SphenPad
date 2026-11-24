import type { PuzzleDefinition } from "../../core/model";
import { findCreatorSolutions, solveCreatorLogically, type CreatorSolverSettings } from "./solver";

export type CreatorSolveRequest = { action: "search" | "logical"; def: PuzzleDefinition; settings: CreatorSolverSettings };
export type CreatorSolveResponse =
  | { action: "search"; result: ReturnType<typeof findCreatorSolutions> }
  | { action: "logical"; result: ReturnType<typeof solveCreatorLogically> }
  | { action: "error"; message: string };

// Dedicated, creator-only module worker. The editor terminates it on cancel,
// navigation, and every definition revision; it never touches persisted data.
self.onmessage = (event: MessageEvent<CreatorSolveRequest>) => {
  try {
    const { action, def, settings } = event.data;
    const response: CreatorSolveResponse = action === "logical"
      ? { action, result: solveCreatorLogically(def, settings) }
      : { action: "search", result: findCreatorSolutions(def, settings) };
    self.postMessage(response);
  } catch (error) {
    self.postMessage({ action: "error", message: error instanceof Error ? error.message : "Creator solver failed." } satisfies CreatorSolveResponse);
  }
};
