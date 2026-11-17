import { describe, expect, it } from 'vitest';
import { layoutStack } from '../src/scale/layout';
import { WEIGHTS } from '../src/game/config';

describe('layoutStack', () => {
  it('past altijd binnen de schaal, hoeveel gewichten er ook liggen', () => {
    const pan = 150;
    const maxH = 120;
    let id = 1;
    for (let trial = 0; trial < 200; trial++) {
      const items = [];
      for (let i = 0; i < WEIGHTS.length; i++) {
        const n = Math.floor(Math.random() * 5);
        for (let k = 0; k < n; k++) items.push({ id: id++, idx: i });
      }
      const { slots } = layoutStack(items, 1, pan, maxH);
      expect(slots).toHaveLength(items.length);
      for (const s of slots) {
        expect(Math.abs(s.x) + s.w / 2).toBeLessThanOrEqual(pan * 0.54 + 1e-6);
        expect(-s.y + s.h).toBeLessThanOrEqual(maxH + 1e-6);
      }
    }
  });
  it('legt het zwaarste gewicht onderaan', () => {
    const { slots } = layoutStack([{ id: 1, idx: 0 }, { id: 2, idx: 9 }], 1, 150, 200);
    const heavy = slots.find((s) => s.idx === 9)!;
    expect(Math.abs(heavy.y)).toBe(0);
  });
});
