export const PUZZLE_ZIPPER_PROP_MAP = {
  color: "c",
  cages: "ca",
  center: "ct",
  borderColor: "c1",
  backgroundColor: "c2",
  cells: "ce",
  cellSize: "cs",
  arrows: "a",
  overlays: "o",
  underlays: "u",
  width: "w",
  height: "h",
  value: "v",
  videos: "vd",
  lines: "l",
  rounded: "r",
  regions: "re",
  fontSize: "fs",
  thickness: "th",
  headLength: "hl",
  wayPoints: "wp",
  title: "t",
  text: "te",
  duration: "d",
  d: "d2",
} as const;

function mapProps(value: unknown, map: Record<string, string>): unknown {
  if (Array.isArray(value)) {
    value.forEach((entry) => mapProps(entry, map));
    return value;
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const originalKey of Object.keys(object)) {
      let key = originalKey;
      if (map[key] !== undefined) {
        const mapped = map[key];
        if (object[mapped] !== undefined) throw new Error(`Prop mapping collission from ${key}: ${String(object[key])} to ${mapped}: ${String(object[mapped])}`);
        object[mapped] = object[key];
        delete object[key];
        key = mapped;
      }
      mapProps(object[key], map);
    }
  }
  return value;
}

function mapValues(value: unknown, fn: (value: unknown) => unknown): unknown {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => { value[index] = mapValues(entry, fn); });
    return value;
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    Object.keys(object).forEach((key) => { object[key] = mapValues(object[key], fn); });
    return value;
  }
  return fn(value);
}

function clearEmptyArrays(value: unknown): unknown {
  if (Array.isArray(value)) value.forEach(clearEmptyArrays);
  else if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    Object.keys(object).forEach((key) => {
      clearEmptyArrays(object[key]);
      if (Array.isArray(object[key]) && (object[key] as unknown[]).length === 0) delete object[key];
    });
  }
  return value;
}

export function zipQuotes(value: string): string {
  return value.replace(/'/g, "\\'").replace(/"/g, "'");
}

export function unzipQuotes(value: string): string {
  return value.includes('"') ? value : value.replace(/(?!<\\)\\'/g, "’").replace(/'/g, '"').replace(/’/g, "'");
}

const RE_QUOTED_STRING_SPLIT = /("(?:[^"]|\\"])*")/gm;
const RE_QUOTED_MARKER_SPLIT = /("__\{S[0-9]+\}__")/;
const RE_QUOTED_MARKER = /"__\{S([0-9]+)\}__"/;

export function zipPuzzleJson(input: string | unknown): string {
  let value = typeof input === "string" ? JSON.parse(input) : structuredClone(input);
  clearEmptyArrays(value);
  mapProps(value, PUZZLE_ZIPPER_PROP_MAP as unknown as Record<string, string>);
  value = mapValues(value, (entry) => (
    typeof entry === "string" && String(parseInt(entry, 10)) === entry ? parseInt(entry, 10) : entry
  ));
  const json = JSON.stringify(value)
    .replace(/([,{[])"([a-zA-Z0-9]+)":/gm, "$1$2:")
    .replace(/([,{[]){}(?=[,}\]])/gm, "$1")
    .replace(/(:)false([,}\]])/gm, "$1f$2")
    .replace(/(:)true([,}\]])/gm, "$1t$2")
    .replace(/(:)"#000000"([,}\]])/gm, "$1#0$2")
    .replace(/(:)"#FFFFFF"([,}\]])/gm, "$1#F$2")
    .replace(/(:)"#([0-9a-fA-F]{6})"([,}\]])/gm, "$1$2$3");
  return zipQuotes(json);
}

export function unzipPuzzleJson(zipped: string): string {
  let result = unzipQuotes(zipped);
  const split = result.split(RE_QUOTED_STRING_SPLIT);
  const strings = split.filter((_part, index) => index % 2 === 1);
  result = split.map((part, index) => index % 2 ? `"__{S${Math.floor(index / 2)}}__"` : part).join("");

  result = result
    .replace(/([,{[])([a-zA-Z0-9]+):/gm, '$1"$2":')
    .replace(/([,{[])(?=[,}\]])/gm, "$1_")
    .replace(/{_}/gm, "{}")
    .replace(/([,{[])_/gm, "$1{}")
    .replace(/(:)f([,}\]])/gm, "$1false$2")
    .replace(/(:)t([,}\]])/gm, "$1true$2")
    .replace(/(:)#0([,}\]])/gm, '$1"#000000"$2')
    .replace(/(:)#F([,}\]])/gm, '$1"#FFFFFF"$2')
    .replace(/(:)([0-9a-fA-F]{6})([,}\]])/gm, '$1"#$2"$3');

  result = result.split(RE_QUOTED_MARKER_SPLIT).map((part) => {
    const match = part.match(RE_QUOTED_MARKER);
    return match ? strings[parseInt(match[1], 10)] : part;
  }).join("");

  let parsed: unknown = JSON.parse(result);
  const reverseMap: Record<string, string> = {};
  Object.keys(PUZZLE_ZIPPER_PROP_MAP).forEach((key) => {
    reverseMap[PUZZLE_ZIPPER_PROP_MAP[key as keyof typeof PUZZLE_ZIPPER_PROP_MAP]] = key;
  });
  mapProps(parsed, reverseMap);
  parsed = mapValues(parsed, (entry) => (
    typeof entry === "string" && /^([0-9a-fA-F]{6})$/.test(entry) ? `#${entry}` : entry
  ));
  return JSON.stringify(parsed);
}

export function saveJsonUnzip(input: unknown): unknown {
  if (input !== null && typeof input === "object") return input;
  if (typeof input !== "string") return input;
  try { return JSON.parse(input); }
  catch {
    try { return JSON.parse(unzipPuzzleJson(input)); }
    catch { return input; }
  }
}
