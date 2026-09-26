# Pre-Phase-1 interaction/layout restoration

Baseline: the public `sea4594/SphenPad` `main` branch / live site, i.e. the implementation before Phase 1.

Restored/adapted for the native SVG renderer:
- radius-0.5-cell circular node drag tracking with 24 samples/cell for cell-center selection/center lines and corner-node edge lines;
- pre-Phase-1 multi-select/single-select drag semantics retained;
- mobile portrait video resize again tracks a separate board height and passes it to the board;
- board fitting measures the real space relative to controls/viewport and maximizes the SVG into that rectangle;
- puzzle rendering is forced to the canonical light puzzle canvas independent of the SphenPad UI theme;
- selection perimeter uses the old 3.3px basis, 15% thicker (3.795px), 0.7 alpha, and is offset so its outer edge is inside and tangent to the grid stroke's inner edge.

The coordinate conversion itself remains SVG-native (`getScreenCTM`) because the renderer is now SVG rather than canvas.
