let nextSvgScope = 1;
const scopes = new WeakMap<SVGSVGElement, string>();

export function getSudokuPadSvgScope(svg: SVGSVGElement): string {
  const existing = scopes.get(svg);
  if (existing) return existing;
  const fromAttr = svg.dataset.sphenpadSvgScope;
  if (fromAttr) {
    scopes.set(svg, fromAttr);
    return fromAttr;
  }
  const scope = `sphenpad-svg-${nextSvgScope++}`;
  scopes.set(svg, scope);
  svg.dataset.sphenpadSvgScope = scope;
  return scope;
}

export function sudokuPadScopedSvgId(svg: SVGSVGElement, localId: string): string {
  return `${getSudokuPadSvgScope(svg)}-${localId}`;
}
