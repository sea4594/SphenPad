# SudokuPad 0.612.0 Renderer Compatibility Specification

**Target:** the SudokuPad build captured from `sudokupad.app` in the supplied HAR files.  
**Application-reported version:** `0.612.0`.  
**Observed resource query version:** many assets were requested with `?v=0.611.0`.

This document is an implementation specification for building an independent renderer/importer that accepts the same core puzzle payloads as this SudokuPad build and renders the same puzzle content with no significant visual differences.

---

## 0. Compatibility contract

A renderer conforming to this specification should make the following promise:

> For the captured SudokuPad 0.612.0 build, under a defined SudokuPad visual-settings profile, every core payload-driven puzzle format and rendering path identified in the captured application is supported, including SCL/CTC, F-Puzzles import, SCF import, puzzle packs, arbitrary native lines/arrows/graphics/cages, fog/triggered fog, background images, and text/emoji handling.

This is a stronger and more useful target than “support every known Sudoku variant.” SudokuPad does not render most variants using a unique semantic renderer. Instead, importers convert them into a small scene graph of lines, arrows, rectangles, text, cages, regions, and cells.

### What this guarantee does cover

- Short SudokuPad IDs.
- Native `scl` / `ctc` payloads.
- `fpuz` / `fpuzzles` payloads accepted by this build.
- `scf` payloads accepted by this build.
- `pack` puzzle packs.
- Native puzzle objects with arbitrary geometry and safe SVG attributes that the core renderer accepts.
- Irregular grids/regions/cages.
- Outside-grid clues.
- Fractional coordinates.
- Lines, arrows, rounded shapes, rectangles, text, rotations, opacity, outlines, custom colors, custom SVG path data.
- Standard player/grid cell presentation.
- Fog and triggered fog.
- Payload-driven background images.
- Emoji replacement behavior, if enabled.
- SudokuPad's visual feature recognition and compatibility hacks.

### What cannot be guaranteed by a finite static renderer

SudokuPad can run **user-installed JavaScript plugins**. Those plugins can execute arbitrary code, inject CSS, and mutate the rendered SVG. No finite JSON schema can guarantee compatibility with arbitrary future JavaScript.

Therefore distinguish:

1. **Core payload compatibility** — finite and covered by this specification.
2. **User-environment/plugin compatibility** — unbounded unless your app implements/executes a compatible plugin system.
3. **Future SudokuPad versions** — require re-running the conformance audit when upstream code changes.

For deterministic rendering, define a canonical settings profile. The recommended profile is **SudokuPad default light mode with no user plugins and no experimental hash mode**. User visual settings can then be exposed as optional renderer parameters.

---

# 1. High-level architecture

Implement the pipeline as:

```text
SudokuPad URL / payload
        |
        v
+--------------------------+
| Payload resolver         |
| - remote short ID        |
| - scl / ctc              |
| - fpuz / fpuzzles        |
| - scf                    |
| - pack                   |
+-------------+------------+
              |
              v
+--------------------------+
| Format decoder/importer  |
|                          |
| F-Puzzles -> native      |
| SCF       -> native      |
| SCL/CTC   -> native      |
+-------------+------------+
              |
              v
+--------------------------+
| Native source puzzle     |
| cells                    |
| regions                  |
| cages                    |
| lines                    |
| arrows                   |
| underlays                |
| overlays                 |
| metadata                 |
| fog / effects            |
+-------------+------------+
              |
              v
+--------------------------+
| SudokuPad normalization  |
| feature recognition      |
| cage normalization       |
| compatibility hacks      |
| fog conversion           |
+-------------+------------+
              |
              v
+--------------------------+
| SVG scene renderer       |
| fixed ordered layers     |
| generic SVG primitives   |
+--------------------------+
```

Do **not** make “thermo,” “renban,” “whisper,” etc. the primary renderer abstraction. Those may be useful semantic annotations, but the canonical rendering IR should stay generic.

---

# 2. Puzzle URL and payload resolution

## 2.1 Registered prefixes

The captured build registers these core formats:

| Prefix | Aliases | Parser |
|---|---|---|
| `scl` | `ctc` | native SCL/CTC |
| `fpuz` | `fpuzzles` | F-Puzzles |
| `scf` | — | compact Sudoku format |
| `pack` | — | registered by puzzle-pack feature |

A string without a registered prefix is treated as a **remote puzzle ID**.

## 2.2 Remote short-ID fetch order

For a remote puzzle ID `ID`, SudokuPad tries, in order:

```text
/api/puzzle/ID
https://sudokupad.svencodes.com/ctclegacy/ID
https://firebasestorage.googleapis.com/v0/b/sudoku-sandbox.appspot.com/o/ID?alt=media
```

Path components are URI-encoded.

The Firebase legacy response receives an extra `PuzzleZipper.zip(...)` conversion before normal parsing.

If a remote response is not a puzzle pack and is still an unprefixed string, SudokuPad wraps it as an SCL payload by compressing it and prepending `scl`.

### Recommended implementation

Keep resolution separate from parsing:

```ts
async function resolveSudokuPadInput(input: string): Promise<string> {
  if (isKnownPrefixedPayload(input)) return input;
  return fetchRemotePuzzleId(input);
}

async function decodeSudokuPadInput(input: string): Promise<SourcePuzzle> {
  const resolved = await resolveSudokuPadInput(input);
  return parseByPrefix(resolved);
}
```

Do not infer format from JSON shape before honoring registered prefixes.

---

# 3. Common decompression path

Before format-specific parsing, SudokuPad's core loader effectively performs:

```text
strip recognized format prefix
        |
        v
decodeURIComponent safely
        |
        v
repair F-Puzzles slash encoding if applicable
        |
        v
decompress with loadFPuzzle.saveDecompress
```

Then the result is interpreted according to its registered parser.

Unknown/unregistered compressed data falls back to:

```text
saveJsonUnzip(decompressPuzzleId(payload))
```

`saveJsonUnzip` accepts:
- an already-materialized object,
- ordinary JSON text,
- or PuzzleZipper-compressed JSON.

For the highest compatibility, port the exact decoder/compressor behavior rather than substituting a “mostly compatible” compression library.

---

# 4. Native SCL/CTC transport encoding

SCL/CTC uses a compact JSON transform before outer compression.

## 4.1 Property abbreviation table

The captured `PuzzleZipper` maps:

| Full property | Encoded property |
|---|---|
| `color` | `c` |
| `cages` | `ca` |
| `center` | `ct` |
| `borderColor` | `c1` |
| `backgroundColor` | `c2` |
| `cells` | `ce` |
| `cellSize` | `cs` |
| `arrows` | `a` |
| `overlays` | `o` |
| `underlays` | `u` |
| `width` | `w` |
| `height` | `h` |
| `value` | `v` |
| `videos` | `vd` |
| `lines` | `l` |
| `rounded` | `r` |
| `regions` | `re` |
| `fontSize` | `fs` |
| `thickness` | `th` |
| `headLength` | `hl` |
| `wayPoints` | `wp` |
| `title` | `t` |
| `text` | `te` |
| `duration` | `d` |
| `d` | `d2` |

This table is recursively applied.

## 4.2 Additional compacting behavior

