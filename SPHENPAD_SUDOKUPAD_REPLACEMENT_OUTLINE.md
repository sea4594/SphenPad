# SphenPad — Full SudokuPad Importer/Renderer Replacement Plan

## Goal

Replace the current heuristic SudokuPad importer and Canvas-based puzzle renderer with a compatibility layer modeled directly on the captured stock SudokuPad 0.612.0 implementation.

The new architecture should support every core payload/rendering path handled by that SudokuPad build, including:

- native SCL / CTC;
- F-Puzzles;
- SCF;
- puzzle packs;
- short SudokuPad IDs;
- arbitrary native lines, arrows, cages, underlays, overlays, text and safe SVG attributes;
- irregular/outside-grid puzzles;
- fog and triggered fog;
- external puzzle background images;
- Twemoji;
- default and optional SudokuPad puzzle fonts;
- exact layer ordering and settings-dependent ordering;
- future compatibility diagnostics for previously unseen fields.

The keyword is **REPLACE**:

- `src/core/sudokupad.ts` should cease being the importer implementation.
- `PuzzleCosmetics` should cease being the rendering intermediate representation.
- `GridCanvas.tsx` should cease being the puzzle renderer.
- Variant-specific drawing guesses should not survive in the new rendering path.

Existing application features such as progress, folders, undo/redo, archive browsing, selection and editing can remain, but must consume the new model.

---

# 1. Current architecture that should be removed

The repo currently has:

```text
SudokuPad payload
        ↓
src/core/sudokupad.ts
  ~2,100 lines
  heuristic decoding
  heuristic format normalization
  heuristic feature interpretation
        ↓
PuzzleDefinition.cosmetics
        ↓
src/ui/GridCanvas.tsx
  ~2,700 lines
  Canvas rendering
  reinterprets cosmetics
  reconstructs layers/geometries
        ↓
<canvas>
```

This is lossy in two places:

1. import converts open-ended SudokuPad primitives into a smaller custom `PuzzleCosmetics` model;
2. rendering converts that model into approximate Canvas equivalents.

Examples of current behavior that should disappear:

- `decompressedFromMaybeZipped()` is explicitly a no-op placeholder;
- `fpuz` and `scl` are treated through the same best-effort decompression path instead of SudokuPad's real format registry/importers;
- colors, opacity, target layers and variants are guessed;
- semantic arrays such as `thermolines`, `whispers`, `renbanlines`, etc. are treated as renderer primitives;
- world bounds are estimated manually;
- cage geometry is independently approximated;
- fog is independently reconstructed on Canvas;
- background image opacity is hard-coded separately;
- text metrics/font sizes are approximated with Canvas;
- the renderer cannot naturally preserve arbitrary safe SVG attributes.

The replacement should not add more cases to these functions.

---

# 2. New top-level architecture

```text
                       INPUT
                         │
                         ▼
              ┌────────────────────┐
              │ SudokuPad resolver │
              └─────────┬──────────┘
                        │
                        ▼
              ┌────────────────────┐
              │ Format registry    │
              │ scl / ctc          │
              │ fpuz / fpuzzles    │
              │ scf                │
              │ pack               │
              │ remote ID          │
              └─────────┬──────────┘
                        │
                        ▼
              ┌────────────────────┐
              │ Exact decoders     │
              │ PuzzleZipper       │
              │ F-Puzzles importer │
              │ SCF decoder        │
              │ Pack decoder       │
              └─────────┬──────────┘
                        │
                        ▼
              ┌────────────────────┐
              │ Native source      │
              │ puzzle             │
              └─────────┬──────────┘
                        │
                        ▼
              ┌────────────────────┐
              │ Normalizer         │
              │ metadata           │
              │ features           │
              │ cages              │
              │ fog                │
              │ compatibility      │
              └─────────┬──────────┘
                        │
                        ▼
              ┌────────────────────┐
              │ Render scene       │
              └─────────┬──────────┘
                        │
                        ▼
              ┌────────────────────┐
              │ SVG renderer       │
              │ + SudokuPad CSS    │
              └─────────┬──────────┘
                        │
                        ▼
                 React interaction
                     overlay
```

The renderer's canonical vocabulary becomes:

```text
cells
regions
cages
lines
arrows
underlays
overlays
metadata
fog/effects
```

not:

```text
thermos
whispers
renbans
palindromes
kropki dots
xv
...
```

Those semantic concepts may exist in a separate logic/editor layer, but they are not the renderer's source of truth.

---

# 3. New directory structure

Create:

```text
src/
  sudokupad/
    index.ts

    types/
      source.ts
      scene.ts
      settings.ts
      formats.ts

    loader/
      resolveInput.ts
      remotePuzzle.ts
      formatRegistry.ts
      parseUrlSettings.ts

    codecs/
      lz.ts
      puzzleZipper.ts
      scl.ts
      scf.ts
      pack.ts

    fpuzzles/
      types.ts
      parse.ts
      import.ts
      importGrid.ts
      importConstraints.ts
      styles.ts

    normalize/
      normalizePuzzle.ts
      metadata.ts
      cells.ts
      cages.ts
      features.ts
      legacyOpacity.ts
      globals.ts
      compatibility.ts

    fog/
      normalizeFog.ts
      fogState.ts
      fogMasks.ts

    assets/
      assetResolver.ts
      imageAssets.ts
      twemojiAssets.ts
      fontRegistry.ts
      fontLoader.ts
      historicalAssets.ts

    render/
      constants.ts
      layers.ts
      SvgRenderer.ts
      renderScene.ts
      renderLine.ts
      renderArrow.ts
      renderRect.ts
      renderText.ts
      renderCage.ts
      cellOutline.ts
      renderCells.ts
      renderGrid.ts
      contentBounds.ts

    styles/
      sudokupad-renderer.css

    diagnostics/
      warnings.ts
      unknownFields.ts
      compatibilityReport.ts

src/
  ui/
    SudokuPadBoard.tsx
    BoardInteractionLayer.tsx
```

Tests:

```text
tests/
  sudokupad/
    codecs/
    fpuzzles/
    normalization/
    renderer/
    fog/
    assets/
    integration/
    archive/
    fixtures/
```

Scripts:

```text
scripts/
  audit-sudokupad-archive.ts
  render-sudokupad-fixtures.ts
  compare-sudokupad-rendering.ts
  sync-sudokupad-assets.ts       # optional, subject to asset licenses
```

---

# 4. Replace `src/core/sudokupad.ts`

Do not refactor the existing file incrementally.

Replace it with a thin public facade:

```ts
export {
  loadSudokuPadPuzzle,
  resolveSudokuPadInput,
  parseSudokuPadPayload,
} from "../sudokupad";

export const SUDOKUPAD_IMPORT_REVISION = <new revision>;
```

Everything currently implemented inside the 2,100-line file moves into dedicated exact modules.

After migration is stable, delete the old implementation.

---

# 5. New source-puzzle types

Add `src/sudokupad/types/source.ts`.

Use an open model:

```ts
type Point = [number, number];

interface SudokuPadSourcePuzzle {
  id?: string;
  cellSize?: number;

  cells: SourceCell[][];
  regions?: Point[][];
  cages?: SourceCage[];
  lines?: SourceLine[];
  arrows?: SourceArrow[];
  underlays?: SourceGraphic[];
  overlays?: SourceGraphic[];

  metadata?: PuzzleMetadata;
  metaData?: PuzzleMetadata;

  videos?: SourceVideo[];

  foglight?: Point[];
  triggereffect?: TriggerEffect[];

  global?: string[];

  [key: string]: unknown;
}
```

Every source object should be open-ended:

```ts
[key: string]: unknown
```

Do not discard unknown properties.

This is essential because SudokuPad intentionally passes many safe SVG properties through to generated elements.

---

# 6. Replace `PuzzleCosmetics`

`PuzzleCosmetics` in `src/core/model.ts` should no longer be the render model.

