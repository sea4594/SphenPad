import { memo, useMemo } from "react";
import type { PuzzleDefinition, PuzzleProgress } from "../core/model";
import { GridCanvas } from "./GridCanvas";

const NOOP = () => {};

/** Keeps library and folder board previews stable across unrelated UI updates. */
export const PuzzleListPreview = memo(function PuzzleListPreview({
  def,
  progress,
}: { def: PuzzleDefinition; progress: PuzzleProgress }) {
  const previewProgress = useMemo(
    () => ({ ...progress, selection: [], multiSelect: false }),
    [progress],
  );
  return (
    <GridCanvas
      def={def}
      progress={previewProgress}
      onSelection={NOOP}
      onLineStroke={NOOP}
      onLineTapCell={NOOP}
      onLineTapEdge={NOOP}
      onDoubleCell={NOOP}
      interactive={false}
      previewMode
      strictScale
    />
  );
});
