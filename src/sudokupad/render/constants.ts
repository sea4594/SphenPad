import type { SudokuPadSvgLayer } from "../types/scene";

export const CELL_SIZE = 64;
export const VIEWBOX_SNAP = CELL_SIZE * 0.25;
export const MIN_CONTENT_PADDING = 4;

export const CAGE_VALUE_STYLE = {
  width: 0.2,
  height: 0.2,
  fontSize: 13,
  textAnchor: "start",
  backgroundColor: "rgba(255,255,255,0.9)",
} as const;

export const CAGE_BORDER_STYLES = {
  killer: {
    offset: 0.08,
    border: {
      fill: "none",
      stroke: "rgba(0, 0, 0, 1)",
      "stroke-width": "1.5px",
      "stroke-dasharray": "5 3",
      "stroke-dashcorner": "4",
    },
  },
  box: {
    offset: 0,
    border: { fill: "none", stroke: "rgba(0, 0, 0, 1)", "stroke-width": "3px" },
  },
  windoku: {
    offset: 0.08,
    border: { fill: "#cfcfcf33", stroke: "none", "stroke-width": "0" },
  },
  selectioncage: {
    offset: 0.0625,
    border: {
      fill: "rgba(255, 255, 255, 0.4)",
      stroke: "rgba(0, 126, 255, 0.7)",
      "stroke-width": "8px",
      "stroke-linecap": "butt",
      "stroke-linejoin": "round",
    },
  },
  extraregion: {
    offset: 0.09375,
    border: { fill: "rgba(178, 178, 178, 0.4)", stroke: "none", "stroke-width": "0" },
  },
  fpRowIndexer: {
    offset: 0.0390625,
    border: { fill: "#7CC77C33", stroke: "#7CC77C", "stroke-opacity": "0.7", "stroke-width": "4px" },
  },
  fpColumnIndexer: {
    offset: 0.0390625,
    border: { fill: "#C77C7C33", stroke: "#C77C7C", "stroke-opacity": "0.7", "stroke-width": "4px" },
  },
  fpBoxIndexer: {
    offset: 0.0390625,
    border: { fill: "#7C7CC733", stroke: "#7C7CC7", "stroke-opacity": "0.7", "stroke-width": "4px" },
  },
} as const;

export const RENDERER_INTERNAL_ATTRS = new Set([
  "target", "center", "rounded", "thickness", "text", "feature", "color", "angle",
  "borderColor", "borderSize", "wayPoints", "backgroundColor", "textAnchor", "fontSize",
  "maxWidth", "textStroke",
]);

export const TYPE_ATTR_EXCLUSIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  path: new Set(["width", "height"]),
  rect: new Set(),
  text: new Set(["width", "height"]),
  g: new Set(["width", "height"]),
  marker: new Set(["width", "height"]),
};

export const CELL_COLOR_VALUES: Readonly<Record<string, string>> = {
  "0": "rgba(255, 255, 255, 0.6)",
  "1": "rgba(214, 214, 214, 0.6)",
  "2": "rgba(124, 124, 124, 0.6)",
  "3": "rgba(-36, -36, -36, 0.6)",
  "4": "rgba(179, 229, 106, 0.6)",
  "5": "rgba(232, 124, 241, 0.6)",
  "6": "rgba(228, 150, 50, 0.6)",
  "7": "rgba(245, 58, 55, 0.6)",
  "8": "rgba(252, 235, 63, 0.6)",
  "9": "rgba(61, 153, 245, 0.6)",
};

export const DEFAULT_LAYER_FOR_GRAPHIC: SudokuPadSvgLayer = "underlay";