Replace the relevant portion of `PuzzleDefinition` with something similar to:

```ts
type PuzzleDefinition = {
  id: string;
  sourceId: string;
  sourcePayload?: string;

  importRevision?: number;

  rows: number;
  cols: number;
  size: number;

  meta: PuzzleMeta;

  // Derived for game logic / compatibility with existing progress code.
  givens: Array<{ rc: CellRC; v: string }>;

  // New authoritative rendering representation.
  scene: SudokuPadScene;

  // Derived semantic/checker information.
  logic: PuzzleLogic;
};
```

`SudokuPadScene` contains the exact normalized native scene.

`PuzzleLogic` contains only information needed for gameplay/checking, for example:

```ts
interface PuzzleLogic {
  solution?: string;

  rowColCells?: CellRC[];
  rowColAreas?: CellRC[][];
  regions?: CellRC[][];

  antiKnight?: boolean;
  antiKing?: boolean;
  antiRook?: boolean;

  global?: string[];

  // Editor-created semantic constraints if the app supports checking them.
  constraints?: EditorConstraint[];
}
```

Important:

**Do not put visual rendering data into `PuzzleLogic`.**

**Do not put semantic Sudoku rules into `SudokuPadScene` unless SudokuPad itself uses them to render.**

---

# 7. Exact input resolver

Create `src/sudokupad/loader/resolveInput.ts`.

Responsibilities:

- accept:
  - raw short IDs;
  - SudokuPad URLs;
  - old Cracking the Cryptic URLs;
  - embedded payloads;
- preserve path IDs such as:
  - `blobz/extra-ball`;
  - named setter/puzzle routes;
- extract query settings that affect appearance or game behavior;
- distinguish an embedded payload from a remote ID.

Return:

```ts
interface ResolvedSudokuPadInput {
  sourceId: string;
  payload?: string;
  urlSettings: SudokuPadUrlSettings;
}
```

No rendering/import logic in this module.

---

# 8. Reliable remote puzzle fetching

The current production importer uses public third-party CORS proxies.

That should be replaced.

Current:

```text
GitHub Pages
  → CodeTabs
  → AllOrigins
  → SudokuPad
```

For comprehensive/reliable imports, add an app-controlled proxy.

Recommended:

```text
SphenPad
   ↓
your edge/serverless endpoint
   ↓
https://sudokupad.app/api/puzzle/<id>
```

Possible deployment choices:

- Cloudflare Worker;
- Vercel function;
- Netlify function;
- another tiny edge service.

The endpoint should:

- only accept SudokuPad puzzle IDs/path IDs;
- URL-encode path components;
- fetch the official SudokuPad API;
- enforce response-size limits;
- return text exactly;
- apply caching;
- set CORS for the SphenPad origin;
- never act as an unrestricted URL proxy.

Keep the Vite `/sp-api` proxy for local development.

`public/archive/puzzles/*.json` continues working without network calls.

---

# 9. Exact format registry

Create `src/sudokupad/loader/formatRegistry.ts`.

Register:

```text
scl
ctc         -> alias of scl

fpuz
fpuzzles    -> alias of fpuz

scf

pack
```

Unprefixed strings resolve as remote IDs.

Do not combine `scl` and `fpuz` into a generic “try decompress and hope it looks right” parser.

Each format gets its own exact adapter.

---

# 10. Implement real PuzzleZipper

Create:

```text
src/sudokupad/codecs/puzzleZipper.ts
```

Port SudokuPad's exact key map and compact JSON transformations.

This completely replaces:

```ts
decompressedFromMaybeZipped()
```

and the loose-object heuristics as the normal code path.

Support the captured key aliases including:

```text
color            c
cages            ca
center           ct
borderColor      c1
backgroundColor  c2
cells            ce
cellSize         cs
arrows           a
overlays         o
underlays        u
width             w
height            h
value             v
videos            vd
lines             l
rounded           r
regions           re
fontSize          fs
thickness         th
headLength        hl
wayPoints         wp
title             t
text              te
duration          d
d                 d2
```

Keep compatibility parsing for legacy loose object-literal payloads, but make it a legacy decoder module, not the foundation of the importer.

---

# 11. Exact SCL/CTC parser

Create:

```text
src/sudokupad/codecs/scl.ts
```

Responsibilities:

- strip prefix;
- URL-decode safely;
- decompress;
- PuzzleZipper-unzip;
- return a native `SudokuPadSourcePuzzle`;
- preserve all unknown fields.

Do not immediately transform it into SphenPad-specific constraint structures.

---

# 12. Exact F-Puzzles importer

This is a major replacement.

Create:

```text
src/sudokupad/fpuzzles/parse.ts
src/sudokupad/fpuzzles/import.ts
src/sudokupad/fpuzzles/importGrid.ts
src/sudokupad/fpuzzles/importConstraints.ts
src/sudokupad/fpuzzles/styles.ts
```

Port the behavior of the captured `puzpatcher.bundle.js`.

Recognized keys in the captured build include:

```text
size
disabledlogic
truecandidatesoptions
grid
author
title
ruleset
solution

antiknight
antiking
nonconsecutive
disjointgroups
diagonal+
diagonal-

littlekillersum
arrow
killercage
cage
fogofwar
foglight
ratio
difference
xv
thermometer
palindrome
sandwichsum
even
odd
extraregion
clone
quadruple
betweenline
lockout
minimum
maximum
line
rectangle
circle
text
negative
triggereffect
```

The importer must create native SudokuPad primitives with SudokuPad's exact:

- dimensions;
- colors;
- line thicknesses;
- bulb sizes;
- font sizes;
- coordinate conversions;
- target layers;
- processing order.

Do not preserve the current `thermolines`, `dots`, `whispers`, etc. as renderer structures.

Example:

```text
F-Puzzles thermometer
          ↓
underlay bulb + native line
```

not:

```text
thermolines[]
          ↓
special Canvas thermo renderer
```

---

# 13. SCF decoder

Create:

```text
src/sudokupad/codecs/scf.ts
```

Port the captured `PuzzleTools.decodeSCF` behavior.

Support:

- 9×9 givens;
- standard boxes;
- Windoku flag;
- Sudoku-X flags;
- title;
- author;
- normal-rule metadata.

Return the same native source type as every other decoder.

---

# 14. Puzzle packs

Create:

```text
src/sudokupad/codecs/pack.ts
```

Decode the pack, select the requested puzzle from URL hash/state, then recursively send that puzzle back through the format registry.

Do not assume pack members are SCL.

---

# 15. Metadata normalization

Create:

```text
src/sudokupad/normalize/metadata.ts
```

Port SudokuPad behavior:

- read metadata from cell-less cages containing `key: value`;
- preserve repeated rules;
- merge legacy `metaData`;
- merge modern `metadata` last;
- retain unknown metadata.

Move solve-counter fetching out of the importer.

Current solve-count enrichment can become:

```text
src/services/sudokupadCounters.ts
```

Rendering/parsing a puzzle should never depend on the counter API being available.

---

# 16. Feature recognition

Create:

```text
src/sudokupad/normalize/features.ts
```

Port `PuzzleFeatures` recognition for rendering-affecting cases:

```text
thermos
arrow sums
kropkis
XV
little killers
inequality
sandwich cages
palindrome
Sudoku-X
Windoku
cosmetic
global
```

This is required because SudokuPad sometimes recognizes a generic native shape and then applies a specialized compatibility renderer/class.

Examples:

```text
generic rounded overlay
       ↓ recognizes Kropki
feature-kropki class / compatibility behavior
```

and:

```text
generic blue full-grid diagonal
       ↓ recognizes Sudoku-X
route to overlay layer
```

Do this before rendering.

---

# 17. Legacy compatibility normalization

Create:

```text
src/sudokupad/normalize/compatibility.ts
src/sudokupad/normalize/legacyOpacity.ts
```

