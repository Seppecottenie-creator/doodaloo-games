import { MASK_SIZE, type Mask } from './logic';

/** Teken een emoji op een canvas en maak er een silhouet-masker van. */
export function emojiMask(emoji: string, size = MASK_SIZE): Mask {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.font = `${S * 0.8}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, S / 2, S * 0.55);
  const d = g.getImageData(0, 0, S, S).data;
  let x0 = S,
    y0 = S,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++)
      if (d[(y * S + x) * 4 + 3] > 110) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  if (x1 <= x0 || y1 <= y0) return fallbackMask(size);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const scale = size / Math.max(bw, bh);
  const w = Math.max(4, Math.round(bw * scale));
  const h = Math.max(4, Math.round(bh * scale));
  const cells = new Uint8Array(w * h);
  // per cel: gemiddelde dekking van de pixels eronder
  for (let r = 0; r < h; r++)
    for (let col = 0; col < w; col++) {
      const sx0 = x0 + Math.floor(col / scale);
      const sx1 = x0 + Math.max(Math.floor((col + 1) / scale), Math.floor(col / scale) + 1);
      const sy0 = y0 + Math.floor(r / scale);
      const sy1 = y0 + Math.max(Math.floor((r + 1) / scale), Math.floor(r / scale) + 1);
      let on = 0,
        all = 0;
      for (let y = sy0; y < sy1 && y < S; y++)
        for (let x = sx0; x < sx1 && x < S; x++) {
          all++;
          if (d[(y * S + x) * 4 + 3] > 110) on++;
        }
      cells[r * w + col] = all && on / all >= 0.5 ? 1 : 0;
    }
  if (cells.reduce((a, x) => a + x, 0) < 60) return fallbackMask(size);
  return { w, h, cells };
}

/** Zonder emoji-lettertype: een ster. */
function fallbackMask(size: number): Mask {
  const w = size,
    h = size;
  const cells = new Uint8Array(w * h);
  const cx = w / 2,
    cy = h / 2;
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const a = Math.atan2(r - cy, c - cx);
      const rad = Math.hypot(r - cy, c - cx) / (size / 2);
      const edge = 0.45 + 0.5 * Math.pow(Math.abs(Math.cos((a * 5) / 2)), 3);
      if (rad <= edge) cells[r * w + c] = 1;
    }
  return { w, h, cells };
}

/** Het voorbeeld: het silhouet als donkere vorm op een lichte kaart. */
export function maskCanvas(mask: Mask, px = 120): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  c.width = c.height = px * dpr;
  const g = c.getContext('2d')!;
  const cell = (px * dpr * 0.8) / Math.max(mask.w, mask.h);
  const ox = (px * dpr - mask.w * cell) / 2;
  const oy = (px * dpr - mask.h * cell) / 2;
  g.fillStyle = '#120e22';
  for (let r = 0; r < mask.h; r++)
    for (let col = 0; col < mask.w; col++) if (mask.cells[r * mask.w + col]) g.fillRect(ox + col * cell, oy + r * cell, cell + 0.6, cell + 0.6);
  return c;
}
