import { describe, expect, it } from 'vitest';
import { dailySeeds, iou, makePuzzle, matchScore, shadowRaster, shadyShare, targetRaster, type Mask } from '../src/shady/logic';

/** Een L-vormige figuur van 30 × 30 cellen als test-masker. */
function lMask(): Mask {
  const w = 30,
    h = 30;
  const cells = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (c < 10 || r > 20) cells[r * w + c] = 1;
  return { w, h, cells };
}

describe('shady', () => {
  it('the target sun reassembles the shape exactly', () => {
    const seeds = dailySeeds('2026-11-17');
    seeds.forEach((s, i) => {
      const p = makePuzzle(s, lMask(), i);
      const t = targetRaster(p.pieces);
      expect(iou(t, shadowRaster(p.pieces, p.target, p.target))).toBe(1);
      // de figuur blijft heel: alle cellen van het masker zijn verdeeld
      expect(t.reduce((a, x) => a + x, 0)).toBe(lMask().cells.reduce((a, x) => a + x, 0));
    });
  });

  it('the starting sun scatters the pieces', () => {
    dailySeeds('2026-11-18').forEach((s, i) => {
      const p = makePuzzle(s, lMask(), i);
      expect(iou(targetRaster(p.pieces), shadowRaster(p.pieces, p.target, p.start))).toBeLessThan(0.5);
    });
  });

  it('close suns score higher than far suns', () => {
    const p = makePuzzle(dailySeeds('2026-11-19')[2], lMask(), 2);
    const t = targetRaster(p.pieces);
    const near = iou(t, shadowRaster(p.pieces, p.target, { az: p.target.az + 0.03, el: p.target.el }));
    const far = iou(t, shadowRaster(p.pieces, p.target, { az: p.target.az + 0.6, el: p.target.el }));
    expect(near).toBeGreaterThan(far);
  });

  it('pieces get more numerous and sit at different heights', () => {
    const s = dailySeeds('2026-11-20');
    const a = makePuzzle(s[0], lMask(), 0);
    const b = makePuzzle(s[4], lMask(), 4);
    expect(b.pieces.length).toBeGreaterThan(a.pieces.length);
    expect(new Set(b.pieces.map((p) => p.h.toFixed(2))).size).toBe(b.pieces.length);
  });

  it('daily shapes are fixed per day and distinct', () => {
    const a = dailySeeds('2026-11-17').map((s) => s.shape.name);
    expect(a).toEqual(dailySeeds('2026-11-17').map((s) => s.shape.name));
    expect(new Set(a).size).toBe(5);
  });

  it('scores', () => {
    expect(matchScore(0.96)).toBe(100);
    expect(matchScore(0.1)).toBe(0);
    expect(shadyShare(4, [100, 90, 70, 50, 10], ['🐈'])).toContain('Shady #4 — 320/500');
  });
});
