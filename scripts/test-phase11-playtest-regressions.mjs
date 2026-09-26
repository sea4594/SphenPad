import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [interaction, puzzlePage, gridCanvas, renderer, fog, layers, rendererCss, appCss, emojiAssets, progressScene, conflicts, renderCells, creatorPage, creatorEditor, youtubePlayer, theme, settingsOverlay] = await Promise.all([
  read("src/ui/BoardInteractionLayer.tsx"),
  read("src/ui/PuzzlePage.tsx"),
  read("src/ui/GridCanvas.tsx"),
  read("src/sudokupad/render/SvgRenderer.ts"),
  read("src/sudokupad/fog/fogMasks.ts"),
  read("src/sudokupad/render/layers.ts"),
  read("src/sudokupad/styles/sudokupad-renderer.css"),
  read("src/app/styles.css"),
  read("src/sudokupad/assets/emojiAssets.ts"),
  read("src/sudokupad/app/progressScene.ts"),
  read("src/sudokupad/app/conflicts.ts"),
  read("src/sudokupad/render/renderCells.ts"),
  read("src/ui/PuzzleCreatorPage.tsx"),
  read("src/ui/PuzzleEditorPage.tsx"),
  read("src/ui/YouTubePlayer.tsx"),
  read("src/app/theme.tsx"),
  read("src/ui/SettingsOverlay.tsx"),
]);

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

expect(interaction.includes("getCellOutline(progress.selection"), "selection must render as a merged perimeter");
expect(!interaction.includes("<rect key={key}"), "selection must not draw one border rectangle per cell");
expect(interaction.includes("const next = progress.multiSelect ? new Set(current) : new Set<string>();"), "SudokuPad multi-select add/remove state machine missing");
expect(interaction.includes('!progress.multiSelect && !drag.moved && drag.startedSelected && drag.startedSelectionSize === 1'), "single selected-cell toggle rule missing");
expect(puzzlePage.includes('.sphenpad-native-board, .sphenpad-sudokupad-renderer, .sphenpad-board-interaction'), "outer player shell must recognize SVG board taps as in-board interaction");
expect(!puzzlePage.includes('querySelector<HTMLCanvasElement>("canvas")'), "portrait video resizing must not depend on the removed canvas renderer");
expect(puzzlePage.includes('querySelector<SVGSVGElement>(".sphenpad-sudokupad-renderer")'), "portrait video resizing must use the live SVG geometry");
expect(puzzlePage.includes("setPortraitBoardHeight") && puzzlePage.includes("requestedHeight={portraitBoardHeight ?? undefined}"), "pre-Phase-1 portrait video slider must resize the board height as well as the video");
expect(puzzlePage.includes("syncInitialPortraitVideoLayout") && puzzlePage.includes("getPortraitVideoLayout(gridLayout, video.getBoundingClientRect().height)"), "opening mobile portrait video must initialize the same explicit board/video sizing used by the slider");
expect(puzzlePage.includes("scalePuzzleStrokes={videoLayoutOn}"), "video layout must opt into image-like puzzle stroke scaling");
expect(renderer.includes("sudokuPadScopedSvgId(this.svg, `arrow_${this.svgId++}`)"), "arrow marker IDs must be scoped per board");
expect(fog.includes('sudokuPadScopedSvgId(svg, "fog-mask-fog")'), "fog mask IDs must be scoped per board");
expect(!fog.includes('setAttribute("mask", "url(#fog-mask-fog)")'), "fog masks must not use global fragment IDs");
expect(layers.includes('sudokuPadScopedSvgId(svg, "outlinefilter")'), "outline filter IDs must be scoped per board");
expect(rendererCss.includes("filter: var(--sphenpad-outline-filter);"), "outline filter CSS must reference the board-scoped filter variable");
expect(interaction.includes("GRID_STROKE_WIDTH_PX / 2 + selectionStrokeWidth / 2") && interaction.includes("vectorEffect=\"non-scaling-stroke\""), "selection stroke must sit fully inside the grid border at screen-pixel thickness");
expect(interaction.includes("SELECTION_STROKE_WIDTHS") && interaction.includes("normal: 3.3 * 1.15") && interaction.includes("extra: 7.5") && interaction.includes("strokeWidth={selectionStrokeWidth}"), "selection outline thickness choices must preserve current default and extend to about double thickness");
expect(interaction.includes('strokeLinejoin="miter"') && interaction.includes('strokeLinecap="butt"'), "selection perimeter exterior corners must be square rather than rounded");
expect(interaction.includes("rgba(46,120,255,.7)"), "selection perimeter must use SudokuPad-style transparency");
expect(interaction.includes("const LINE_NODE_RADIUS = 0.5") && interaction.includes("function centerLineHopsFromPointer") && interaction.includes("samplesPerCell ?? 24") && interaction.includes("function edgeLineHopsFromPointer"), "pre-Phase-1 circular-node sampled drag tracking is missing");
expect(rendererCss.includes('[data-sphenpad-fog-root="cover"] { fill:#afafaf; }'), "light-mode fog cover must use SudokuPad gray #afafaf");
expect(fog.includes('fogEdge.dataset.sphenpadFogEdge = "true"'), "scoped fog edge styling marker missing");
expect(emojiAssets.includes("emojiObjectUrlCache") && emojiAssets.includes('textEl.style.visibility = "hidden"'), "emoji redraw cache/flicker guard missing");
expect(gridCanvas.includes("spaceAboveControls") && gridCanvas.includes("visualViewport") && gridCanvas.includes("availableWidth / vb.width") && gridCanvas.includes("availableHeight / vb.height"), "pre-Phase-1 fit-to-free-space sizing model is missing");
expect(gridCanvas.includes('scalePuzzleStrokes ? " scalePuzzleStrokes" : ""'), "GridCanvas must expose the video-only image-like stroke-scaling class");
expect(appCss.includes(".sphenpad-native-board.fitted > .sphenpad-sudokupad-renderer") && appCss.includes("--sphenpad-board-fit-height"), "live puzzle fit dimensions must drive both render and interaction SVGs");
expect(appCss.includes(".sphenpad-native-board.scalePuzzleStrokes > .sphenpad-sudokupad-renderer [vector-effect=\"non-scaling-stroke\"]") && appCss.includes("vector-effect: none !important;"), "video-resized puzzles must scale native SVG line weights with the board");
expect(appCss.includes(".videoLayoutOn.videoModeDesktop .mobileControlPanel") && appCss.includes("grid-template-rows: repeat(5, minmax(0, 1fr));"), "desktop video controls must contract within the available viewport instead of clipping the bottom row");
expect(!gridCanvas.includes('theme.mode === "dark"'), "app light/dark theme must not recolor the puzzle canvas");
expect(gridCanvas.includes("darkMode: false"), "puzzle canvas must remain on the canonical pre-Phase-1 light rendering regardless of app theme");
expect(appCss.includes('.sphenpad-native-board.preview > .sphenpad-sudokupad-renderer') && appCss.includes('width: 100% !important;'), "preview-only exact scaling rule missing");