Port:

- legacy opacity rules;
- `thickness === 1` line compatibility;
- old cage metadata conventions;
- fog marker cages;
- historical special cases;
- target normalization;
- aliases from older payloads.

Keep every hack named and tested.

Do not scatter compatibility hacks throughout rendering code.

---

# 18. New render scene

Create `src/sudokupad/types/scene.ts`.

The scene should be extremely close to what the renderer consumes:

```ts
interface SudokuPadScene {
  rows: number;
  cols: number;

  cells: SceneCell[];

  regions: SceneCage[];
  cages: SceneCage[];

  lines: SceneLine[];
  arrows: SceneArrow[];

  underlays: SceneGraphic[];
  overlays: SceneGraphic[];

  metadata: PuzzleMetadata;

  fog?: FogDefinition;

  renderSettings: SudokuPadRenderSettings;

  unknown: Record<string, unknown>;
}
```

Keep original array order.

Do not add `renderOrder` guesses unless the original payload/import conversion explicitly establishes order.

Array insertion order and layer selection are sufficient.

---

# 19. Replace Canvas with an SVG renderer

Delete the current drawing implementation inside:

```text
src/ui/GridCanvas.tsx
```

The puzzle itself should render as SVG.

Create:

```text
src/ui/SudokuPadBoard.tsx
src/sudokupad/render/SvgRenderer.ts
```

Recommended React boundary:

```tsx
<SudokuPadBoard
  def={def}
  progress={progress}
  settings={settings}
/>
```

React owns:

```html
<svg id="sphenpad-puzzle-renderer">
```

An imperative `SvgRenderer` owns its child nodes.

This mirrors SudokuPad and makes:

- insertion order;
- `getBBox()`;
- SVG markers;
- masks;
- text metrics;
- external `<image>`;
- arbitrary safe SVG attrs;

much easier to match exactly.

---

# 20. Exact SVG layers

Create these groups in this exact order:

```text
background
underlay
cell-colors
arrows
cages
cell-highlights
cell-grids
cell-errors
overlay
cell-givens
cell-pen
cell-pencilmarks
cell-candidates
cell-values
```

Never collapse them into generic Canvas passes.

---

# 21. Implement `SvgRenderer`

Create:

```text
src/sudokupad/render/SvgRenderer.ts
```

Port these methods behavior-for-behavior:

```text
renderPart
renderLine
pointsToPath
createArrowHead
renderArrow
renderRect
renderText
renderCellWedge
getCellOutline
renderCageLabel
renderCage
renderThermo
renderArrowSum
renderKropki
renderXV
renderLittleKiller
renderPalindrome
renderSudokuX
renderPen
```

Use:

```text
CELL_SIZE = 64
```

throughout the canonical renderer.

Responsive scaling should scale the final SVG, not alter puzzle geometry.

---

# 22. Generic SVG attribute pass-through

This is mandatory for custom puzzles.

Implement the same basic policy as SudokuPad:

- preserve safe SVG attributes;
- reject `on*` event attributes;
- strip renderer-internal fields;
- normalize known aliases;
- sanitize URL-bearing attributes.

Do **not** restrict lines/graphics to the properties your existing `PuzzleCosmetics` happened to know about.

This is a central reason the new renderer will support obscure custom puzzles.

---

# 23. Exact line rendering

Create:

```text
src/sudokupad/render/renderLine.ts
```

Support:

```ts
wayPoints?: [number, number][];
d?: string;
color?: string;
thickness?: number;
opacity?: number;
target?: string;
...safe SVG attrs
```

Coordinate conversion:

```text
x = column × 64
y = row × 64
```

Use round line caps and joins.

Preserve explicit SVG path `d`.

---

# 24. Exact arrows

Create:

```text
src/sudokupad/render/renderArrow.ts
```

Port:

- marker construction;
- stroke vs filled head;
- `headLength`;
- `headAngle`;
- `headIndent`;
- endpoint retraction;
- opacity;
- exact marker dimensions.

Do not approximate arrowheads with Canvas triangles.

---

# 25. Exact generic graphics

Create:

```text
src/sudokupad/render/renderRect.ts
```

Support:

```text
center
width
height
angle
borderSize
thickness
backgroundColor
borderColor
rounded
roundedRadius
opacity
className
```

Use SudokuPad's exact rectangle geometry and border inset calculation.

This replaces most of the existing special Canvas handling for:

- dots;
- bulbs;
- squares;
- parity markers;
- shading;
- custom symbols.

---

# 26. Exact text

Create:

```text
src/sudokupad/render/renderText.ts
```

Port:

- text offsets;
- property normalization;
- font size;
- rotation;
- multiline `<tspan>` handling;
- `maxWidth`;
- `getBBox()`;
- `textLength`;
- small-text background rectangle;
- black/white CSS variable normalization;
- text stroke;
- anchors.

Do not use Canvas `measureText` as the canonical puzzle text renderer.

---

# 27. Exact cage/region outlines

Create:

```text
src/sudokupad/render/cellOutline.ts
src/sudokupad/render/renderCage.ts
```

Port SudokuPad's exact 3×3-neighborhood pattern algorithm.

Support:

- concave cages;
- disconnected cages;
- arbitrary regions;
- killer;
- box;
- Windoku;
- extra region;
- row/column/box indexer styles.

Do not use bounding boxes or independently invented tracing.

---

# 28. Exact grid and cell rendering

Create:

```text
src/sudokupad/render/renderGrid.ts
src/sudokupad/render/renderCells.ts
```

Port:

- one-cell grid lines;
- region borders as box cages;
- givens;
- player values;
- candidates;
- corner marks;
- cell colors;
- error/highlight layers;
- zero-is-ten;
- visibility precedence;
- source-given center/corner marks.

Keep user gameplay state in `PuzzleProgress`.

The renderer receives both:

```text
scene
+
progress
```

and generates the complete SVG.

---

# 29. Extract interaction code from `GridCanvas.tsx`

The useful pointer/gesture code does not need to be discarded.

Move it to:

```text
src/ui/BoardInteractionLayer.tsx
```

This module owns:

- pointer-to-grid conversion;
- selection;
- drag selection;
- long press;
- line-tool gestures;
- edge/node detection;
- double tap.

It should not draw puzzle content.

Preferred layout:

```tsx
<div className="boardSurface">
  <SudokuPadBoard ... />
  <BoardInteractionLayer ... />
</div>
```

The interaction layer can be:

- a transparent SVG group/rect; or
- a transparent HTML element exactly aligned with the SVG.

Convert pointer coordinates through the SVG viewBox so outside-grid bounds and responsive scaling remain correct.

Eventually delete `GridCanvas.tsx`, or replace it with a tiny compatibility wrapper while callers are migrated.

---

# 30. Fog implementation

Create:

```text
src/sudokupad/fog/normalizeFog.ts
src/sudokupad/fog/fogState.ts
src/sudokupad/fog/fogMasks.ts
```

Do not keep the current Canvas fog implementation.

Port SudokuPad's actual approach:

- normalize `foglight`;
- normalize `triggereffect`;
- derive `foglink`;
- calculate currently lit cells;
- mark hidden givens;
- use SVG masks.

Fogged layers:

```text
background
underlay
arrows
cages
overlay
cell-givens
```

Keep player values/marks according to SudokuPad's visibility rules.

Port final mask geometry/colors rather than drawing opaque gray Canvas cells.

---

# 31. Background/external image assets

Create:

```text
src/sudokupad/assets/assetResolver.ts
src/sudokupad/assets/imageAssets.ts
src/sudokupad/assets/historicalAssets.ts
```

Support puzzle metadata:

```text
bgimage
bgimageopacity
bgimagetarget
```

Render background images as SVG `<image>`.

Match SudokuPad behavior:

```text
target defaults to background
opacity parsed/clamped
preserveAspectRatio="none"
image covers current complete viewBox
```

