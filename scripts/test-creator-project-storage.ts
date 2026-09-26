function ok(value: unknown, message = "assertion failed"): asserts value { if (!value) throw new Error(message); }
function equal(actual: unknown, expected: unknown) { if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

import { createAuthoredPuzzleDefinition } from "../src/sudokupad/creator/nativeAuthoring";
import { creatorProjectFromDefinition } from "../src/sudokupad/creator/project";
import { cloneCreatorProjectForDuplicate, compareCreatorProjectStorageRows, mergeCreatorProjectStorageRows, normalizeCreatorProjectStorageRow, type CreatorProjectStorageRow } from "../src/sudokupad/creator/projectStorage";

const def = createAuthoredPuzzleDefinition({ id: "creator-a", rows: 9, cols: 9, subgrid: { r: 3, c: 3 }, meta: { title: "Original", author: "A", rules: "R" } });
const project = creatorProjectFromDefinition(def);
const duplicate = cloneCreatorProjectForDuplicate(project, "creator-b");
equal(duplicate.projectId, "creator-b"); equal(duplicate.sourceId, "creator-b"); equal(duplicate.metadata.title, "Original copy"); equal(duplicate.settings.publishedToMyPuzzles, false); equal(project.projectId, "creator-a");

const local: CreatorProjectStorageRow = { key: "creator-a", project: { ...project, metadata: { ...project.metadata, title: "Older content" } }, createdAt: 10, updatedAt: 100, savedAt: 100, lastOpenedAt: 500 };
const cloud: CreatorProjectStorageRow = { key: "creator-a", project: { ...project, metadata: { ...project.metadata, title: "Newer content" } }, createdAt: 10, updatedAt: 200, savedAt: 200, lastOpenedAt: 300 };
const merged = mergeCreatorProjectStorageRows([local], [cloud]);
equal(merged.length, 1); equal(merged[0].project.metadata.title, "Newer content"); equal(merged[0].updatedAt, 200); equal(merged[0].lastOpenedAt, 500);


const deleted: CreatorProjectStorageRow = { ...cloud, updatedAt: 600, savedAt: 500, deletedAt: 600, lastOpenedAt: 500 };
const deleteWins = mergeCreatorProjectStorageRows([local], [deleted]);
equal(deleteWins[0].deletedAt, 600);
const editedAfterDelete: CreatorProjectStorageRow = { ...cloud, updatedAt: 700, savedAt: 700, lastOpenedAt: 700 };
const editWins = mergeCreatorProjectStorageRows([deleted], [editedAfterDelete]);
equal(editWins[0].deletedAt, undefined);
equal(editWins[0].updatedAt, 700);

const normalized = normalizeCreatorProjectStorageRow({ ...cloud, savedAt: Number.NaN, lastOpenedAt: Number.NaN });
equal(normalized.savedAt, cloud.updatedAt); equal(normalized.lastOpenedAt, 0);
const second: CreatorProjectStorageRow = { ...cloud, key: "creator-z", lastOpenedAt: 800 };
ok([cloud, second].sort(compareCreatorProjectStorageRows)[0].key === "creator-z");
console.log("creator project storage model tests passed");
