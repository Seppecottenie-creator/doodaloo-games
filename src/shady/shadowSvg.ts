import type { Cell } from './logic';

/** Schaduw als SVG: cellen netjes in het midden, zelfde schaal voor alle kaarten van een puzzel. */
export function shadowSvg(cells: Cell[], size: number): string {
  const w = Math.max(...cells.map((c) => c[0])) + 1;
  const h = Math.max(...cells.map((c) => c[1])) + 1;
  const ox = (size - w) / 2;
  const oy = (size - h) / 2;
  const pad = 0.45;
  const rects = cells
    .map(([u, v]) => `<rect x="${(u + ox - 0.01).toFixed(2)}" y="${(size - 1 - v - oy - 0.01).toFixed(2)}" width="1.02" height="1.02"/>`)
    .join('');
  return `<svg viewBox="${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}" aria-hidden="true"><defs><filter id="sb" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.035"/></filter></defs><g class="sh-cells" filter="url(#sb)">${rects}</g></svg>`;
}
