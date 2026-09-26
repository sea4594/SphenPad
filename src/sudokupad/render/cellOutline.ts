export interface OutlineCell { row: number; col: number }
export type OutlineCommand = ["M" | "L", number, number] | ["Z"];

type Direction = "t" | "r" | "b" | "l";
type Pattern = { name: string; bits: string; enter: string; exit: string; points: string };
type Segment = [number, number, OutlineCell, Pattern];

export function getCellOutline(cells: OutlineCell[], offset = 0): OutlineCommand[] {
  const edgePoints: OutlineCommand[] = [];
  const grid: Array<Array<{ cell: OutlineCell } | undefined> | undefined> = [];
  const segments: Segment[] = [];
  const shapes: Segment[][] = [];
  const checkRC = (row: number, col: number): boolean => Boolean(grid[row]?.[col]);
  const pointOffset: Record<string, [number, number]> = {
    tl: [offset, offset], tr: [offset, 1 - offset],
    bl: [1 - offset, offset], br: [1 - offset, 1 - offset],
    tc: [offset, 0.5], rc: [0.5, 1 - offset],
    bc: [1 - offset, 0.5], lc: [0.5, offset],
  };
  const dirRC: Record<Direction, [number, number]> = {
    t: [-1, 0], r: [0, 1], b: [1, 0], l: [0, -1],
  };
  const flipDir: Record<Direction, Direction> = { t: "b", r: "l", b: "t", l: "r" };
  const patterns: Pattern[] = [
    { name: "otl", bits: "_0_011_1_", enter: "bl", exit: "rt", points: "tl" },
    { name: "otr", bits: "_0_110_1_", enter: "lt", exit: "br", points: "tr" },
    { name: "obr", bits: "_1_110_0_", enter: "tr", exit: "lb", points: "br" },
    { name: "obl", bits: "_1_011_0_", enter: "rb", exit: "tl", points: "bl" },
    { name: "itl", bits: "01_11____", enter: "lt", exit: "tl", points: "tl" },
    { name: "itr", bits: "_10_11___", enter: "tr", exit: "rt", points: "tr" },
    { name: "ibr", bits: "____11_10", enter: "rb", exit: "br", points: "br" },
    { name: "ibl", bits: "___11_01_", enter: "bl", exit: "lb", points: "bl" },
    { name: "et", bits: "_0_111___", enter: "lt", exit: "rt", points: "tc" },
    { name: "er", bits: "_1__10_1_", enter: "tr", exit: "br", points: "rc" },
    { name: "eb", bits: "___111_0_", enter: "rb", exit: "lb", points: "bc" },
    { name: "el", bits: "_1_01__1_", enter: "bl", exit: "tl", points: "lc" },
    { name: "out", bits: "_0_010_1_", enter: "bl", exit: "br", points: "tl,tr" },
    { name: "our", bits: "_0_110_0_", enter: "lt", exit: "lb", points: "tr,br" },
    { name: "oub", bits: "_1_010_0_", enter: "tr", exit: "tl", points: "br,bl" },
    { name: "oul", bits: "_0_011_0_", enter: "rb", exit: "rt", points: "bl,tl" },
    { name: "solo", bits: "_0_010_0_", enter: "", exit: "", points: "tl,tr,br,bl" },
  ];

  const checkPatterns = (row: number, col: number): Pattern[] => patterns.filter(({ bits }) => {
    let matches = true;
    bits.split("").forEach((bit, index) => {
      const r = row + Math.floor(index / 3) - 1;
      const c = col + (index % 3) - 1;
      const checked = checkRC(r, c);
      matches = matches && (bit === "_" || (bit === "1" && checked) || (bit === "0" && !checked));
    });
    return matches;
  });

  const getSegment = (items: Segment[], rc: [number, number], enter: string): Segment | undefined =>
    items.find(([row, col, , pattern]) => row === rc[0] && col === rc[1] && pattern.enter === enter);

  const followShape = (items: Segment[]): Segment[] => {
    const shape: Segment[] = [];
    let segment = items[0];
    const getNext = (current: Segment): Segment | undefined => {
      const [, , , pattern] = current;
      if (pattern.exit === "") return undefined;
      const exitDir = pattern.exit[0] as Direction;
      const exitSide = pattern.exit[1] ?? "";
      const [row, col] = current;
      const delta = dirRC[exitDir];
      const nextRC: [number, number] = [row + delta[0], col + delta[1]];
      return getSegment(items, nextRC, flipDir[exitDir] + exitSide);
    };
    while (segment !== undefined) {
      shape.push(segment);
      items.splice(items.indexOf(segment), 1);
      const next = getNext(segment);
      if (next === undefined || shape.includes(next)) break;
      segment = next;
    }
    return shape;
  };

  const shapeToPoints = (shape: Segment[]): Array<[number, number]> => {
    const points: Array<[number, number]> = [];
    shape.forEach(([row, col, , pattern]) => {
      pattern.points.split(",").forEach((pointName) => {
        const [rowOffset, colOffset] = pointOffset[pointName] ?? [0, 0];
        points.push([row + rowOffset, col + colOffset]);
      });
    });
    return points;
  };

  cells.forEach((cell) => {
    grid[cell.row] ??= [];
    grid[cell.row]![cell.col] = { cell };
  });
  cells.forEach((cell) => {
    checkPatterns(cell.row, cell.col).forEach((pattern) => segments.push([cell.row, cell.col, cell, pattern]));
  });
  while (segments.length > 0) {
    const shape = followShape(segments);
    if (shape.length > 0) shapes.push(shape);
  }
  shapes.forEach((shape) => {
    shapeToPoints(shape).forEach(([row, col], index) => edgePoints.push([index === 0 ? "M" : "L", row, col]));
    edgePoints.push(["Z"]);
  });
  return edgePoints;
}