Support the historical ID-specific background-image exceptions from the captured build.

## External asset policy

`AssetResolver` should:

- accept only supported schemes;
- resolve relative SudokuPad asset paths;
- sanitize URLs;
- cache fetch/load state;
- expose failed asset diagnostics;
- support normal browser `<image href>` rendering;
- optionally proxy assets when direct cross-origin loading fails.

For truly reliable external assets on GitHub Pages, use the same small app-controlled edge service recommended for remote puzzle fetching.

Add a restricted route such as:

```text
GET /asset?url=<encoded>
```

but protect it against SSRF:

- only `http` / `https`;
- block localhost/private/link-local networks;
- response-size cap;
- image/font MIME allowlist;
- timeout;
- redirects revalidated;
- caching.

Alternatively, allow direct URL loading first and use proxy fallback.

---

# 32. Twemoji

The repo already depends on:

```text
twemoji 14.0.2
```

Keep that dependency, but move visual replacement to:

```text
src/sudokupad/assets/twemojiAssets.ts
```

Use the same pinned asset family as SudokuPad:

```text
Twemoji 14.0.2 SVG
```

The SVG renderer should replace eligible rendered text with `<image>` after measuring the text bounding box.

Do not keep the existing Canvas-specific `HTMLImageElement` emoji path as the authoritative implementation.

Cache resolved emoji image URLs.

---

# 33. Default SudokuPad fonts

For puzzle digits/clues, match SudokuPad's captured default font behavior.

The core board font stack is:

```css
Tahoma, Roboto, Arial, sans-serif
```

Global application text uses:

```css
Roboto, Arial, sans-serif
```

SudokuPad title UI uses Lobster, but that is app chrome rather than puzzle rendering.

For deterministic tests:

- ensure Roboto is loaded before snapshot comparison;
- use the same browser engine;
- wait on `document.fonts.ready`.

Do not use the current GridCanvas stack:

```text
Lato / Noto Sans / Segoe UI
```

for canonical SudokuPad rendering.

---

# 34. All 13 optional SudokuPad puzzle fonts

Create:

```text
src/sudokupad/assets/fontRegistry.ts
src/sudokupad/assets/fontLoader.ts
```

Registry:

```ts
interface PuzzleFontDefinition {
  id: string;
  name: string;
  url: string;
  translateX?: number;
  translateY?: number;
  scale?: number;
}
```

The captured build defines:

```text
baublemonogram       Bauble Monogram       y -10  scale 1.2
bonnet               Bonnet                y +5   scale 1.2
cartoonblocks        Cartoon Blocks               scale 1.3
dickensianchristmas  Dickensian Christmas y -3
firstsnow            First Snow                   scale 1.5
christmastinsel      Christmas Tinsel      y -5   scale 1.25
christmasfont        Christmas Font        y -5
happychristmas       Happy Christmas       y -5   scale 1.1
rudolph              Rudolph                      scale 1.2
snowballs            Snowballs              y -5   scale 1.4
stnichols            St. Nichols            y +5   scale 1.1
xtree                 X-Tree                 y +10  scale 1.2
sevensegment          Seven Segment          y +5   scale 1.1
```

SudokuPad applies them only to:

```text
.cell-given
.cell-value
```

using:

```text
font-family: puzzlefont-<id>
translate(x,y)
font-size = round(48 * scale) px
```

Support:

- URL query `puzzlefont=<id>`;
- legacy numeric `digitfont=<index>`;
- SphenPad stored setting if you want user selection.

## Font binaries

For the strongest reliability, use pinned local copies in something like:

```text
public/vendor/sudokupad/fonts/
```

after confirming the licenses permit redistribution.

Do not depend on cross-origin font loading from SudokuPad at runtime if you want a guarantee; browser font CORS can break that.

If redistribution is not permitted, route them through your controlled asset service or load them from their original location and document that those optional user-selected fonts depend on the upstream asset remaining available.

The implementation should not assume optional fonts have loaded synchronously:

```ts
await fontLoader.ensureFont(id);
await document.fonts.ready;
```

before final measurement/snapshot.

---

# 35. Renderer CSS

Create:

```text
src/sudokupad/styles/sudokupad-renderer.css
```

Port only puzzle-renderer-relevant CSS from the captured SudokuPad styles.

Include:

- SVG text defaults;
- grid;
- box cages;
- cell givens;
- values;
- candidates;
- pencil marks;
- ten corner-mark transforms;
- selected feature classes;
- Kropki;
- XV;
- dark mode;
- outlines-on-lines;
- outlines-on-digits;
- dashed/no grid;
- hide colors;
- large digits;
- alternate marks;
- custom puzzle-font classes.

Do not copy unrelated SudokuPad page/dialog/control CSS.

Namespace SphenPad's version beneath:

```css
.sphenpad-sudokupad-renderer
```

to avoid collisions with the rest of `src/app/styles.css`.

---

# 36. Render settings model

Create:

```text
src/sudokupad/types/settings.ts
```

Include:

```ts
interface SudokuPadRenderSettings {
  darkMode: boolean;
  largeDigits: boolean;
  alternateMarks: boolean;

  hideColours: boolean;
  dashedGrid: boolean;
  noGrid: boolean;

  outlineDigits: boolean;
  outlineLines: boolean;

  arrowsAboveLines: boolean;

  hideBackgroundImage: boolean;
  disableEmoji: boolean;

  puzzleFont?: string;
}
```

Define one explicit default profile for imports and regression tests.

The current SphenPad theme can map onto this profile where appropriate, but do not silently change canonical geometry/colors based on unrelated SphenPad theme colors.

---

# 37. ViewBox/content bounds

Create:

```text
src/sudokupad/render/contentBounds.ts
```

Replace the current manual `worldBounds` estimation.

After rendering, inspect actual SVG geometry using `getBBox()` including:

- fill;
- stroke;
- markers.

Then apply SudokuPad's padding/snapping/viewBox rules.

This automatically handles:

- outside clues;
- external arrows;
- rotated text;
- large stroke widths;
- marker arrowheads;
- arbitrary custom graphics.

Responsive display becomes:

```text
SVG viewBox
+
CSS max-width/max-height
```

instead of dynamically changing cell geometry.

---

# 38. Arrows/lines z-order

Port the SudokuPad `arrowsabovelines` setting.

Both normally render into the same `arrows` group.

Default:

```text
arrows first
lines second
```

With setting enabled:

```text
lines first
arrows second
```

Preserve original source array order inside each collection.

Remove custom `renderOrder` as a general replacement for native order unless it is needed for SphenPad-created content and is converted into native array ordering before rendering.

---

# 39. Unknown-field diagnostics

Create:

```text
src/sudokupad/diagnostics/unknownFields.ts
```

The importer should report, in development/testing:

```text
unknown top-level native field
unknown source line field
unknown source graphic field
unknown source cage field
unknown F-Puzzles key
unknown feature-recognition result
unsupported external asset
failed optional font
```

Do not necessarily fail rendering for unknown safe SVG attrs.

The archive audit script should produce counts so future SudokuPad changes become obvious.

---

# 40. Use the existing archive as the real-world regression corpus

This repo already contains a very large cache:

```text
public/archive/puzzles/*.json
```

That is ideal.

Create:

```text
scripts/audit-sudokupad-archive.ts
```

For every cached payload:

1. parse with the new importer;
2. collect source top-level keys;
3. collect primitive-property keys;
4. collect unknown F-Puzzles fields;
5. collect external image URLs;
6. collect required fonts/settings;
7. assert no importer exception;
8. optionally generate an SVG.

Output:

```text
reports/sudokupad-archive-audit.json
reports/sudokupad-archive-unknown-fields.json
```

This corpus is validation, not the specification.

---

# 41. Differential renderer test suite

Add dev dependencies such as:

```text
vitest
@playwright/test
pixelmatch
pngjs
```

or equivalent.

