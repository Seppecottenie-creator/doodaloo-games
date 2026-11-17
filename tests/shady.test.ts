import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/game/rng';
import { dailyLevels, hull, iou, matchScore, rasterize, shadowPolys, shadyShare, type Part } from '../src/shady/logic';

const cube: Part[] = [{ kind: 'box', c: [0, 1, 0], s: [0.5, 0.5, 0.5] }];

describe('shady', () => {
  it('hull of a square', () => {
    expect(hull([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]])).toHaveLength(4);
  });

  it('sun straight overhead casts the footprint', () => {
    const polys = shadowPolys(cube, { az: 0, el: Math.PI / 2 - 1e-6 });
    const r = rasterize(polys);
    const cells = r.reduce((s, x) => s + x, 0);
    // 1×1 op een rooster van 12/96 = 0,125 per cel → ±64 cellen
    expect(cells).toBeGreaterThan(50);
    expect(cells).toBeLessThan(90);
  });

  it('lower sun = longer shadow, pointing away from the sun', () => {
    const high = rasterize(shadowPolys(cube, { az: 0, el: 1.2 })).reduce((s, x) => s + x, 0);
    const low = rasterize(shadowPolys(cube, { az: 0, el: 0.5 })).reduce((s, x) => s + x, 0);
    expect(low).toBeGreaterThan(high);
    // zon in +x → schaduw naar −x
    const xs = shadowPolys(cube, { az: 0, el: 0.5 })[0].map((p) => p[0]);
    expect(Math.min(...xs)).toBeLessThan(-1);
  });

  it('iou is 1 for the target sun and lower elsewhere', () => {
    for (const lv of dailyLevels('2026-11-17')) {
      const t = rasterize(shadowPolys(lv.parts, lv.target));
      expect(iou(t, t)).toBe(1);
      expect(iou(t, rasterize(shadowPolys(lv.parts, lv.start)))).toBeLessThan(0.36);
    }
  });

  it('daily levels are deterministic and 5 long', () => {
    const a = dailyLevels('2026-11-17');
    expect(a).toHaveLength(5);
    expect(JSON.stringify(a)).toBe(JSON.stringify(dailyLevels('2026-11-17')));
  });

  it('scores', () => {
    expect(matchScore(0.98)).toBe(100);
    expect(matchScore(0.5)).toBe(50);
    expect(shadyShare(3, [100, 92, 80, 60, 10])).toContain('Shady #3 — 342/500');
  });

  it('level generation is quick', () => {
    const r = mulberry32(5);
    const t = performance.now();
    for (let i = 0; i < 20; i++) dailyLevels(`2026-01-${10 + i}`);
    expect(performance.now() - t).toBeLessThan(3000);
    void r;
  });
});