Before serialization:
- recursively remove empty arrays;
- integer-looking strings are converted to numbers;
- JSON object keys containing only alphanumeric characters may lose quotes;
- `false` becomes `f`;
- `true` becomes `t`;
- `"#000000"` becomes `#0`;
- `"#FFFFFF"` becomes `#F`;
- ordinary six-digit hex colors may lose their leading `#`;
- string quoting uses SudokuPad's custom quote transform.

The unzip operation reverses these transformations.

### Rule

**Decode first; render the fully expanded object.** Do not make the renderer aware of compressed key aliases.

---

# 5. Native source-puzzle schema

The following is the canonical renderer-facing shape you should support.

```ts
export type Point = [number, number];

export interface SudokuPadSourcePuzzle {
  id?: string;

  // Usually 50 after F-Puzzles import. Do not use this as the
  // final SVG cell scale; the renderer uses 64.
  cellSize?: number;

  cells: SourceCell[][];
  regions?: Point[][];
  cages?: SourceCage[];
  lines?: SourceLine[];
  arrows?: SourceArrow[];
  underlays?: SourceGraphic[];
  overlays?: SourceGraphic[];

  metadata?: PuzzleMetadata;
  metaData?: PuzzleMetadata; // legacy alias

  videos?: SourceVideo[];

  foglight?: Point[];
  triggereffect?: TriggerEffect[];

  global?: string[];

  // Legacy/importer flags can remain.
  windoku?: boolean;
  "diagonal+"?: boolean;
  "diagonal-"?: boolean;

  // MUST preserve unknown properties.
  [key: string]: unknown;
}
```

## 5.1 Source cells

Core static source fields:

```ts
export interface SourceCell {
  value?: string | number;
  pencilMarks?: Array<string | number>;
  centremarks?: Array<string | number>;

  [key: string]: unknown;
}
```

Runtime cells additionally maintain:
- `given`
- `value`
- `candidates`
- `pencilmarks`
- `colours`
- `pen`
- `highlighted`
- `haserror`
- `givenCornermarks`
- `givenCentremarks`
- `hideclue`

Those runtime fields matter for an interactive player; `value`, `pencilMarks`, and `centremarks` are the important source-puzzle fields for static initial content.

## 5.2 Regions

```ts
regions?: Point[][];
```

Each inner array is a set of zero-based `[row, column]` cell coordinates.

Regions can be irregular. Do not assume 3x3 boxes or contiguous rectangles.

## 5.3 Cages

```ts
export interface SourceCage {
  cells: Point[];

  value?: string | number;
  sum?: number;

  style?: string | null;
  type?: string;
  unique?: boolean;
  hidden?: boolean;

  fontC?: string;
  outlineC?: string;

  feature?: string;

  [key: string]: unknown;
}
```

Recognized visual styles in the captured core renderer:

```text
killer
box
windoku
selectioncage
extraregion
fpRowIndexer
fpColumnIndexer
fpBoxIndexer
hidden
```

`null`, `undefined`, `""`, and `"hidden"` can result in no visible cage border.

`rowcol` and `disjoint` semantic cages default to no visual border unless a style is explicitly set.

## 5.4 Lines

```ts
export interface SourceLine {
  target?: string;

  wayPoints?: Point[];

  // Raw SVG path data is also possible.
  d?: string;

  color?: string;
  thickness?: number;
  opacity?: number;

  className?: string;
  feature?: string;

  // Safe SVG path attributes must be preserved.
  [key: string]: unknown;
}
```

Coordinates are arbitrary floating-point grid coordinates. Do not restrict them to cell centers or half-cell increments.

## 5.5 Arrows

```ts
export interface SourceArrow {
  target?: string;
  wayPoints: Point[];

  color?: string;
  opacity?: number;
  thickness?: number;

  headLength?: number;
  headStyle?: "stroke" | "fill" | string;
  headAngle?: number;
  headIndent?: number;

  feature?: string;

  [key: string]: unknown;
}
```

Unlike generic lines/rectangles, the core arrow renderer consumes a specific field set rather than passing every arrow property blindly to the final arrow group.

## 5.6 Generic graphics

Both `underlays` and `overlays` use this general model:

```ts
export interface SourceGraphic {
  target?: string;

  center: Point;

  width: number;
  height: number;

  angle?: number;

  borderSize?: number;
  thickness?: number;

  backgroundColor?: string;
  borderColor?: string;

  rounded?: boolean;
  roundedRadius?: number;

  opacity?: number;

  text?: string;
  textColor?: string;
  fontSize?: number;
  textStroke?: string;
  textAnchor?: string;
  maxWidth?: number;

  className?: string;
  feature?: string;

  // Preserve other safe SVG attributes.
  [key: string]: unknown;
}
```

This one primitive is responsible for a large fraction of SudokuPad's apparent “variant support.”

It can represent:
- circles,
- dots,
- squares,
- shaded cells,
- thermo bulbs,
- custom clue symbols,
- outside clue text,
- arbitrary rotated rectangles,
- text labels,
- custom cosmetics.

---

# 6. Metadata

Metadata is gathered from multiple places.

The runtime extraction process:
1. scans cell-less cages whose value matches `key: value`;
2. allows repeated `rules` metadata;
3. overlays legacy `metaData`;
4. overlays explicit `metadata`.

Explicit metadata therefore wins over cage-derived metadata.

At minimum support:

```ts
export interface PuzzleMetadata {
  title?: string;
  author?: string;
  rules?: string | string[];
  solution?: string | number;

  source?: string;
  norowcol?: boolean;

  bgimage?: string;
  bgimageopacity?: string | number;
  bgimagetarget?: string;

  grids?: unknown;

  msgcorrect?: string;
  msgincorrect?: string;
  msgvalid?: string;
  msginvalid?: string;
  msgunknown?: string;

  [key: string]: unknown;
}
```

Unknown metadata is semantically important to optional features. Preserve it losslessly.

---

# 7. F-Puzzles import compatibility

The captured F-Puzzles parser has a finite recognized-key table.

## 7.1 Recognized F-Puzzles keys

The build explicitly handles:

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

`disabledlogic`, `truecandidatesoptions`, and `lockout` are effectively no-ops in the captured importer.

Do not silently invent support for F-Puzzles keys absent from this table. For forward compatibility, preserve/log unknown F-Puzzles fields and add them when a newer SudokuPad build adds parser support.

## 7.2 Import processing order

The importer processes these keys first, in this order:

```text
size
title
author
ruleset
clone
grid
disjointgroups
thermometer
killercage
arrow
difference
ratio
betweenline
lockout
quadruple
rectangle
circle
text
palindrome
line
minimum
maximum
```

Then remaining recognized F-Puzzles keys are processed.

Order can matter because several conversions inspect or augment already-created graphics/cages.

---

# 8. F-Puzzles grid conversion

The imported native puzzle begins roughly as:

```ts
{
  cellSize: 50,
  cells: [],
  regions: []
}
```

## 8.1 Region shape

For an `N x N` F-Puzzles puzzle:
- if `sqrt(N)` is integral, use square boxes;
- otherwise find the largest divisor at or below `sqrt(N)`;
- fallback `[1, 1]`.

## 8.2 Cell givens

Only an F-Puzzles grid cell marked `given` becomes a native initial `value`.

F-Puzzles:
```json
{"value":5,"given":true}
```

Native:
```json
{"value":5}
```

## 8.3 Center and corner marks

```text
centerPencilMarks -> centremarks
cornerPencilMarks -> pencilMarks
```

## 8.4 F-Puzzles regions