Tests should have two layers.

## Structural

Compare normalized SVG:

- number/order of groups;
- node types;
- path `d`;
- x/y/width/height;
- transforms;
- fill/stroke;
- opacity;
- marker geometry;
- text;
- classes.

Normalize generated arrow marker IDs before comparison.

## Raster

Render both in the same Chromium/font environment and compare PNGs.

Set a small anti-aliasing tolerance, but fail on significant geometry/color/text discrepancies.

---

# 42. Synthetic fixtures

Build fixtures for every actual renderer branch, not every Sudoku variant.

At minimum:

```text
line:
  waypoint
  raw d
  fractional
  outside board
  thickness
  arbitrary safe SVG attrs

arrow:
  stroke head
  filled head
  head length
  angle
  indent
  tiny final segment

rect:
  fill
  stroke
  same fill/stroke
  rounded
  radius
  opacity
  rotation

text:
  ordinary
  multiline
  long/maxWidth
  rotation
  background
  stroke
  emoji

cage:
  single
  rectangle
  L
  concave
  disconnected
  every style
  long clue

cells:
  givens
  player values
  center marks
  corner marks
  candidates
  zero-is-ten

fog:
  initial lights
  normal reveal
  trigger reveal
  hidden givens
  outside-grid clue
```

Also one fixture per F-Puzzles recognized key.

---

# 43. Keep existing app state/progress

Do not rewrite:

```text
folders
Firebase sync
timer
undo/redo
PuzzleProgress concept
selection
tool state
```

unless needed independently.

Update `makeInitialProgress()` to derive initial givens from the new scene/definition.

`PuzzleProgress.cells` can remain the user's mutable gameplay state.

The SVG renderer merges:

```text
immutable puzzle scene
+
mutable PuzzleProgress
```

---

# 44. Saved-puzzle migration

Bump the import revision substantially.

When opening an imported puzzle with an old revision:

```text
if sourcePayload exists:
    re-import from sourcePayload with new importer
    preserve metadata enrichment
    migrate progress
    clear unsafe undo/redo if layout changed
```

This is already similar to the mechanism in `PuzzlePage.tsx`.

For creator puzzles with no original SudokuPad payload:

create one temporary migration module:

```text
src/migrations/legacyCosmeticsToScene.ts
```

It converts existing `PuzzleCosmetics` once into the new native scene.

This module is **not** part of the new importer/renderer and should not be used for new puzzles.

Add a schema version to saved definitions.

---

# 45. Update `PuzzlePage.tsx`

Replace imports:

```text
loadFromSudokuPad
GridCanvas
```

with:

```text
loadSudokuPadPuzzle
SudokuPadBoard
BoardInteractionLayer
```

Update:

```text
def.cosmetics.solution
```

to:

```text
def.logic.solution
```

Replace constraint-bullet extraction from renderer cosmetics with either:

- normalized semantic `def.logic.constraints`; or
- imported metadata/rules.

Do not infer semantic puzzle types from visual arrays in page UI.

---

# 46. Update archive/folder/menu previews

These components currently render `GridCanvas`:

```text
CtCArchivePage
FoldersPage
MainMenu
PauseOverlay
PuzzleCreatorPage
PuzzleEditorPage
```

Switch previews to:

```tsx
<SudokuPadBoard
  ...
  interactive={false}
  previewMode
/>
```

The same renderer must be used everywhere.

Do not maintain a separate lightweight preview renderer.

---

# 47. Update `PuzzleMetadataOverlay.tsx`

Move:

```text
def.cosmetics.solution
```

to:

```text
def.logic.solution
```

Puzzle metadata editing should not directly mutate renderer structures except when specifically editing visual metadata such as background image.

---

# 48. Replace editor output model

`PuzzleEditorPage.tsx` currently writes special renderer arrays:

```text
thermolines
whispers
renbanlines
palindromes
dots
...
```

Replace that.

The editor should create:

```text
native visual primitives
+
separate semantic/editor constraints
```

Example:

```text
Thermometer editor action
    ↓
scene underlay bulb
scene line
logic constraint {type:"thermo", cells:[...]}
```

Example:

```text
Kropki editor action
    ↓
scene overlay rounded rect
logic constraint {type:"ratio", cells:[...], value:2}
```

The visual component is what gets rendered.

The semantic component is what SphenPad can check.

This means future unsupported Sudoku variants can still be drawn without adding a renderer type.

---

# 49. Creator/export format

Stop exporting `PuzzleDefinition` as if it were a public puzzle format.

Define a versioned SphenPad editor format:

```ts
interface SphenPadPuzzleFile {
  format: "sphenpad";
  version: 2;
  scene: SudokuPadScene;
  logic: PuzzleLogic;
  meta: PuzzleMeta;
}
```

Optionally add SCL export later from the canonical scene.

Imported SudokuPad puzzles should retain their original `sourcePayload` separately.

---

# 50. Constraint checker separation

Current visual structures are also used for checker logic in `PuzzleEditorPage`.

Move semantic checking to:

```text
src/core/constraints/
```

For example:

```text
thermo.ts
whisper.ts
renban.ts
palindrome.ts
killer.ts
kropki.ts
antiKnight.ts
antiKing.ts
```

This is outside the renderer.

A visually correct imported puzzle should still display even if SphenPad cannot semantically check a custom rule.

---

# 51. External asset caching

For production robustness, introduce:

```ts
interface ResolvedAsset {
  originalUrl: string;
  resolvedUrl: string;
  type: "image" | "font" | "emoji";
  state: "loading" | "ready" | "failed";
}
```

Optionally cache fetched assets in Cache Storage / IndexedDB.

Important benefits:

- background images do not disappear when repeatedly reopening a puzzle;
- optional fonts load deterministically;
- offline/archive browsing improves;
- failures can be surfaced.

Do not put large binaries inside the normal puzzle Dexie row.

---

# 52. Font selection UI

Add an optional SudokuPad-compatible puzzle-font control to `SettingsOverlay.tsx`.

Choices:

```text
Default
Bauble Monogram
Bonnet
Cartoon Blocks
Dickensian Christmas
First Snow
Christmas Tinsel
Christmas Font
Happy Christmas
Rudolph
Snowballs
St. Nichols
X-Tree
Seven Segment
```

This setting changes only puzzle givens/player values.

It should not change:

- clue text;
- cage labels;
- candidates;
- corner marks;
- app UI.

That matches SudokuPad's captured behavior.

---

# 53. SphenPad theme vs puzzle theme

Currently SphenPad's theme choices affect Canvas rendering directly.

Separate:

```text
application chrome theme
```

from:

```text
SudokuPad puzzle render settings
```

If SphenPad wants themed puzzle rendering, map to explicit SudokuPad-equivalent settings.

Do not let arbitrary app-theme colors alter the imported puzzle's authored colors.

For compatibility tests, use a fixed default SudokuPad render profile.

---

# 54. Files to remove after migration

Once the replacement passes tests:

```text
DELETE/REPLACE:
src/core/sudokupad.ts
src/ui/GridCanvas.tsx
PuzzleCosmetics in src/core/model.ts
Canvas puzzle-rendering helpers
Canvas Twemoji rendering
Canvas fog rendering
Canvas background-image rendering
heuristic variant drawing
manual world-bounds estimation
decompressedFromMaybeZipped placeholder
third-party production CORS proxy dependency
```

A tiny backward-compatibility re-export file named `core/sudokupad.ts` is acceptable temporarily, but it should contain no parser logic.

A tiny `GridCanvas.tsx` alias is acceptable temporarily while callers migrate, but it should not contain Canvas rendering code.

---

# 55. Files that can remain largely intact

```text
src/core/storage.ts
src/core/appState.ts
src/core/localDataState.ts
src/core/syncSignal.ts
src/core/time.ts
src/core/undo.ts
src/firebase/client.ts
archive metadata parser
folders/account sync
most PuzzlePage controls
keyboard/toolbars
YouTube integration
```

