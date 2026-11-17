import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/game/rng';
import { canon, connected, grow, levelFor, makePuzzle, project, Run, transform, START_TIME, WRONG_PENALTY } from '../src/shady/logic';

describe('shady', () => {
  it('grows connected sculptures inside the grid', () => {
    for (let s = 1; s < 50; s++) {
      const c = grow(mulberry32(s), 7, 4);
      expect(c).toHaveLength(7);
      expect(new Set(c.map((x) => x.join())).size).toBe(7);
      expect(connected(c)).toBe(true);
      expect(c.every((p) => p.every((v) => v >= 0 && v < 4))).toBe(true);
    }
  });

  it('canon ignores rotation and mirroring', () => {
    const L: [number, number][] = [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
    ];
    for (let t = 0; t < 8; t++) expect(canon(transform(L, t))).toBe(canon(L));
  });

  it('exactly one option can be cast by the sculpture', () => {
    for (let s = 1; s < 120; s++) {
      const rnd = mulberry32(s);
      const p = makePuzzle(rnd, levelFor(s % 30));
      const truth = new Set([0, 1, 2].map((a) => canon(project(p.cubes, a))));
      const real = p.options.map((o) => truth.has(canon(o)));
      expect(real.filter(Boolean)).toHaveLength(1);
      expect(real[p.answer]).toBe(true);
      expect(new Set(p.options.map(canon)).size).toBe(4);
    }
  });

  it('runs are deterministic per seed and track time', () => {
    const a = new Run('shady2:2026-11-17');
    const b = new Run('shady2:2026-11-17');
    expect(a.current).toEqual(b.current);
    expect(a.answer(a.current.answer)).toBe(true);
    expect(a.time).toBeGreaterThan(START_TIME);
    const t = a.time;
    a.answer((a.current.answer + 1) % 4);
    expect(a.time).toBeCloseTo(t - WRONG_PENALTY);
    expect(a.streak).toBe(0);
    a.tick(999);
    expect(a.over).toBe(true);
  });
});
