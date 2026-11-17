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

type Group = { idx: number; items: Placed[] };

/** Eén toren: zwaarste onderaan, gelijke gewichten naast elkaar zolang ze passen. */
function column(groups: Group[], unit: number, width: number, cx: number): { slots: Slot[]; height: number; widest: number } {
  const gap = 2 * unit;
  let support = width;
  let y = 0;
  let widest = 0;
  const slots: Slot[] = [];
  for (const { idx, items } of groups) {
    const w = WEIGHT_SIZE[idx][0] * unit;
    const h = WEIGHT_SIZE[idx][1] * unit;
    const perRow = Math.max(1, Math.floor((Math.max(support, w) + gap) / (w + gap)));
    let i = 0;
    let lastRowWidth = w;
    while (i < items.length) {
      const n = Math.min(perRow, items.length - i);
      const rowW = n * w + (n - 1) * gap;
      for (let k = 0; k < n; k++) {
        const it = items[i + k];
        const jitter = (((it.id * 7919) % 7) - 3) * 0.6 * unit * (n === 1 ? 1 : 0.3);
        slots.push({ id: it.id, idx, x: cx - rowW / 2 + w / 2 + k * (w + gap) + jitter, y: -y, w, h });
      }
      widest = Math.max(widest, rowW);
      y += h;
      lastRowWidth = rowW;
      i += n;
    }
    support = lastRowWidth;
  }
  // hengsels en haken steken ±40% boven de bovenste rij uit
  const lastIdx = groups.length ? groups[groups.length - 1].idx : 0;
  const height = y + (groups.length ? WEIGHT_SIZE[lastIdx][1] * unit * 0.4 : 0);
  return { slots, height, widest };
}

/**
 * Stapelt gewichten zodat ze altijd mooi op de schaal passen:
 * één toren als dat kan, anders twee torens naast elkaar; daarna geschaald op hoogte én breedte.
 */
export function layoutStack(items: Placed[], unit: number, panWidth: number, maxHeight: number): { slots: Slot[]; scale: number } {
  const byIdx = new Map<number, Placed[]>();
  for (const it of items) byIdx.set(it.idx, [...(byIdx.get(it.idx) ?? []), it]);
  const groups: Group[] = [...byIdx.entries()].sort((a, b) => b[0] - a[0]).map(([idx, list]) => ({ idx, items: list }));

  const fit = (slots: Slot[], height: number) => {
    const widest = slots.reduce((m, s) => Math.max(m, Math.abs(s.x) + s.w / 2), 0) * 2;
    return Math.min(1, maxHeight / Math.max(height, 1e-6), (panWidth * 1.08) / Math.max(widest, 1e-6));
  };

  const one = column(groups, unit, panWidth * 0.92, 0);
  let best = { slots: one.slots, scale: fit(one.slots, one.height) };

  if (groups.length >= 2 && best.scale < 1) {
    // twee torens: verdeel de soorten (zwaarste eerst) over de laagste toren
    const cols: Group[][] = [[], []];
    const hgt = [0, 0];
    for (const g of groups) {
      const c = hgt[0] <= hgt[1] ? 0 : 1;
      cols[c].push(g);
      hgt[c] += WEIGHT_SIZE[g.idx][1] * unit * Math.ceil(g.items.length / 3);
    }
    const half = panWidth * 0.46;
    const a = column(cols[0], unit, half, 0);
    const b = column(cols[1], unit, half, 0);
    const off = (Math.max(a.widest, 1e-6) + Math.max(b.widest, 1e-6)) / 4 + 2 * unit;
    const slots = [...a.slots.map((s) => ({ ...s, x: s.x - off })), ...b.slots.map((s) => ({ ...s, x: s.x + off }))];
    const scale = fit(slots, Math.max(a.height, b.height));
    if (scale > best.scale * 1.08) best = { slots, scale };
  }

  if (best.scale < 1) {
    for (const s of best.slots) {
      s.x *= best.scale;
      s.y *= best.scale;
      s.w *= best.scale;
      s.h *= best.scale;
    }
  }
  return best;
}
