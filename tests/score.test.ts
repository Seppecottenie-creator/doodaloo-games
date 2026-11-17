import { describe, expect, it } from 'vitest';
import { roundScore, scoreSquare, tiltDegrees } from '../src/game/score';

describe('roundScore', () => {
  it('geeft 100 bij een perfecte gok', () => {
    expect(roundScore(2200, 2200, false)).toBe(100);
  });
  it('volgt de spec-voorbeelden', () => {
    expect(roundScore(1.1, 1, false)).toBe(95);
    expect(roundScore(2, 1, false)).toBe(61);
    expect(roundScore(0.5, 1, false)).toBe(61);
    expect(roundScore(5, 1, false)).toBe(9);
    expect(roundScore(10, 1, false)).toBe(0);
    expect(roundScore(1000, 1, false)).toBe(0);
  });
  it('is symmetrisch in log-ruimte', () => {
    expect(roundScore(300, 100, false)).toBe(roundScore(100, 300, false));
  });
  it('geeft 0 bij een lege schaal', () => {
    expect(roundScore(0, 100, false)).toBe(0);
  });
  it('geeft optioneel een bonus binnen 3%', () => {
    expect(roundScore(1.02, 1, true)).toBe(roundScore(1.02, 1, false) + 10);
    expect(roundScore(1.05, 1, true)).toBe(roundScore(1.05, 1, false));
  });
});

describe('tiltDegrees', () => {
  it('is 0 bij gelijk gewicht', () => {
    expect(tiltDegrees(5, 5)).toBe(0);
  });
  it('kantelt naar het voorwerp als je te licht zat', () => {
    expect(tiltDegrees(1, 10)).toBe(16);
  });
  it('wordt begrensd op ±22°', () => {
    expect(tiltDegrees(1, 1e6)).toBe(22);
    expect(tiltDegrees(1e6, 1)).toBe(-22);
  });
});

describe('scoreSquare', () => {
  it('kiest de juiste kleur', () => {
    expect(scoreSquare(100)).toBe('🟩');
    expect(scoreSquare(90)).toBe('🟩');
    expect(scoreSquare(89)).toBe('🟨');
    expect(scoreSquare(60)).toBe('🟨');
    expect(scoreSquare(30)).toBe('🟧');
    expect(scoreSquare(29)).toBe('🟥');
  });
});

import { roastLine, moodFor } from '../src/game/roast';
describe('roastLine', () => {
  it('vult de factor en gewichten in', () => {
    const line = roastLine({ objectId: 'x', guess: 1000, actual: 10, score: 0 }, () => 0);
    expect(line).toContain('100×');
    expect(line).not.toContain('{');
  });
  it('kiest een stemming per score', () => {
    expect(moodFor(100)).toBe('happy');
    expect(moodFor(0)).toBe('dead');
  });
});