These are not the problem.

---

# 56. Recommended implementation phases

## Phase 1 — infrastructure/model

Implement:
- source types;
- scene types;
- render settings;
- new `PuzzleDefinition.scene`;
- `PuzzleDefinition.logic`;
- migration scaffolding.

No rendering switch yet.

## Phase 2 — exact native SVG renderer

Implement:
- layer skeleton;
- `SvgRenderer`;
- line;
- rect;
- text;
- arrows;
- cage outlines;
- grid;
- cells;
- content bounds.

Feed it hand-built native fixtures.

## Phase 3 — exact SCL/CTC importer

Implement:
- LZ/decompression;
- PuzzleZipper;
- source normalization;
- metadata;
- feature recognition;
- legacy compatibility.

Start rendering cached native SCL archive puzzles.

## Phase 4 — F-Puzzles/SCF/pack

Port:
- F-Puzzles converter;
- SCF;
- puzzle packs.

## Phase 5 — fog/assets/fonts

Implement:
- fog normalization;
- masks;
- background images;
- historical image exceptions;
- Twemoji;
- default fonts;
- 13 optional puzzle fonts;
- controlled external asset loading/proxy.

## Phase 6 — application cutover

Replace:
- `GridCanvas`;
- `loadFromSudokuPad`;
- preview rendering;
- PuzzlePage rendering.

Reimport all existing imported puzzles.

## Phase 7 — editor conversion

Change creator/editor from `PuzzleCosmetics` to:
- native scene primitives;
- semantic constraint model.

Add one-time migration for old creator puzzles.

## Phase 8 — conformance

Add:
- unit fixtures;
- structural SVG comparison;
- Playwright raster comparison;
- full archive parser audit;
- large real-puzzle regression run.

Only after this phase remove the legacy implementation completely.

---

# 57. Acceptance criteria for deleting the old renderer/importer

Do not keep the old code as fallback.

Delete it when:

- every registered SudokuPad format parses;
- all archived cached puzzle payloads parse without unexplained errors;
- unknown fields report is empty or intentionally classified;
- all renderer primitive fixtures match the SudokuPad oracle;
- fog fixtures match;
- background-image fixtures match;
- Twemoji fixture matches;
- default fonts match;
- all 13 optional puzzle-font settings work;
- outside-grid/viewBox fixtures match;
- several hundred/thousand archive puzzle renders pass visual tolerance;
- existing saved imported puzzles successfully re-import;
- legacy creator puzzles migrate;
- preview screens use the same new SVG renderer;
- no production code imports `PuzzleCosmetics`;
- no production code uses Canvas to render imported puzzle content.

At that point the previous importer and renderer should be removed rather than retained as fallback.


---

# 58. SECOND-PASS CORRECTIONS / ADDITIONS

The following items were added after a second audit of the SphenPad repo and the captured SudokuPad build. These are not optional niceties; they close real gaps in the first outline.

## 58.1 Separate persisted puzzle data from runtime render data

**Correction to sections 6 and 18:** do not persist a fully expanded `scene` alongside `sourcePayload` for imported puzzles.

SphenPad currently serializes each full `PersistedPuzzle` to JSON and stores it as the `payload` field of an individual Firestore puzzle document. Persisting:

```text
compressed/original SudokuPad payload
+
expanded native scene
+
derived feature data
```

would duplicate most puzzle data and can become problematic for large/custom-art puzzles.

Use two types:

```ts
interface PersistedPuzzleDefinition {
  id: string;
  sourceId: string;

  sourcePayload?: string;       // authoritative for imported puzzles
  creatorScene?: SudokuPadSourcePuzzle; // authoritative only for SphenPad-created puzzles

  importRevision?: number;
  schemaVersion: number;

  rows: number;
  cols: number;
  size: number;

  meta: PuzzleMeta;
  logic: PuzzleLogic;
  givens: Array<{ rc: CellRC; v: string }>;
}

interface LoadedPuzzleDefinition extends PersistedPuzzleDefinition {
  // Runtime only; never synced directly.
  scene: SudokuPadScene;
  sourcePuzzle: SudokuPadSourcePuzzle;
}
```

For imported puzzles:

```text
persist:
    sourcePayload
    metadata/logic needed by SphenPad
    progress

runtime:
    decode sourcePayload
    build sourcePuzzle
    build scene
```

For creator puzzles:

```text
persist:
    creatorScene
    creator semantic logic
```

Do not persist:
- DOM nodes;
- SVG elements;
- `FontFace` objects;
- image elements;
- masks;
- feature objects containing object references;
- render caches;
- browser-dependent bounding boxes.

`sourceData` in the current `PuzzleDefinition` should either be removed or explicitly made transient. It must not become a second copy of the decoded payload in cloud storage.

## 58.2 Render-plan feature annotations must be transient and acyclic

SudokuPad's runtime feature recognition can attach objects such as `part.feature`, and some feature descriptors refer to other pieces.

Do not persist these runtime annotations as-is.

Use stable transient descriptors:

```ts
interface RenderFeatureTag {
  type: string;
  sourceIndex?: number;
  relatedSourceIndices?: number[];
  data?: Record<string, unknown>;
}
```

or construct the recognized render plan every time the source puzzle is loaded.

The persisted source puzzle must remain plain JSON.

## 58.3 Exact URL-setting behavior

SudokuPad has a generic query-setting mechanism:

```text
?setting-<name>=<bool>
```

Every query key beginning with:

```text
setting-
```

is temporarily applied as a SudokuPad setting.

Boolean true values are:

```text
true
t
1
<empty string>
```

Everything else becomes false.

The setting name also normalizes American `color` spelling to SudokuPad's `colour` spelling.

Therefore `parseUrlSettings.ts` should not only special-case `nogrid` and `conflictchecker`.

Implement:

```ts
function parseSudokuPadQuerySettings(url: URL): Record<string, boolean> {
  // Parse every setting-* query parameter.
}
```

Then separately handle non-boolean query options such as:

```text
puzzlefont=<font-id>
digitfont=<legacy numeric index>
```

If your compatibility contract uses a fixed default visual profile, URL settings should still be parsed because authors can distribute puzzle URLs that intentionally force a display setting.

## 58.4 Exact optional font asset URLs

The captured SudokuPad build defines these actual font files:

```text
/assets/fonts/Bauble_Monogram.ttf
/assets/fonts/Bonnet__.ttf
/assets/fonts/CartoonBlocksChristmas-Regular.ttf
/assets/fonts/DickensianChristmas.ttf
/assets/fonts/Firstsnow-nRYmg.ttf
/assets/fonts/PWChristmasTinsel.ttf
/assets/fonts/PWChristmasfont.ttf
/assets/fonts/PWHappyChristmas.ttf
/assets/fonts/Rudolph.otf
/assets/fonts/Snowballs.ttf
/assets/fonts/stnicholas.ttf
/assets/fonts/XTREE.TTF
/assets/fonts/SevenSegment.ttf
```

And font picker preview images:

```text
/assets/fonts/option_1.png
...
/assets/fonts/option_13.png
```

The actual font binaries were **not in the supplied HAR** because none of those optional fonts was active during capture.

Therefore one remaining asset-acquisition task exists before claiming optional-font independence:

1. download these 13 files from the pinned SudokuPad build;
2. record SHA-256 hashes;
3. inspect redistribution licenses;
4. if redistribution is permitted, vendor exact copies under SphenPad;
5. otherwise use the controlled asset service and keep the original URL/hash manifest.

Add:

```text
assets/sudokupad-0.612.0-font-manifest.json
```

containing:

```ts
{
  id,
  upstreamUrl,
  sha256,
  localUrl?,
  licenseStatus
}
```

A font file whose hash changes upstream must not silently replace the pinned compatibility font.

## 58.5 Default font loading must also be pinned for tests