- Explicit numeric `region` values are grouped into native `regions`.
- Undefined region values use the computed normal box region.
- `region: null` cells are grouped into a hidden/non-unique cage so they are excluded from normal standard-region behavior.

## 8.5 Cell colors

The F-Puzzles cell color palette used by this importer is:

```text
0  #a8a8a8a8
1  #000
2  #ffa0a0
3  #ffdf61
4  #feffaf
5  #b0ffb0
6  #61d060
7  #d0d0ff
8  #8180f0
9  #ff08ff
10 #ffd0d0
```

`cell.c` is preferred; otherwise the first element of `cell.cArray` is used.

A color becomes a full-cell native underlay approximately equivalent to:

```ts
{
  backgroundColor: color,
  center: [r + 0.5, c + 0.5],
  rounded: false,
  width: 1,
  height: 1
}
```

Multiple `cArray` colors are not fully imported as multiple static colors by this path.

---

# 9. F-Puzzles constraint-to-native conversion

This section is important because your app can either:
1. port the F-Puzzles-to-native converter exactly, or
2. decode F-Puzzles another way and create precisely these equivalent native primitives.

Option 1 is safer.

## 9.1 Little killer

Imported as:
- black arrow,
- thickness `2`,
- short arrow geometry near/outside the grid,
- white text overlay,
- font size `28`.

## 9.2 Arrow sums

Default native arrow styling:

```ts
{
  color: "#a1a1a1",
  headLength: 0.3,
  thickness: 5
}
```

The line beginning is shifted to make room for the bulb.

Simple bulbs become rounded graphics with:
- gray border,
- white background,
- border size `5`,
- dimensions based on their cell bounding box.

More complex/multirow/multicolumn bulbs can be represented using line-ring geometry.

F-Puzzles custom style metadata can override arrow/bulb appearance.

## 9.3 Killer cages

Native result includes:

```ts
{
  cells,
  unique: true,
  value,
  sum
}
```

`sum` is set when the displayed value parses as an exact integer string.

## 9.4 Generic F-Puzzles cages

Generic cage styling is preserved when possible.

Special cases:
- one-cell cage value `"FOW"` creates fog visibility around that cell;
- `"FOGLIGHT"` / `foglight: ...` is interpreted by fog handling;
- Row/Column/Box Indexer constraints can map to:
  - `fpRowIndexer`
  - `fpColumnIndexer`
  - `fpBoxIndexer`
- cell-less metadata cages can become puzzle metadata.

## 9.5 Fog-of-war

Each specified F-Puzzles fog-of-war lamp lights the clipped 3x3 neighborhood around that cell.

## 9.6 Foglight

Imported directly to native `foglight`.

## 9.7 Diagonals

F-Puzzles diagonals become blue lines:

```text
color     #34BBE6
thickness 2
```

across the full grid.

## 9.8 Ratio dots

Native rounded overlay:
- approximately `0.3 x 0.3` cells,
- black border,
- black fill,
- optional white text.

## 9.9 Difference dots

Native rounded overlay:
- approximately `0.3 x 0.3`,
- black border,
- white fill,
- optional black text.

## 9.10 X/V clues

Native overlay:
- size about `.25 x .25`,
- white fill/background behavior,
- `fontSize: 21`,
- text from the F-Puzzles value.

The renderer later applies an additional legacy font-size adjustment.

## 9.11 Thermometers

Imported as:
- rounded underlay bulb about `.85 x .85`,
- gray `#CFCFCF`,
- gray line,
- line thickness `21`.

## 9.12 Palindromes

Imported as gray line:
```text
#CFCFCF
thickness 16
```

## 9.13 Sandwich clues

Native text overlay:
- white/white visual base,
- `fontSize: 32`,
- about `.25 x .25`.

## 9.14 Even cells

Gray square underlay:
```text
.7 x .7
rounded false
```

## 9.15 Odd cells

Gray rounded underlay:
```text
.7 x .7
rounded true
```

## 9.16 Extra regions

Native cage:
```ts
{
  style: "extraregion",
  unique: true,
  cells,
  sum: triangularNumber(cells.length)
}
```

## 9.17 Clone regions

Both source and clone cells become full-cell gray underlays.

## 9.18 Quadruples

Rounded white overlay with black border:
- roughly `.7 x .7`,
- font size about `14`,
- clue values laid out with spaces/newlines.

## 9.19 Between lines

- white rounded endpoint bulbs,
- gray border,
- about `.8 x .8`,
- border size `2`,
- gray line thickness `2`,
- path endpoints retracted to meet bulbs cleanly.

## 9.20 Minimum / maximum

- full-cell gray `#ccc` underlay;
- small black inequality/chevron lines;
- thickness `1`;
- sides adjacent to another same-type min/max cell are handled specially.

## 9.21 Generic F-Puzzles line

Each path becomes a native source line:
- `color = outlineC`,
- `thickness = 32 * width`,
- points centered into native grid coordinates.

## 9.22 Rectangle cosmetic

Native graphic carries approximately:
- `backgroundColor = baseC`
- `borderColor = outlineC`
- `center`
- `borderSize: 1`
- `rounded: false`
- `width`
- `height`
- `text = value`
- `angle`

## 9.23 Circle cosmetic

Same general conversion as rectangle, except:
- `rounded: true`
- `textColor = fontC`

## 9.24 Text cosmetic

- spaces are converted to non-breaking spaces;
- `color = fontC`;
- `textStroke` is chosen for contrast;
- `fontSize ≈ round(32 * (size || 1))`;
- `.25 x .25` nominal graphic dimensions;
- `angle` preserved.

## 9.25 Disjoint groups

Creates logical cages:
```ts
{
  type: "disjoint",
  style: null,
  unique: true,
  cells
}
```

and adds a global disjoint rule.

These are primarily semantic, not visible.

## 9.26 Negative constraints

Some are translated into native `global` rules such as:

```text
anti<constraint>
```

A fog-related negative constraint can establish an empty `foglight` set.

## 9.27 Trigger effects

F-Puzzles `triggereffect` is retained for fog processing.

---

# 10. SCF import

SCF is a compact Sudoku format decoded by `PuzzleTools.decodeSCF`.

The captured decoder is substantially narrower than SCL/F-Puzzles.

It supports:
- 9x9 givens;
- standard 3x3 regions;
- Windoku indicator;
- Sudoku-X/diagonal indicators;
- title and author metadata;
- normal Sudoku rule metadata.

Notable compact extensions:
- `w` -> four gray 3x3 Windoku underlays;
- `x` -> both blue Sudoku-X diagonals;
- `t...` -> title;
- `a...` -> author.

SCF should be treated as an **input adapter**, not as your renderer's canonical model.

---

# 11. Puzzle packs

`pack` is registered dynamically by the puzzle-pack feature.

A pack is compressed JSON containing a `puzzles` collection. The active item is selected using a URL hash such as:

```text
#puzzle0
#puzzle1
...
```

Each item contains another puzzle reference/payload and is recursively resolved through the normal:
- fetch,
- prefix detection,
- parse pipeline.

Do not special-case pack contents as necessarily SCL.

---

# 12. SVG coordinate system

This is a central compatibility invariant.

```text
SvgRenderer.CellSize = 64
```

Every grid cell is 64 SVG units wide/high.

For a native grid point:

```ts
[r, c]
```

the ordinary SVG coordinate is:

```text
x = c * 64
y = r * 64
```

