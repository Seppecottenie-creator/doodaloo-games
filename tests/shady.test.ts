import { describe, expect, it } from 'vitest';
import objects from '../data/objects.json';
import type { GameObject } from '../src/game/types';
import { buildRounds, dailyRounds, shadowPool, shadyScore, shadyShare, SHADY_MAX, SHADY_OPTIONS, SHADY_ROUNDS } from '../src/shady/logic';
import { mulberry32 } from '../src/game/rng';

const POOL = objects as GameObject[];

describe('shady', () => {
  it('scores early answers higher', () => {
    expect(shadyScore(0, true)).toBe(100);
    expect(shadyScore(1, true)).toBe(60);
    expect(shadyScore(2, true)).toBe(30);
    expect(shadyScore(0, false)).toBe(0);
    expect(SHADY_MAX).toBe(500);
  });

  it('only uses objects with a photo', () => {
    expect(shadowPool(POOL).every((o) => o.image)).toBe(true);
  });

  it('builds 5 distinct rounds with 4 unique options incl. the answer', () => {
    for (let s = 1; s < 40; s++) {
      const rounds = buildRounds(POOL, mulberry32(s));
      expect(rounds).toHaveLength(SHADY_ROUNDS);
      expect(new Set(rounds.map((r) => r.answer.id)).size).toBe(SHADY_ROUNDS);
      expect(new Set(rounds.map((r) => r.answer.category)).size).toBe(SHADY_ROUNDS);
      for (const r of rounds) {
        expect(r.options).toHaveLength(SHADY_OPTIONS);
        expect(new Set(r.options.map((o) => o.id)).size).toBe(SHADY_OPTIONS);
        expect(r.options.some((o) => o.id === r.answer.id)).toBe(true);
        // geen lokvogel uit dezelfde categorie
        expect(r.options.filter((o) => o.category === r.answer.category)).toHaveLength(1);
      }
    }
  });

  it('daily is deterministic', () => {
    const a = dailyRounds(POOL, '2026-11-17').map((r) => r.answer.id + r.options.map((o) => o.id).join());
    const b = dailyRounds(POOL, '2026-11-17').map((r) => r.answer.id + r.options.map((o) => o.id).join());
    expect(a).toEqual(b);
    expect(dailyRounds(POOL, '2026-11-18').map((r) => r.answer.id)).not.toEqual(dailyRounds(POOL, '2026-11-17').map((r) => r.answer.id));
  });

  it('share text', () => {
    const txt = shadyShare(12, [
      { objectId: 'a', stage: 0, correct: true, score: 100 },
      { objectId: 'b', stage: 2, correct: false, score: 0 },
    ]);
    expect(txt).toContain('Shady #12 — 100/500');
    expect(txt).toContain('🟩🟥');
  });
});