The default puzzle stack is:

```text
Tahoma, Roboto, Arial, sans-serif
```

But Tahoma/Arial availability varies by OS.

Visual conformance tests must therefore run in a controlled environment with deterministic fonts.

Recommended:

- same Chromium image/container for reference and candidate;
- wait for `document.fonts.ready`;
- capture the exact web-loaded Roboto resources from the pinned SudokuPad build;
- allow platform fallback differences only outside strict CI.

Do not treat macOS-vs-Linux Tahoma fallback differences as renderer bugs.

## 58.6 External image asset behavior: reproduce SudokuPad's sizing exactly

Background image rendering must use the final puzzle dimensions:

```text
x      = -marginLeft
y      = -marginTop
width  = boardWidth + marginLeft + marginRight
height = boardHeight + marginTop + marginBottom
preserveAspectRatio = none
```

Opacity behavior:

```text
parseFloat(value)
NaN -> 0.2
clamp 0..1
round to nearest 0.01
```

Target:

```text
metadata.bgimagetarget || "background"
```

The asset is loaded only after dimensions/viewBox are known.

This creates a dependency cycle:

```text
render puzzle geometry
→ compute viewBox/dimensions
→ add background image
→ ensure final dimensions still stable
```

Implement this as an explicit post-layout asset pass.

## 58.7 External assets need an asset provenance/cache key

Do not cache external resources only by URL.

Use:

```ts
interface ExternalAssetKey {
  url: string;
  type: "background-image" | "emoji" | "font";
  expectedHash?: string;
}
```

For author-supplied background images there is normally no expected hash, so preserve:
- original URL;
- fetched content type;
- final resolved URL after redirects;
- optional ETag/Last-Modified;
- failure status.

For pinned SudokuPad-owned fonts/Twemoji, use hashes when practical.

## 58.8 Remote short-ID fetch behavior should match PuzzleLoader exactly

The new controlled SphenPad endpoint should reproduce SudokuPad's fallback sequence:

```text
1. /api/puzzle/<path-component-encoded-id>
2. https://sudokupad.svencodes.com/ctclegacy/<whole-id-encoded>
3. Firebase legacy storage
```

Important distinction:

- local `/api/puzzle` encodes each slash-separated component separately;
- the legacy proxy encodes the whole ID;
- Firebase encodes the whole ID.

For the Firebase response:
- PuzzleZipper `zip()` is applied before subsequent processing.

For any fetched response except a puzzle pack:
- if it still has no recognized format prefix, SudokuPad wraps/compresses it as an `scl` payload before parsing.

The SphenPad edge endpoint can expose one normalized response, but its behavior should be tested against the above sequence.

## 58.9 Cached archive payloads need a `raw response` adapter

`public/archive/puzzles/*.json` stores the API payload as retrieved at archive-sync time.

Do not assume every cached record is already a perfectly prefixed payload.

Add:

```ts
parseCachedSudokuPadResponse(payload: string)
```

that performs the same post-fetch normalization as `PuzzleLoader.fetchPuzzle()`.

This allows historical cache entries to remain usable even if some were stored before a loader behavior change.

## 58.10 Update `scripts/sync-ctc-archive-cache.ts`

The first outline omitted this production integration point.

Its current:

```ts
isEmbeddedPuzzlePayload()
```

only recognizes:

```text
scl
ctc
fpuz
fpuzzles
```

Update it to use the new shared format registry so it also understands:

```text
scf
pack
```

and any future registered format.

Also replace duplicate source-ID parsing/fetch logic with shared Node-compatible loader utilities where possible.

The archive sync should:
- follow the exact short-ID encoding rules;
- use exact fetch fallbacks or an equivalent controlled endpoint;
- validate payloads with the exact decoder;
- never maintain a second independent definition of “valid SudokuPad payload.”

## 58.11 GitHub Actions must run compatibility audit

Update CI:

```text
.github/workflows/deploy.yml
.github/workflows/archive-cache-sync.yml
```

Add before deployment:

```text
npm run build
npm run test:sudokupad
npm run audit:sudokupad-archive
```

The deploy should fail if:
- a core synthetic conformance fixture regresses;
- importer throws on existing archive payloads;
- newly unknown native/F-Puzzles fields exceed an explicit allowlist.

Pixel-diff tests against live SudokuPad should not necessarily block every deploy because upstream SudokuPad can change. Keep:
- pinned-oracle tests blocking;
- live-upstream comparison scheduled/reporting.

## 58.12 Add a pinned upstream manifest

Create:

```text
src/sudokupad/upstream/manifest.ts
```

or JSON:

```text
sudokupad-upstream-0.612.0.json
```

Record:
- application-reported version;
- captured resource query version;
- SHA-256 of core JS/CSS files;
- font hashes;
- Twemoji version;
- known historical background-image assets;
- expected layer order.

This makes “compatible with SudokuPad 0.612.0” reproducible rather than just a comment.

## 58.13 Preserve exact source-array order

Do not sort:
- lines;
- arrows;
- underlays;
- overlays;
- cages;

unless SudokuPad explicitly sorts a particular structure.

Same-layer source order affects painting.

Cage label-cell selection is one of the few places where SudokuPad intentionally sorts cells.

Avoid carrying the current `renderOrder` field into the new format. Correct array order should make it unnecessary.

## 58.14 Ragged/non-square grids need first-class tests

SudokuPad determines:

```text
rows = cells.length
cols = maximum row length
```

not `rows === cols`.

The current creator already supports custom width/height up to 30.

Add fixtures for:
- rectangular boards;
- ragged cell rows;
- blank outer/helper cells;
- puzzle solution containing blank markers;
- active Sudoku region smaller than the full displayed rectangle.

Do not derive dimensions from solution length alone.

## 58.15 Port active-cell bounds for gameplay semantics

SudokuPad's checker computes an active cell rectangle using actual puzzle contents/solution and then creates implicit row/column cages unless:

```text
metadata.norowcol === true
```

It also turns recognized:
- Sudoku-X diagonals;
- Windoku regions;
- X/V clues

into logical cages/groups for checking.

This does not substantially change static geometry, but it matters if SphenPad promises SudokuPad-like conflict checking.

Add:

```text
src/sudokupad/logic/buildCoreGroups.ts
```

Port:
- active min/max cell bounds;
- implicit row groups;
- implicit column groups;
- `metadata.norowcol`;
- Sudoku-X groups;
- Windoku groups;
- X/V sum groups;
- disjoint/rowcol cage semantics.

This replaces current ad-hoc `rowColCells` / `rowColAreas` derivation.

## 58.16 Preserve `metadata.grids`

The captured `feature-gridrules.js` reads:

```text
currentPuzzle.metadata.grids
```

to display different rules/title/author sections depending on which grid cells are selected.

This does not affect static board rendering, but it **is puzzle-authored metadata** and can matter in multi-grid puzzles.

Ensure `metadata.grids` is preserved losslessly.

If SphenPad wants functional parity for rules UI, add later:

```text
src/ui/GridRulesPanel.tsx
```

which selects applicable grids based on current selected cells.

Do not throw `metadata.grids` away during normalization.

## 58.17 Distinguish rendering from optional SudokuPad UI/experimental effects

The captured app contains features that are not part of authored puzzle rendering:

```text
feature-largepuzzle
feature-markup
feature-puzzleevents
feature-streamtool
feature-seasonal
feature-project9x9
...
```

Do not accidentally add these to the core compatibility requirement.

Examples:
- `feature-largepuzzle` changes pan/zoom UI only;
- `feature-markup` is a user drawing overlay;
- `feature-puzzleevents` creates confetti/snow/audio-style effects;
- `feature-gridrules` changes rules UI, not board SVG.

Document this boundary in code and tests.

The renderer guarantee concerns **stock puzzle-authored board output** plus payload-defined dynamic behavior such as fog/background images.

## 58.18 Historical compatibility exceptions need exact asset manifest

