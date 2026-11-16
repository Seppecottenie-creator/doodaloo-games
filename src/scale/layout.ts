import { WEIGHT_SIZE } from './sprites';

export interface Placed {
  id: number;
  idx: number;
}

export interface Slot {
  id: number;
  idx: number;
  /** midden, pan-lokaal (0 = midden van de schaal) */
  x: number;
  /** onderkant, negatief = omhoog vanaf het schaaloppervlak */
  y: number;
  w: number;
  h: number;
}

/**
 * Stapelt gewichten realistisch: zwaarste onderaan, gelijke gewichten naast elkaar
 * zolang ze passen op wat eronder ligt. Schaalt de hele stapel als die te hoog wordt.
 */
export function layoutStack(items: Placed[], unit: number, panWidth: number, maxHeight: number): { slots: Slot[]; scale: number } {
  const groups = new Map<number, Placed[]>();
  for (const it of items) {
    const g = groups.get(it.idx) ?? [];
    g.push(it);
    groups.set(it.idx, g);
  }
  const order = [...groups.keys()].sort((a, b) => b - a);
  const gap = 2 * unit;
  let support = panWidth * 0.92;
  let y = 0;
  const slots: Slot[] = [];
  for (const idx of order) {
    const list = groups.get(idx)!;
    const w = WEIGHT_SIZE[idx][0] * unit;
    const h = WEIGHT_SIZE[idx][1] * unit;
    const perRow = Math.max(1, Math.floor((Math.max(support, w) + gap) / (w + gap)));
    let i = 0;
    let lastRowWidth = w;
    while (i < list.length) {
      const n = Math.min(perRow, list.length - i);
      const rowW = n * w + (n - 1) * gap;
      // kleine, deterministische verschuiving voor een "met de hand gelegd"-gevoel
      for (let k = 0; k < n; k++) {
        const it = list[i + k];
        const jitter = (((it.id * 7919) % 7) - 3) * 0.6 * unit * (n === 1 ? 1 : 0.3);
        slots.push({ id: it.id, idx, x: -rowW / 2 + w / 2 + k * (w + gap) + jitter, y: -y, w, h });
      }
      y += h;
      lastRowWidth = rowW;
      i += n;
    }
    support = lastRowWidth;
  }
  // Hengsels/haken steken ±40% boven de bovenste rij uit.
  const top = y + (order.length ? WEIGHT_SIZE[order[order.length - 1]][1] * unit * 0.4 : 0);
  const widest = slots.reduce((m, s) => Math.max(m, Math.abs(s.x) * 2 + s.w), 0);
  const scale = Math.min(1, maxHeight / Math.max(top, 1), (panWidth * 1.08) / Math.max(widest, 1));
  if (scale < 1) {
    for (const s of slots) {
      s.x *= scale;
      s.y *= scale;
      s.w *= scale;
      s.h *= scale;
    }
  }
  return { slots, scale };
}