Coordinates may be:
- integers,
- halves,
- arbitrary floating-point values,
- outside the grid.

Do not clamp coordinates to the board.

---

# 13. SVG root and layer order

The captured HTML declares the layers in this exact DOM order:

```text
1  background
2  underlay
3  cell-colors
4  arrows
5  cages
6  cell-highlights
7  cell-grids
8  cell-errors
9  overlay
10 cell-givens
11 cell-pen
12 cell-pencilmarks
13 cell-candidates
14 cell-values
```

Later siblings paint above earlier siblings.

Your SVG should therefore resemble:

```svg
<svg id="svgrenderer">
  <g id="background"/>
  <g id="underlay"/>
  <g id="cell-colors"/>
  <g id="arrows"/>
  <g id="cages"/>
  <g id="cell-highlights"/>
  <g id="cell-grids"/>
  <g id="cell-errors"/>
  <g id="overlay"/>
  <g id="cell-givens"/>
  <g id="cell-pen"/>
  <g id="cell-pencilmarks"/>
  <g id="cell-candidates"/>
  <g id="cell-values"/>
</svg>
```

Do not flatten all content into a single insertion stream.

---

# 14. Generic SVG attribute policy

This is one of the most important compatibility rules.

The core renderer is intentionally open-ended. It creates an SVG node and copies through attributes unless they are:
- unsafe event attributes beginning with `on`;
- renderer-internal fields;
- fields invalid for a particular primitive.

The common internal/excluded fields include:

```text
target
center
rounded
thickness
text
feature
color
angle
borderColor
borderSize
wayPoints
backgroundColor
textAnchor
fontSize
maxWidth
textStroke
```

Additional exclusions:
- paths exclude `width`, `height`;
- text/group/marker exclude `width`, `height`.

### Consequence

Do **not** define a closed whitelist such as:

```ts
type AllowedLine = {
  color: string;
  thickness: number;
  wayPoints: Point[];
}
```

and throw the rest away.

A safer representation is:

```ts
type OpenSvgProperties = Record<string, unknown>;
```

combined with known fields and a sanitization layer.

This is how you remain compatible with custom SCL graphics that use valid SVG properties not seen in your initial corpus.

### Security requirement

Never pass arbitrary `on*` event attributes or unsanitized URLs to DOM/SVG. SudokuPad explicitly rejects `on...` attributes; your implementation should be at least as strict.

---

# 15. `renderPart`: universal primitive

Conceptually:

```ts
renderPart({
  target = "underlay",
  type,      // path, rect, text, g, marker, defs, image, ...
  attr = {},
  content
})
```

Algorithm:
1. create SVG-namespace element of `type`;
2. copy permitted attributes;
3. numerical `x`, `y`, `width`, `height` values are rounded to one decimal place;
4. assign text content;
5. append to `#${target}`.

## 15.1 Multiline text

If content contains `\n`:
- parent text receives `x=0`, `y=0`;
- parent is translated around the requested text position;
- each line becomes a `<tspan>`;
- each tspan is vertically offset in `em`;
- each tspan uses `dominant-baseline="middle"`.

Reproduce this behavior rather than letting browser newlines collapse.

---

# 16. `renderLine`

Input:

```ts
{
  target?: string;       // default "arrows"
  color?: string;        // default "none"
  thickness?: number;
  wayPoints?: Point[];
  className?: string;
  d?: string;
  ...safeSvgPathAttrs
}
```

Base SVG:

```svg
<path
  fill="none"
  stroke="..."
  stroke-linecap="round"
  stroke-linejoin="round"
/>
```

If `thickness` exists:

```text
stroke-width = thickness
```

If `wayPoints` is nonempty:

```text
d = M(c0*64) (r0*64) L(c1*64) (r1*64) ...
```

If explicit `d` is supplied and no waypoint-generated `d` overrides it, it survives.

### Compatibility mutation

Before rendering a normal source line, the conversion layer changes:

```text
thickness === 1
```

to:

```text
2
```

for legacy visual compatibility.

Feature recognition occurs before or around these compatibility transformations; keep the same processing order.

---

# 17. `renderArrow`

Input defaults:

```ts
{
  target: "arrows",
  color: "none",
  opacity: 1,
  thickness,
  headLength,
  headStyle: "stroke",
  headAngle: 90,
  headIndent: 0,
  wayPoints: []
}
```

At least two waypoints are required.

## 17.1 Arrow-head styles

### `stroke`

```text
closed: false
points: 3
fill: none
stroke-linejoin: miter
```

### `fill`

```text
closed: true
points: 4
stroke-width: 0
stroke-linejoin: miter
```

## 17.2 Marker size

```text
size =
  headLength ? headLength * 2 * 64
             : thickness * 10
```

With:

```text
rad = (headAngle / 2) * π / 180
ox = 0.9
oy = 1.0
hx = 0.5 * cos(rad)
hy = 0.5 * sin(rad)
```

Normalized head points:

```text
[ox-hx,                  oy+hy]
[ox,                     oy]
[ox-hx,                  oy-hy]
[ox-hx*(1-headIndent),   oy]
```

These are multiplied by `size`.

Marker:
```text
markerUnits = userSpaceOnUse
markerWidth = 2 * size
markerHeight = 2 * size
refY = size
orient = auto
```

For filled heads, the endpoint retraction calculation incorporates `headLength` and `headIndent`.

The final shaft endpoint is retracted so it does not visibly protrude through the marker.

Arrow shaft:
- `fill: none`;
- `stroke-linecap: butt`;
- `stroke-linejoin: round`;
- `marker-end: url(#markerId)`.

Arrow group:
- `stroke = color`;
- `opacity`;
- `stroke-width = thickness`.

Implement this as a marker + shaft group, not as an approximate Unicode arrow.

---

# 18. `renderRect`

Input:

```ts
{
  target,
  center,
  width,
  height,

  angle,

  borderSize = 0,
  thickness = 0,

  backgroundColor = "none",
  borderColor = "none",

  rounded,
  roundedRadius,

  opacity = 1,
  className,

  ...safeSvgRectAttrs
}
```

## 18.1 Effective border width

```text
borderSize =
  borderSize
  || thickness
  || (borderColor !== "none" ? 2 : 0)
```

## 18.2 Fill/stroke

```text
fill =
  backgroundColor === undefined
    ? "none"
    : backgroundColor

stroke =
  backgroundColor === borderColor
    ? "none"
    : borderColor
```

## 18.3 Geometry

```text
x =
  (centerCol - width/2) * 64
  + borderSize/2

y =
  (centerRow - height/2) * 64
  + borderSize/2

svgWidth =
  width * 64
  - borderSize

svgHeight =
  height * 64
  - borderSize
```

## 18.4 Rotation

If `angle` is nonzero, rotate around the rectangle center.

## 18.5 Rounded geometry

If `rounded` and `roundedRadius` is absent:

```text
roundedRadius =
  0.5 * (min(width, height) * 64 - borderSize)
```

Then:

```text
rx = roundedRadius
ry = roundedRadius
```

This is how the same generic primitive becomes circles, pills, thermo bulbs, Kropki dots, etc.

---

# 19. `renderText`

Known input fields:

```ts
{
  target,
  center,
  width,
  height,

  color,
  fontSize,
  text,

  textStroke,
  textAnchor,
  backgroundColor,

  maxWidth,
  angle,
  className,

  ...safeSvgTextAttrs
}
```

