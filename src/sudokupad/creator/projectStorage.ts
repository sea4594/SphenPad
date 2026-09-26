import { parseCreatorProject, type CreatorProject } from "./project";

export type CreatorProjectStorageRow = {
  key: string;
  project: CreatorProject;
  createdAt: number;
  updatedAt: number;
  savedAt: number;
  lastOpenedAt: number;
  deletedAt?: number;
};

const clone = <T,>(value: T): T => value == null ? value : JSON.parse(JSON.stringify(value)) as T;

export function normalizeCreatorProjectStorageRow(row: CreatorProjectStorageRow): CreatorProjectStorageRow {
  const project = parseCreatorProject(row.project);
  const updatedAt = Number.isFinite(row.updatedAt) ? row.updatedAt : 0;
  return {
    key: row.key,
    project,
    createdAt: Number.isFinite(row.createdAt) ? row.createdAt : updatedAt,
    updatedAt,
    savedAt: Number.isFinite(row.savedAt) ? row.savedAt : updatedAt,
    lastOpenedAt: Number.isFinite(row.lastOpenedAt) ? row.lastOpenedAt : 0,
    ...(typeof row.deletedAt === "number" && Number.isFinite(row.deletedAt) && row.deletedAt > 0 ? { deletedAt: row.deletedAt } : {}),
  };
}

export function compareCreatorProjectStorageRows(a: CreatorProjectStorageRow, b: CreatorProjectStorageRow) {
  return (b.lastOpenedAt || b.updatedAt) - (a.lastOpenedAt || a.updatedAt) || b.updatedAt - a.updatedAt;
}

export function cloneCreatorProjectForDuplicate(projectInput: CreatorProject, key: string): CreatorProject {
  const project = clone(parseCreatorProject(projectInput));
  project.projectId = key;
  project.sourceId = key;
  const baseTitle = project.metadata.title.trim() || "Untitled puzzle";
  project.metadata.title = `${baseTitle} copy`;
  project.settings.publishedToMyPuzzles = false;
  return project;
}

/** Merge content by edit timestamp, but merge recency independently so merely opening an older copy never wins over newer edits. */
export function mergeCreatorProjectStorageRows(localRows: CreatorProjectStorageRow[], cloudRows: CreatorProjectStorageRow[]) {
  const merged = new Map<string, CreatorProjectStorageRow>();
  for (const row of cloudRows) merged.set(row.key, normalizeCreatorProjectStorageRow(row));
  for (const localInput of localRows) {
    const localRow = normalizeCreatorProjectStorageRow(localInput);
    const cloudRow = merged.get(localRow.key);
    if (!cloudRow) { merged.set(localRow.key, localRow); continue; }
    const content = localRow.updatedAt >= cloudRow.updatedAt ? localRow : cloudRow;
    const deletedAt = Math.max(localRow.deletedAt ?? 0, cloudRow.deletedAt ?? 0) || undefined;
    const newestEditAt = Math.max(localRow.updatedAt || 0, cloudRow.updatedAt || 0);
    merged.set(localRow.key, {
      ...content,
      createdAt: localRow.createdAt && cloudRow.createdAt ? Math.min(localRow.createdAt, cloudRow.createdAt) : (localRow.createdAt || cloudRow.createdAt || 0),
      updatedAt: newestEditAt,
      savedAt: Math.max(localRow.savedAt || 0, cloudRow.savedAt || 0),
      lastOpenedAt: Math.max(localRow.lastOpenedAt || 0, cloudRow.lastOpenedAt || 0),
      ...(deletedAt && deletedAt >= newestEditAt ? { deletedAt } : {}),
    });
  }
  return Array.from(merged.values());
}
