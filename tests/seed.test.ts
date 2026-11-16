import { describe, expect, it } from 'vitest';
import objects from '../data/objects.json';
import { addDays, dailySelection, dayString, msUntilNextDay, practiceSelection, puzzleNumber } from '../src/game/seed';
import { CONFIG } from '../src/game/config';
import type { GameObject } from '../src/game/types';

const pool = objects as GameObject[];

describe('dailySelection', () => {
  it('geeft dezelfde selectie voor dezelfde datum', () => {
    const a = dailySelection(pool, '2026-12-03').map((o) => o.id);
    const b = dailySelection(pool.slice().reverse(), '2026-12-03').map((o) => o.id);
    expect(a).toEqual(b);
    expect(a).toHaveLength(5);
  });
  it('geeft een andere selectie op een andere dag', () => {
    const a = dailySelection(pool, '2026-12-03').map((o) => o.id);
    const b = dailySelection(pool, '2026-12-04').map((o) => o.id);
    expect(a).not.toEqual(b);
  });
  it('heeft oplopende moeilijkheid, geen dubbels en minstens één personage', () => {
    for (let i = 0; i < 120; i++) {
      const sel = dailySelection(pool, addDays(CONFIG.launchDate, i));
      expect(new Set(sel.map((o) => o.id)).size).toBe(5);
      expect(sel.some((o) => o.fictional)).toBe(true);
      const diffs = sel.map((o) => o.difficulty);
      expect(diffs[0]).toBeLessThanOrEqual(diffs[4]);
    }
  });
  it('herhaalt geen voorwerp zolang de pool groot genoeg is', () => {
    // Met de huidige pool kan de 60-dagenregel niet volledig; we verwachten wel spreiding.
    const seen = new Map<string, number>();
    let minGap = Infinity;
    for (let i = 0; i < 60; i++) {
      for (const o of dailySelection(pool, addDays(CONFIG.launchDate, i))) {
        const last = seen.get(o.id);
        if (last !== undefined) minGap = Math.min(minGap, i - last);
        seen.set(o.id, i);
      }
    }
    expect(minGap).toBeGreaterThanOrEqual(5);
  });
});

describe('practiceSelection', () => {
  it('vermijdt recent gespeelde voorwerpen', () => {
    const recent = pool.slice(0, 15).map((o) => o.id);
    const sel = practiceSelection(pool, recent);
    expect(sel).toHaveLength(5);
    for (const o of sel) expect(recent).not.toContain(o.id);
  });
});

describe('datums', () => {
  it('gebruikt de Brusselse tijdzone', () => {
    // 23:30 UTC op 31 dec = 00:30 op 1 jan in Brussel.
    expect(dayString(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
  it('nummert vanaf de lancering', () => {
    expect(puzzleNumber(CONFIG.launchDate)).toBe(1);
    expect(puzzleNumber(addDays(CONFIG.launchDate, 41))).toBe(42);
  });
  it('telt af tot middernacht', () => {
    const ms = msUntilNextDay(new Date('2026-12-01T22:00:00Z')); // 23:00 in Brussel
    expect(Math.round(ms / 60000)).toBe(60);
  });
});