## 19.1 Property normalization

```text
textStroke -> stroke
color      -> fill
textAnchor -> text-anchor
```

These presentation properties are moved into inline style when applicable:

```text
fill
stroke
dominant-baseline
text-anchor
stroke-width
stroke-linecap
stroke-linejoin
stroke-dasharray
stroke-dashoffset
```

Literal black/white text colors may be normalized to SudokuPad CSS variables.

## 19.2 Position

The renderer uses:

```text
textOffsetX = 0.00
textOffsetY = 0.06
```

Therefore:

```text
x = (centerCol + 0.00 * width) * 64
y = (centerRow + 0.06 * height) * 64
```

## 19.3 Font size

If defined:

```text
font-size: ${fontSize}px
```

## 19.4 Rotation

Text uses SVG rotation around its own rendered coordinate.

## 19.5 Maximum width

After rendering, measure using `getBBox()`.

If:

```text
bbox.width > maxWidth
```

set:

```text
textLength = maxWidth
lengthAdjust = spacingAndGlyphs
```

This is important for cage labels and long custom clues.

## 19.6 Small-text background

If:
- `backgroundColor` exists; and
- `fontSize <= 16`;

the renderer draws a background rectangle immediately behind the text, using its measured bounding box.

---

# 20. Generic overlay/underlay rendering

For an ordinary source graphic:
1. determine target by whether it came from `underlays` or `overlays`;
2. normalize defaults;
3. apply legacy opacity behavior;
4. draw its rectangle/rounded rectangle;
5. if `text` is present, draw text.

Important behavior:
- if `backgroundColor === borderColor`, the border can be removed;
- `textColor` overrides text fill;
- legacy custom text gets a historical font-size adjustment;
- specialized detected features may route through special wrappers.

---

# 21. Specialized wrappers

These are not new drawing technologies; they are wrappers around the generic primitives.

## 21.1 Arrow sum

```text
render arrow
then render bulb rect
```

Both go into the arrows layer.

## 21.2 Kropki

```text
render rounded overlay rect
add class feature-kropki
if text:
    render overlay text without background
    add same feature class
```

## 21.3 XV

```text
render overlay rect
add class feature-xv
increase clue font size by 4
render overlay text
```

## 21.4 Little Killer

```text
render arrow in arrows layer
render number in overlay layer
fontSize = source fontSize + 4
```

## 21.5 Palindrome

Generic line in arrows layer with class `palindrome`.

## 21.6 Sudoku-X

Generic line routed to the `overlay` layer with class `sudokux`.

## 21.7 Thermo helper

A thermo helper exists that:
- snaps interior path points toward centers as needed;
- draws line + rounded bulb into arrows layer.

In this captured conversion path, ordinary thermo-looking imported pieces can still render through generic primitives; feature recognition is also used for semantic/checking behavior.

---

# 22. Cage styles

The core renderer defines these exact base styles.

## 22.1 Cage label

```text
width: 0.2
height: 0.2
fontSize: 13
textAnchor: start
backgroundColor: rgba(255,255,255,0.9)
```

## 22.2 Killer

```text
offset: 0.08
fill: none
stroke: rgba(0, 0, 0, 1)
stroke-width: 1.5px
stroke-dasharray: 5 3
stroke-dashcorner: 4
```

## 22.3 Box

```text
offset: 0
fill: none
stroke: rgba(0, 0, 0, 1)
stroke-width: 3px
```

## 22.4 Windoku

```text
offset: 0.08
fill: #cfcfcf33
stroke: none
stroke-width: 0
```

## 22.5 Selection cage

```text
offset: 0.0625
fill: rgba(255,255,255,0.4)
stroke: rgba(0,126,255,0.7)
stroke-width: 8px
stroke-linecap: butt
stroke-linejoin: round
```

## 22.6 Extra region

```text
offset: 0.09375
fill: rgba(178,178,178,0.4)
stroke: none
stroke-width: 0
```

## 22.7 F-Puzzles row indexer

```text
offset: 0.0390625
fill: #7CC77C33
stroke: #7CC77C
stroke-opacity: 0.7
stroke-width: 4px
```

## 22.8 F-Puzzles column indexer

```text
offset: 0.0390625
fill: #C77C7C33
stroke: #C77C7C
stroke-opacity: 0.7
stroke-width: 4px
```

## 22.9 F-Puzzles box indexer

```text
offset: 0.0390625
fill: #7C7CC733
stroke: #7C7CC7
stroke-opacity: 0.7
stroke-width: 4px
```

---

# 23. Arbitrary cell-set outline algorithm

This is the main geometry algorithm that should be ported behavior-for-behavior.

Given an arbitrary set of occupied cells, SudokuPad examines each cell's 3x3 neighborhood and emits boundary segments based on pattern matching.

## 23.1 Point offsets

For outline offset `os`:

```text
tl [os,       os]
tr [os,       1-os]
bl [1-os,     os]
br [1-os,     1-os]

tc [os,       0.5]
rc [0.5,      1-os]
bc [1-os,     0.5]
lc [0.5,      os]
```

## 23.2 Neighborhood patterns

```text
otl  _0_011_1_  enter bl  exit rt  points tl
otr  _0_110_1_  enter lt  exit br  points tr
obr  _1_110_0_  enter tr  exit lb  points br
obl  _1_011_0_  enter rb  exit tl  points bl

itl  01_11____  enter lt  exit tl  points tl
itr  _10_11___  enter tr  exit rt  points tr
ibr  ____11_10  enter rb  exit br  points br
ibl  ___11_01_  enter bl  exit lb  points bl

et   _0_111___  enter lt  exit rt  points tc
er   _1__10_1_  enter tr  exit br  points rc
eb   ___111_0_  enter rb  exit lb  points bc
el   _1_01__1_  enter bl  exit tl  points lc

out  _0_010_1_  enter bl  exit br  points tl,tr
our  _0_110_0_  enter lt  exit lb  points tr,br
oub  _1_010_0_  enter tr  exit tl  points br,bl
oul  _0_011_0_  enter rb  exit rt  points bl,tl

solo _0_010_0_  enter ""  exit ""  points tl,tr,br,bl
```

Directions:

```text
t [-1, 0]
r [ 0, 1]
b [ 1, 0]
l [ 0,-1]
```

Opposites:

```text
t <-> b
r <-> l
```

## 23.3 Algorithm

1. Build a boolean occupancy grid.
2. For every occupied cell, test all neighborhood patterns.
3. Create matching boundary segments.
4. Follow each segment's exit into the corresponding neighbor's matching enter.
5. Continue until the shape closes or terminates.
6. Convert each shape to grid-coordinate points.
7. Emit:
   ```text
   M...
   L...
   ...
   Z
   ```
8. Multiple disconnected components become multiple closed subpaths.

Do not substitute a simple bounding rectangle.

---

# 24. `renderCage`

For a visible cage style:
1. look up cage style;
2. call `getCellOutline(cells, style.offset)`;
3. convert every `[r,c]` point to `[c*64,r*64]`;
4. build SVG path;
5. use:
   ```text
   shape-rendering: geometricprecision
   vector-effect: non-scaling-stroke
   ```
6. optionally override stroke with `borderColor`.

If `cageValue` exists, render the label even if border rendering is suppressed.

## 24.1 Cage-label positioning

The displayed cage value is internally encoded with its cell location.

