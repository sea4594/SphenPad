import type { SudokuPadPoint } from "../types/source";
import { CELL_SIZE } from "./constants";

export function calcDistance(a: SudokuPadPoint, b: SudokuPadPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

export function rcToPathData(points: SudokuPadPoint[]): string {
  return points
    .map(([row, col], index) => `${index === 0 ? "M" : "L"}${col * CELL_SIZE} ${row * CELL_SIZE}`)
    .join(" ");
}

export function pointsToPath(points: Array<[number, number]>, close = false, digits = 2): string {
  const factor = 10 ** digits;
  const body = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${Math.round(x * factor) / factor} ${Math.round(y * factor) / factor}`)
    .join(" ");
  return body + (close ? "Z" : "");
}

export function centerPoint(point: SudokuPadPoint): void {
  point[0] = Math.floor(point[0]) + 0.5;
  point[1] = Math.floor(point[1]) + 0.5;
}

export function retractFinalPoint(points: SudokuPadPoint[], retract = 0): SudokuPadPoint[] {
  if (points.length < 2) return points;
  const p0 = points[points.length - 2];
  const p1 = points[points.length - 1];
  if (!p0 || !p1) return points;
  const dist = calcDistance(p0, p1);
  if (dist === 0) return points;
  const delta: SudokuPadPoint = [(p1[0] - p0[0]) / dist, (p1[1] - p0[1]) / dist];
  let scale = retract / CELL_SIZE;
  p1[0] -= delta[0] * scale;
  p1[1] -= delta[1] * scale;
  if (dist - retract / CELL_SIZE <= 0) {
    scale -= dist - 0.0001;
    p0[0] -= delta[0] * scale;
    p0[1] -= delta[1] * scale;
  }
  return points;
}

export function squareSegment(a1: number, a2: number): Array<[number, number]> {
  const angToSquareEdgePoint = (angle: number): [number, number] => {
    const phi = angle * Math.PI / 180;
    const sin = Math.sin(phi);
    const cos = Math.cos(phi + Math.PI);
    let x: number;
    let y: number;
    if (Math.abs(sin) < Math.abs(cos)) {
      y = Math.sign(cos);
      x = Math.tan(phi) * -y;
    } else {
      x = Math.sign(sin);
      y = (1 / Math.tan(phi)) * -x;
    }
    return [0.5 * (x + 1), 0.5 * (y + 1)];
  };
  const delta = a2 - a1;
  const offset = a1 - (a1 % 90);
  const b1 = a1 % 90;
  const b2 = b1 + delta;
  const points: Array<[number, number]> = [angToSquareEdgePoint(b1 + offset)];
  for (let corner = 0; corner < 4; corner += 1) {
    const cornerAngle = 45 + corner * 90;
    if (Math.sign(b1 - cornerAngle) !== Math.sign(b2 - cornerAngle)) {
      points.push(angToSquareEdgePoint(cornerAngle + offset));
    }
  }
  points.push(angToSquareEdgePoint(b2 + offset));
  return points;
}
