export function normalizePuzzleKey(sourceId: string): string {
  // Stable identifier for storage: keep it URL-safe & deterministic.
  return sourceId.trim().replace(/\s+/g, "").slice(0, 240);
}