The label begins near the label cell:

```text
centerRow = row + 0.15
centerCol = col + 0.035
```

Text anchor is `start`.

The renderer checks how many horizontally adjacent cage cells continue to the right and uses that span to constrain `maxWidth`.

---

# 25. Source cage normalization

Before rendering:

- empty cages are ignored;
- hidden cages are skipped;
- `rowcol` and `disjoint` cage types default to no visible style;
- ordinary cages default to `killer`;
- `fontC` becomes label text color;
- `outlineC` becomes border color;
- nonempty `value` becomes a positioned cage label;
- region cages use `box` style and render in the grid layer;
- killer-like cages render in the cages layer.

The selected label cell is the top-left-most relevant cell according to SudokuPad's cage sorting.

---

# 26. Grid construction

Rows:

```text
rows = puzzle.cells.length
```

Columns:

```text
cols = maximum row length
```

The cell grid is a single SVG path containing:
- all horizontal lines from row `0` through `rows`;
- all vertical lines from column `0` through `cols`.

The default grid class is `.cell-grid`.

Core light-mode behavior includes:
- fill none;
- black stroke;
- about 1-unit/grid-line stroke;
- butt line caps;
- bevel joins;
- non-scaling stroke.

Standard region boundaries are rendered separately as box cages, producing the thicker region divisions.

---

# 27. Cell rendering

Runtime visual cell properties:

```text
haserror
highlighted
given
value
candidates
pencilmarks
colours
pen
```

## 27.1 Visibility precedence

Normally:

```text
given hides:
  value
  candidates
  pencilmarks

value hides:
  candidates
  pencilmarks
```

Cell colors remain independent.

## 27.2 Fog visibility

When fog is active:
- a given is visible only when its clue is not fog-hidden;
- a player-entered normal value is always available;
- center/corner marks can remain available under conditions where the hidden given itself is not.

## 27.3 Zero-is-ten rule

If current puzzle rules contain:

```text
zeroisten
```

displayed `0` characters are replaced by `10`.

## 27.4 Given/value text

Both use generic centered `renderText()` at:

```text
[row + 0.5, col + 0.5]
```

## 27.5 Pencilmarks

Maximum rendered corner marks:

```text
10
```

Each mark is a separate text element:

```text
cell-pencilmark pm-0
cell-pencilmark pm-1
...
```

`givenCornermark` is applied to pre-supplied clue marks.

Default corner-mark offsets in SVG/CSS coordinates are approximately:

```text
0  (-15,-15)
1  ( 15,-15)
2  (-15, 15)
3  ( 15, 15)
4  (  0,-15)
5  (  0, 15)
6  (-15,  0)
7  ( 15,  0)
8  ( -5,  0)
9  (  5,  0)
```

Alternative-mark and large-digit settings modify presentation.

## 27.6 Center candidates

Candidate values are rendered as `<tspan>` children of a shared text element.

The renderer takes at most the first 9 array entries in the normal candidate path.

Given/pre-supplied center marks receive class `given`.

CSS scales long candidate strings down by count.

## 27.7 Cell coloring

Multiple player colors are rendered as pie-like wedges using `renderCellWedge`.

This is runtime annotation behavior, distinct from full-cell source underlays imported from F-Puzzles.

## 27.8 Pen marks

Pen encoding values `1..9` and `a..g` map to:
- center horizontal/vertical strokes;
- edge X marks;
- cell circle;
- cell X;
- cell-edge lines;
- diagonal center/edge lines.

Implement this only if matching interactive player annotations/replays is required.

---

# 28. Default text/CSS presentation

The renderer relies on CSS as well as generated SVG attributes.

Core default sizes in the captured stylesheet:

```text
.cell-given       3rem
.cell-value       3rem
.cell-candidate   1.2rem
.cell-pencilmark  1.1rem
```

The SVG text baseline/anchor rules center normal cell text.

The visual font stack should match SudokuPad's captured CSS/browser resources as closely as practical.

For your compatibility suite, run both renderers in the **same browser engine and font environment** whenever possible. Otherwise tiny text-rasterization differences are not useful compatibility failures.

---

# 29. Feature recognition

SudokuPad recognizes certain visual constructs after import. These recognizers are important because they can alter rendering target/classes or provide semantic information to checker/UI systems.

Recognized feature families in the captured build include:

```text
thermos
arrowSums
kropkis
xvs
littleKiller
inequality
sandwichCages
palindrome
sudokuX
windoku
cosmetic
global
```

## 29.1 Why recognition matters

A native payload might contain only:

```text
rounded rect + text
```

but SudokuPad can recognize it as XV and route it through the XV compatibility renderer.

Therefore your pipeline should be:

```text
decode
-> native source object
-> feature recognition
-> rendering
```

rather than “render raw arrays immediately.”

---

# 30. Recognition rules that affect appearance

Exact semantic matching logic can be ported from `PuzzleFeatures`. Important visual cases include:

## 30.1 Kropki

Looks for small rounded edge-centered overlays around:
```text
.25 / .30 / .35 cell
```

with black border and black/white fill.

Detected Kropkis receive class `feature-kropki` and special dark-mode behavior.

## 30.2 XV

Looks for approximately `.25`-cell edge-centered overlays with text such as:
```text
X
V
XV
```

Uses XV wrapper and font adjustment.

## 30.3 Arrow sums

Recognizes compatible arrows plus a connected rounded bulb.

Typical accepted arrows use:
- black/gray family;
- thickness `2`, `3`, or `5`;
- `headLength ≈ .3`.

## 30.4 Little killer

Recognizes short arrows beginning outside the grid and nearby numeric text.

## 30.5 Palindrome

Recognizes gray paths around:

```text
#CFCFCF
thickness 11 or 12
```

when not already assigned another feature.

## 30.6 Sudoku-X

Recognizes full-grid blue diagonals around:

```text
#34BBE6
thickness 1 or 2
```

and routes them to overlay.

## 30.7 Windoku

Recognizes the expected set of four 3x3 gray underlays in standard positions.

---

# 31. Arrows-vs-lines insertion order

Both native `lines` and native `arrows` ultimately inhabit the `#arrows` SVG group in most ordinary cases.

SudokuPad has a visual setting:

```text
arrowsabovelines
```

Behavior:

### default / false

```text
render arrows
render lines
```

Therefore lines paint above arrows.

### true

```text
render lines
render arrows
```

Therefore arrows paint above lines.

This is an important same-layer z-order rule.

For a canonical default renderer, use `false` unless you intentionally reproduce a saved/user setting.

---

# 32. Legacy opacity compatibility

SudokuPad contains compatibility logic for imported/native colors.

Special opaque colors include:

```text
#000000
#CFCFCF
#FFFFFF
none
```

For legacy/custom graphics without explicit alpha, SudokuPad can apply:

```text
fill-opacity   0.5
stroke-opacity 0.5
```

The exact decision also depends on puzzle source metadata and legacy identification.

Do not globally force all custom source colors to full opacity.

Port the upstream `applyLegacyOpacity` behavior for high fidelity.

---

# 33. Fog

Fog is a core payload-driven visual subsystem in the captured build.

## 33.1 Payload fields

```ts
interface TriggerEffect {
  trigger?: {
    type?: string;
    cell?: string;
    cells?: string | string[];
    [key: string]: unknown;
  };

  effect?: {
    type?: string;
    cells?: string | string[];
    [key: string]: unknown;
  };

  [key: string]: unknown;
}
```

