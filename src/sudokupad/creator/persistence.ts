import { saveCreatorProject } from "../../core/storage";
import type { PuzzleDefinition } from "../../core/model";
import { creatorProjectFromDefinition } from "./project";
import type { CreatorProjectHistoryState } from "./history";
import { CreatorSaveCoordinator } from "./saveCoordinator";

export type CreatorEditorSnapshot = { def: PuzzleDefinition; history: CreatorProjectHistoryState };

// A shared per-project queue allows an unmounted editor to finish a pending save
// and ensures creator-list operations can wait for it before changing that project.
const queues = new Map<string, CreatorSaveCoordinator<CreatorEditorSnapshot>>();
export function getCreatorEditorSaveQueue(key: string) {
  const existing = queues.get(key);
  if (existing) return existing;
  let lastWriteAt = 0;
  const queue = new CreatorSaveCoordinator<CreatorEditorSnapshot>(async (snapshot) => {
    lastWriteAt = Math.max(Date.now(), lastWriteAt + 1);
    await saveCreatorProject(key, creatorProjectFromDefinition(snapshot.def), lastWriteAt, snapshot.history);
  });
  queues.set(key, queue);
  return queue;
}
