import type { PersistedPuzzle, PuzzleProgress } from "./model";
import { makeInitialProgress } from "./scl";
import { definitionFromCreatorProject } from "../sudokupad/creator/project";
import type { CreatorProjectStorageRow } from "../sudokupad/creator/projectStorage";

export type DurablePuzzleProgress = Pick<PuzzleProgress,
  "startedAt" | "totalMillis" | "status" | "videoResumeSeconds" | "cells" | "lines" | "lineCenterMarks" | "lineEdgeMarks"
>;

export type CloudPuzzlePayload = {
  updatedAt: number;
  createdAt?: number;
  progress: DurablePuzzleProgress;
  undo: unknown[];
  redo: unknown[];
  def?: PersistedPuzzle["def"];
  creatorProjectKey?: string;
};

export function puzzleToCloudPayload(key: string, data: PersistedPuzzle): CloudPuzzlePayload {
  const { progress } = data;
  const durableProgress: DurablePuzzleProgress = {
    startedAt: progress.startedAt,
    totalMillis: progress.totalMillis,
    status: progress.status,
    videoResumeSeconds: progress.videoResumeSeconds,
    cells: progress.cells,
    lines: progress.lines,
    lineCenterMarks: progress.lineCenterMarks,
    lineEdgeMarks: progress.lineEdgeMarks,
  };
  const creatorPuzzle = data.def.meta.creatorPuzzle === true;
  return {
    updatedAt: data.updatedAt,
    createdAt: data.createdAt,
    progress: durableProgress,
    undo: data.undo,
    redo: data.redo,
    ...(creatorPuzzle ? { creatorProjectKey: key } : { def: data.def }),
  };
}

export function puzzleFromCloudPayload(
  payload: CloudPuzzlePayload,
  existing: PersistedPuzzle | null,
  creatorProject?: CreatorProjectStorageRow | null,
): PersistedPuzzle {
  const def = payload.def ?? (creatorProject ? definitionFromCreatorProject(creatorProject.project, { id: creatorProject.key, sourceId: creatorProject.key }) : existing?.def);
  if (!def) throw new Error(`Cloud puzzle ${payload.creatorProjectKey ?? "record"} is missing its definition.`);
  const fresh = makeInitialProgress(def);
  const localSession = existing?.progress ?? fresh;
  const progress: PuzzleProgress = {
    ...localSession,
    startedAt: payload.progress.startedAt,
    totalMillis: payload.progress.totalMillis,
    status: payload.progress.status,
    videoResumeSeconds: payload.progress.videoResumeSeconds,
    cells: payload.progress.cells,
    lines: payload.progress.lines,
    lineCenterMarks: payload.progress.lineCenterMarks,
    lineEdgeMarks: payload.progress.lineEdgeMarks,
  };
  return {
    def,
    progress,
    undo: payload.undo ?? [],
    redo: payload.redo ?? [],
    updatedAt: payload.updatedAt,
    ...(typeof payload.createdAt === "number" ? { createdAt: payload.createdAt } : {}),
  };
}