Native:

```ts
foglight?: Point[];
triggereffect?: TriggerEffect[];
```

During normalization, fog trigger data becomes a runtime `foglink` structure.

## 33.2 Initial visible cells

`foglight` lists cells initially visible through fog.

## 33.3 Fogged SVG layers

Fog masking is applied to:

```text
background
underlay
arrows
cages
overlay
cell-givens
```

It deliberately does not simply hide all player-entered values/marks.

## 33.4 Normal fog behavior

Without trigger-link effects:
- entering a correct non-given value reveals its clipped surrounding 3x3 neighborhood;
- special/deep-fog clue behavior can reveal only the clue cell under certain conditions.

## 33.5 Triggered fog

Only effects whose:

```text
effect.type === "foglight"
```

are turned into fog reveal links.

A trigger group reveals its effect cells when the relevant trigger values are satisfied.

## 33.6 Fog visuals

Captured constants:

```text
fogSize  = 0.2
fogDark  = 0.235
fogLight = 0.9
```

Fog masking uses:
- SVG masks;
- a cell-set outline;
- layered edge strokes;
- a fog cover rectangle.

Light-mode fog cover is approximately gray; dark mode uses a darker cover.

For static screenshots, animation timing is irrelevant. Match the final mask geometry/color state.

## 33.7 Fog cages / metadata compatibility

Fog processing also recognizes cage-based conventions such as:

```text
FOGLIGHT
foglight: ...
```

and removes those helper cages from visible output after converting them into fog data.

Imported messy/legacy overlay forms are handled as compatibility cleanup.

---

# 34. Background images

Payload metadata can define:

```ts
metadata.bgimage
metadata.bgimageopacity
metadata.bgimagetarget
```

Behavior:
- default target is `background`;
- opacity defaults around `.2`;
- opacity is parsed, clamped to `[0,1]`, and rounded;
- image URL is sanitized;
- SVG `<image>` covers the current complete viewBox;
- `preserveAspectRatio="none"` is used.

A user setting can hide the background image.

### Historical hard-coded exceptions

The captured conversion code includes special background-image handling for particular puzzle IDs.

At least these are non-experimental compatibility exceptions:

```text
NJbPwMVNwZ
MONOPOLYSUDOKU
```

There are additional ID-specific backgrounds gated behind experimental mode.

If your promise is literally “every historical puzzle in this pinned build,” carry these exceptions over or treat them as a documented compatibility table.

---

# 35. Emoji

The emoji feature is enabled by default unless disabled by user setting.

It scans rendered SVG text.

For a text node consisting of a supported Twemoji emoji, SudokuPad can:
1. determine the text bounding box;
2. replace the text with an SVG `<image>`;
3. load Twemoji SVG;
4. preserve relevant opacity/transform behavior.

Why this matters:

Different OS/browser emoji fonts can look radically different. If visual matching matters, implement the same Twemoji replacement rather than relying on native emoji fonts.

---

# 36. Content bounds and viewBox

To render outside clues correctly, do not assume:

```text
viewBox = 0 0 cols*64 rows*64
```

SudokuPad measures rendered SVG content using bounding boxes that include:
- fills;
- strokes;
- markers.

It then expands/snap-aligns the visible area.

Important behavior:
- minimum padding is applied;
- bounds are snapped around quarter-cell increments;
- final viewBox values are rounded.

This allows:
- outside clues;
- external arrows;
- labels beyond the normal board;
- large custom graphics.

A fixed board-only viewBox will crop valid SudokuPad puzzles.

---

# 37. Visual settings that can change the same payload

A single SudokuPad payload does **not** have one unique appearance if user settings differ.

Settings/features affecting appearance include:

```text
darkmode
largedigits
altmarks
hidecolours
dashedgrid
nogrid
outlinesondigits
outlinesonlines
arrowsabovelines
puzzlefont
hidebgimage
disableemoji
```

Other settings affect selection/game state rather than the initial puzzle.

## Recommended API

```ts
interface RenderSettings {
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

Define a fixed default profile for your automated conformance suite.

---

# 38. Dark mode

SudokuPad dark mode is not simply “invert the page.”

CSS explicitly remaps:
- black strokes/fills;
- white strokes/fills;
- cell grid;
- box cage borders;
- givens and pre-supplied marks;
- Kropki dots;
- XV clues;
- text backgrounds.

If supporting dark mode, port the relevant stylesheet rules rather than applying a generic CSS filter.

---

# 39. Hide-colors / line outlines / dashed grid

These settings are CSS-driven.

Examples:
- `hidecolours` hides/fades relevant underlay/overlay fills and background images;
- `outlinesonlines` applies a visual filter/outline to line-containing layers;
- `dashedgrid` changes `.cell-grid` stroke dash patterns;
- `nogrid` hides the ordinary cell grid.

Preserving renderer classes is therefore necessary. Do not strip classes after generating SVG if you plan to reproduce SudokuPad settings.

---

# 40. Semantic rules vs. rendering

SudokuPad also has:
- `RulesParser`;
- conflict checker;
- solver/checker semantics;
- logical global constraints.

Those are separate from visual compatibility.

A puzzle may display perfectly even if your app does not semantically understand the rule represented by a purple line.

If your project needs a **playable equivalent**, then treat these as two independent subsystems:

```text
Renderer compatibility
+
Rule/checker compatibility
```

Do not pollute the scene graph with rule semantics solely to draw the puzzle.

---

# 41. Unknown-field policy

For both puzzle and primitive objects:

```ts
[key: string]: unknown
```

is mandatory.

At ingestion:
- preserve unknown fields;
- log their names;
- never discard them before normalization;
- if they reach a generic SVG primitive, preserve safe SVG attributes;
- block unsafe `on*` attributes and sanitize URL-bearing SVG fields.

Add telemetry in development:

```text
Unknown top-level field: ...
Unknown cage field: ...
Unknown line field: ...
Unknown F-Puzzles key: ...
Unknown recognized feature: ...
```

This becomes your early-warning system for future SudokuPad changes.

---

# 42. User-plugin boundary

The captured app includes a user-plugin feature capable of evaluating saved JavaScript and installing arbitrary CSS/handlers.

That means a user can make their personal SudokuPad instance render something the stock core renderer would never produce.

This must **not** be confused with puzzle-payload compatibility.

Recommended wording for your application:

> Compatible with stock SudokuPad 0.612.0 puzzle payload rendering. User-installed SudokuPad plugins and arbitrary local custom JavaScript are not part of the compatibility contract.

If you later want plugin compatibility, implement a separate sandboxed plugin API.

---

# 43. Recommended canonical internal representation

Do not store imported puzzles as F-Puzzles semantics.

Use a native scene model:

```ts
interface RenderPuzzle {
  id?: string;

  rows: number;
  cols: number;

  cells: RuntimeCell[];

  regions: RuntimeCage[];
  cages: RuntimeCage[];

  lines: RenderLine[];
  arrows: RenderArrow[];

  underlays: RenderGraphic[];
  overlays: RenderGraphic[];

  metadata: PuzzleMetadata;

  fog?: FogState;