The plan already mentions:

```text
NJbPwMVNwZ
MONOPOLYSUDOKU
```

Add exact legacy asset specifications from the captured build:

```text
NJbPwMVNwZ
  /images/puzzles/NJbPwMVNwZ.png
  width   1024 * 0.566
  height  1024 * 0.566
  opacity 0.4
  x      -2
  y      -2

MONOPOLYSUDOKU
  /images/puzzles/monopolysudoku.png
  width   1024 * 0.66
  height  1024 * 0.66
  opacity 0.4
  x      -50
  y      -50
```

Experimental-only exceptions in the captured build:

```text
jh6RDHdBmq
R9h8LBHngd
TmMBJj8jbr
R68bTRmnrP
p27QN9Ldtj
```

Keep them in a table with:

```ts
experimentalOnly: true
```

rather than scattering ID checks through the renderer.

## 58.19 Preserve the known solution compatibility correction

The captured SudokuPad build contains a hard-coded correction for puzzle:

```text
3DBNbtLfdp
```

where one known bad solution string is replaced with a corrected solution.

This is not a renderer issue, but it belongs in the pinned compatibility layer if the goal is complete stock behavior.

Put it in:

```text
normalize/compatibility.ts
```

with an explicit test and comment indicating that it is an upstream compatibility exception.

## 58.20 Fonts/assets should be preloaded before layout measurement

Several renderer behaviors use `getBBox()`:
- text max-width compression;
- content bounds;
- emoji replacement;
- final viewBox.

Therefore rendering must not finalize bounds before fonts/assets that affect geometry are ready.

Recommended lifecycle:

```text
decode
→ determine required font
→ ensure font loaded
→ render text/geometry
→ wait animation frame
→ run emoji replacement if enabled
→ measure content
→ establish viewBox
→ load/position background image
→ final measure only if asset changes bounds
```

Background images normally fill the already-computed viewBox and should not expand bounds themselves.

## 58.21 Do not use external-asset proxying to weaken SVG security

The exact stock SudokuPad renderer permits broad SVG attribute pass-through, but SphenPad runs on a different security boundary.

Compatibility must not mean:
- arbitrary event handlers;
- javascript: URLs;
- unvalidated external `<use>`;
- unrestricted CSS URLs;
- SSRF through the asset proxy.

Build a `sanitizeSvgAttribute()` layer and maintain a compatibility test corpus showing that legitimate SudokuPad payloads still render identically.

If one exotic payload requires an unsafe construct, treat it as an explicit unsupported security exception rather than silently enabling code execution.

## 58.22 Source URL parsing must keep both puzzle identity and settings

The current `parseSourceId()` discards useful URL context too early.

New loader input should retain:

```ts
interface SudokuPadInputDescriptor {
  originalInput: string;
  sourceId: string;
  embeddedPayload?: string;

  query: URLSearchParams;
  hash: string;

  renderOverrides: Record<string, boolean | string>;
}
```

This is needed because:
- query settings affect render behavior;
- `puzzlefont` / `digitfont` affect font;
- `pack` uses hash/state to choose member;
- named path IDs can contain slashes.

Never normalize everything to a bare source ID at the first step.

## 58.23 Add `renderingProfileVersion`

Persist the render compatibility target separately from importer schema:

```ts
rendererProfile: "sudokupad-0.612.0"
```

This allows future upgrades:

```text
sudokupad-0.612.0
sudokupad-0.6xx.x
...
```

without conflating:
- SphenPad persistence schema version;
- importer revision;
- upstream SudokuPad rendering profile.

## 58.24 Regression tests should use the existing visual-audit idea, but fix board selection

The repo already contains:

```text
.tmp-third-pass-visual-audit.cjs
```

which screenshots the visually largest `<canvas>`/`<svg>`.

Replace heuristic element selection with exact selectors:

```text
SudokuPad reference:
  #svgrenderer

SphenPad:
  .sphenpad-sudokupad-renderer
```

Otherwise changes in page chrome can cause a test to screenshot the wrong element.

Move the script into:

```text
tests/sudokupad/visual/
```

and make it reproducible rather than a `.tmp` file.

## 58.25 Normalize SVG before raster diff

The differential suite should compare in this order:

1. decoded source object;
2. normalized render plan;
3. canonicalized SVG tree;
4. raster.

This identifies whether a mismatch is:
- decoding;
- normalization;
- SVG generation;
- CSS/font rasterization.

Do not rely only on `meanAbsoluteRgbDiff` as the existing temporary audit does.

## 58.26 Add direct source-puzzle snapshots

For representative fixtures, store:

```text
raw-input.txt
expected-source-puzzle.json
expected-render-plan.json
expected.svg
expected.png
```

This makes future upstream changes diagnosable.

## 58.27 Import failures must be atomic

The current app can save imported puzzle definitions.

The replacement importer must never partially persist a puzzle if:
- decoding fails halfway;
- required payload data is malformed;
- asset loading fails.

Asset failures should generally produce a valid puzzle with an asset warning.

Structural import failures should return:

```ts
Result<LoadedPuzzleDefinition, SudokuPadImportError>
```

and leave existing saved data unchanged.

## 58.28 External asset failures should not block puzzle logic

If:
- background image fails;
- optional font fails;
- emoji SVG fails;

the puzzle itself must still load.

Expose diagnostics:

```text
render complete with asset warnings
```

and use a defined fallback:
- image: omit failed image;
- optional puzzle font: default font;
- Twemoji: original text glyph.

## 58.29 Add explicit asset lifecycle cleanup

React unmount/reload must:
- abort pending external fetches;
- revoke created blob URLs;
- remove dynamically registered `FontFace`s if appropriate;
- cancel stale asset promises;
- prevent an old puzzle's asset load from mutating the new puzzle board.

Use an `AbortController`/generation token per loaded puzzle.

## 58.30 Accessibility/pointer behavior with SVG

Moving from Canvas to SVG changes browser hit-testing.

The puzzle graphics themselves should usually use:

```css
pointer-events: none;
```

and interaction should be owned by `BoardInteractionLayer`.

This prevents:
- text selecting;
- external image capturing clicks;
- arbitrary overlays changing selection behavior.

Interactive accessibility can be layered separately using:
- a transparent hit grid;
- keyboard focus state;
- ARIA labels for cells if desired.

## 58.31 Print/screenshot/export behavior

Because SudokuPad SVG is now the canonical board, expose one utility:

```ts
serializePuzzleSvg()
```

This should:
- inline/resolve relevant styles;
- preserve SVG defs/masks/markers;
- optionally embed external image assets;
- ensure selected puzzle font is represented.

Use this utility for:
- screenshots;
- print;
- future SVG/PNG export;
- differential testing.

Do not create a second export renderer.

## 58.32 Acceptance criteria addition

Before deleting the old path, also require:

- [ ] imported puzzle scene is not redundantly persisted with `sourcePayload`;
- [ ] runtime render plan is JSON-independent/acyclic;
- [ ] generic `setting-*` URL overrides are parsed;
- [ ] `puzzlefont` and legacy `digitfont` URL overrides work;
- [ ] all 13 exact font binaries are acquired or have a documented controlled fallback;
- [ ] pinned asset hashes exist where redistribution permits;
- [ ] archive sync uses the shared format registry;
- [ ] CI runs archive compatibility audit;
- [ ] `metadata.grids` survives round-trip;
- [ ] `metadata.norowcol` affects logic groups correctly;
- [ ] ragged/rectangular/helper-cell puzzles are tested;
- [ ] hard-coded upstream compatibility cases are centralized;
- [ ] puzzle `3DBNbtLfdp` solution correction is covered if full stock behavior is promised;
- [ ] asset loads are abortable and stale-safe;
- [ ] no transient DOM/renderer objects enter Dexie/Firebase;
- [ ] exact board selectors replace heuristic screenshot selection.