expect(progressScene.includes("computePuzzleConflictMarks") && progressScene.includes("playerPencilmarks: true"), "player pencilmark conflict/legacy-placement metadata must be attached by the progress adapter");
expect(conflicts.includes("computePuzzleConflictMarks") && conflicts.includes("markConflictsAt"), "pencilmark conflict checking must use active Sudoku conflict rules");
expect(renderCells.includes("mark-error") && rendererCss.includes(".cell-pencilmark.playerPencilmark[data-val=\"5\"]") && rendererCss.includes("--puzzle-pencilmarkerror"), "conflicting pencilmarks must render red and player corner marks must use legacy value-based positions");
expect(theme.includes("SelectionOutlineThickness") && settingsOverlay.includes("Selection outline") && settingsOverlay.includes("Extra thick"), "selection outline thickness setting is missing");
expect(creatorPage.includes("const otherRows = rows.filter") && creatorPage.includes("All projects are shown above."), "creator project list must not display recent projects a second time");
expect(appCss.includes(".creatorDimensionsPreview") && appCss.includes("contain: layout paint") && appCss.includes(".creatorDimensionFields { position: relative; z-index: 1; }"), "custom creator grid preview must stay confined behind dimension controls");
expect(creatorEditor.includes("creatorInlineAuthoringPanel") && !creatorEditor.includes('overlayBackdrop creatorOverlayBackdrop'), "constraint/object settings must be an inline panel above the creator grid, not a blocking modal");
expect(appCss.includes(".creatorElementsPageLayout.authoring-open") && appCss.includes(".creatorInlineAuthoringPanel"), "creator grid must reserve space for the inline element settings panel");
expect(youtubePlayer.includes("youtube-nocookie.com/embed") && youtubePlayer.includes("window.setTimeout(fallBack, 8000)") && youtubePlayer.includes("host.replaceChildren(mount)"), "video player must recover from black/stalled YouTube API embeds");

console.log("Phase 11 playtest rendering/selection regression checks passed");
