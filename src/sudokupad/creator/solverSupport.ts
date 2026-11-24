import type { PuzzleDefinition } from "../../core/model";
import { creatorConstraints } from "./nativeAuthoring";

// A solver must not silently ignore a semantic rule and then claim uniqueness.
// These types have value checks in the creator-only validateGrid implementation.
const VALIDATED_TYPES = new Set([
  "diagonal", "disjoint-groups", "nonconsecutive", "global-entropy", "outside-clue", "indexer",
  "even", "odd", "minimum", "maximum", "difference", "ratio", "xv", "clone",
  "different-values", "killer-cage", "quadruple", "look-and-say-cage", "counting-circles",
  "thermometer", "whisper", "palindrome", "renban", "between-line", "region-sum-line",
  "sequence-line", "entropy-line", "lockout-line", "arrow", "double-arrow",
]);
const OUTSIDE_TYPES = new Set(["little-killers", "sandwich-sums", "x-sums", "skyscrapers", "numbered-rooms"]);
const INDEXER_TYPES = new Set(["row-indexers", "column-indexers"]);
// Fog affects visibility, not which completed digit assignments satisfy a puzzle.
const PRESENTATION_TYPES = new Set(["foglight", "fog-trigger"]);

export function creatorSolverUnsupportedReason(def: PuzzleDefinition): string | undefined {
  if (def.logic?.antiRook) return "Anti-rook is not implemented by the creator solution checker; solution claims are disabled.";
  for (const constraint of creatorConstraints(def)) {
    const source = String(constraint.sourceElementId ?? constraint.type);
    if (constraint.enabled === false || constraint.ignoreInSolver === true || def.meta.creatorConstraintChecks?.[source] === false) continue;
    if (PRESENTATION_TYPES.has(constraint.type)) continue;
    if (constraint.type === "custom") return `Custom constraint '${source}' cannot be executed by the local creator solver. Mark it 'Ignore in solver/checker' to explicitly omit it.`;
    if (!VALIDATED_TYPES.has(constraint.type)) return `The creator solver does not validate '${source}' (${constraint.type}). Disable it or mark it 'Ignore in solver/checker' before searching.`;
    if (constraint.type === "outside-clue" && !OUTSIDE_TYPES.has(source)) return `Unsupported outside-grid clue '${source}' cannot be checked reliably.`;
    if (constraint.type === "indexer" && !INDEXER_TYPES.has(source)) return `Unsupported indexer '${source}' cannot be checked reliably.`;
  }
  return undefined;
}