  unknown: Record<string, unknown>;
}
```

The invariant should be:

> Every input adapter eventually produces the same native scene representation before SVG generation.

---

# 44. Recommended renderer passes

Use this order:

```text
1. decode/normalize source puzzle
2. extract metadata
3. run fog source normalization
4. recognize visual features
5. normalize cages/regions
6. determine rows/columns
7. create fixed SVG layers
8. render background
9. render source underlays/overlays/paths through feature handlers
10. render cages/regions/grid
11. render givens and source marks
12. apply fog masks/state
13. apply background-image feature
14. apply emoji replacement
15. apply CSS/settings
16. calculate content bounds/viewBox
```

Match SudokuPad's actual insertion order within shared layers, especially arrows vs. lines.

---

# 45. Strong conformance-testing strategy

Do not use published puzzles as your only specification.

Use **differential rendering**.

For each test payload:

```text
same payload
   |
   +--> pinned real SudokuPad --> reference SVG + PNG
   |
   +--> your implementation --> candidate SVG + PNG
```

## 45.1 Structural SVG comparison

Normalize:
- generated IDs;
- irrelevant attribute order;
- whitespace.

Then compare:
- group/layer order;
- node counts;
- element types;
- `d`;
- x/y/width/height;
- transforms;
- fill/stroke;
- opacity;
- stroke widths;
- marker geometry;
- text content;
- font sizes/classes.

This catches implementation mistakes far more precisely than screenshots.

## 45.2 Image comparison

Then rasterize both in the same Chromium build.

Use:
- per-pixel threshold;
- percentage of materially different pixels;
- optional SSIM/perceptual metric.

Ignore tiny anti-aliasing differences below a chosen threshold.

## 45.3 Test dimensions

Build synthetic fixtures for:

### Lines
- one/two/many points;
- fractional coordinates;
- outside-grid;
- explicit `d`;
- every safe SVG attribute you decide to support;
- thickness 1 legacy case.

### Arrows
- stroke/fill head;
- default/custom headLength;
- headAngle;
- headIndent;
- very short final segment;
- arbitrary fractional paths.

### Rectangles
- border only;
- fill only;
- same border/fill;
- rounded;
- explicit roundedRadius;
- rotation;
- opacity;
- outside board.

### Text
- small/large;
- multiline;
- maxWidth;
- rotation;
- background;
- black/white/custom colors;
- emoji;
- non-breaking spaces.

### Cages
- single cell;
- rectangles;
- L shape;
- concave shape;
- holes;
- disconnected components;
- every cage style;
- value labels;
- long values.

### Cells
- givens;
- center marks;
- corner marks;
- zero-is-ten;
- values hiding marks;
- all candidate counts.

### Fog
- initial foglight;
- ordinary 3x3 reveal;
- edge/corner reveal;
- trigger effects;
- fog-hidden givens;
- cage-based FOGLIGHT compatibility.

### Import formats
- SCL;
- CTC alias;
- F-Puzzles;
- F-Puzzles alias;
- SCF;
- pack;
- remote short ID.

### ViewBox
- normal grid only;
- all four outside edges;
- large arrows;
- external text;
- background image.

---

# 46. Regression corpus

After synthetic branch coverage is complete, add real-world puzzles.

The real corpus serves to catch **interactions**, not discover primitive types.

Recommended tiers:

```text
Tier 1: 100 synthetic unit fixtures
Tier 2: 100 synthetic combinational fixtures
Tier 3: 500-5000 real SudokuPad payloads
```

For every real payload, automatically record:
- source URL/ID;
- resolved payload format;
- unknown source fields;
- unknown features;
- renderer warnings;
- SVG diff score;
- raster diff score.

If a real puzzle fails while all primitive tests pass, inspect the composition/order rather than inventing a new “variant renderer.”

---

# 47. Upstream-change monitoring

Compatibility with future SudokuPad should be automated.

Periodically:
1. fetch current SudokuPad HTML/JS/CSS;
2. hash all core rendering/import files;
3. compare with pinned build;
4. if hashes changed:
   - AST/text diff relevant functions;
   - search for new format registrations;
   - search for new fields read from source parts;
   - search for new `render*` functions;
   - search for new SVG layers;
   - run the full differential suite.

High-signal source terms:

```text
PuzzleLoader.addPuzzleFormat
parseFPuzzle
PuzzleZipper
convertPuzzle
PuzzleFeatures
renderPart
renderLine
renderArrow
renderRect
renderText
renderCage
handleFogFeature
#svgrenderer
addLayer
```

---

# 48. Definition of "comprehensive" for this build

You can legitimately call the implementation comprehensive for the captured build when all of these are true:

- [ ] Every registered core payload prefix is decoded.
- [ ] Remote short IDs use the same resolution/fallback semantics.
- [ ] PuzzleZipper compatibility tests round-trip captured SCL payloads.
- [ ] Every F-Puzzles key handled by the captured parser has a test.
- [ ] SCF and pack have tests.
- [ ] Every native source top-level collection is preserved.
- [ ] Unknown source fields are preserved/logged.
- [ ] All SVG layers exist in correct order.
- [ ] Every core renderer primitive matches.
- [ ] Arbitrary safe SVG attribute pass-through is tested.
- [ ] Cage-outline algorithm matches on exhaustive/synthetic cell sets.
- [ ] Every feature-recognition branch affecting rendering is tested.
- [ ] Default CSS appearance matches.
- [ ] Arrows-vs-lines ordering matches.
- [ ] Fog static state and triggered updates match.
- [ ] Background images match.
- [ ] Emoji handling matches or is intentionally disabled in both sides.
- [ ] Content-bound/viewBox behavior matches.
- [ ] Historical hard-coded puzzle-ID compatibility cases are decided/tested.
- [ ] Default settings profile is explicit.
- [ ] User-installed plugin behavior is explicitly outside the core guarantee.
- [ ] Large real-world regression corpus has zero unexplained structural failures.

At that point, testing more random puzzles increases confidence in composition but should not reveal an entirely new core rendering primitive unless SudokuPad itself changes.

---

# 49. Implementation priority

Recommended order:

### Phase A — exact native static rendering
1. SVG root/layers.
2. line.
3. rect.
4. text.
5. arrow.
6. cage outline.
7. grid.
8. givens/marks.
9. viewBox.

### Phase B — payload compatibility
10. PuzzleZipper.
11. SCL/CTC.
12. remote ID loader.
13. F-Puzzles converter.
14. SCF.
15. packs.

### Phase C — compatibility transformations
16. feature recognition.
17. legacy opacity.
18. arrows-above-lines.
19. dark/default CSS behavior.

### Phase D — dynamic/edge features
20. fog.
21. background images.
22. emoji.
23. historical ID exceptions.
24. optional player annotations.

### Phase E — confidence
25. synthetic differential suite.
26. real-world corpus.
27. upstream monitor.

---

# 50. Bottom line

The captured SudokuPad renderer is **not** an enormous collection of renderer implementations for every Sudoku variant.

Its core is a small SVG scene renderer:

```text
path
arrow
rect / rounded rect
text
cell-set outline
grid
cell content
```

The importers and feature-recognition layer are what make hundreds of Sudoku variants appear diverse.

That means the reliable route to “render anything SudokuPad can render” is:

```text
reproduce the complete input adapters
+
reproduce the native normalization/feature pass
+
reproduce the small generic SVG renderer
+
reproduce CSS/layer behavior
+
differentially test against a pinned real SudokuPad build
```

—not collecting examples until you hope every variant has appeared.

For the captured 0.612.0 build, that compatibility surface is finite and implementable.
