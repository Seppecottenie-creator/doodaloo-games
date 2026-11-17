import { describe, expect, it } from 'vitest';
import { formatFactor, formatGrams, formatGramsExact, formatObjectWeight, weightLabel } from '../src/game/format';

describe('formatGrams (en-GB)', () => {
  it('formatteert de spec-voorbeelden', () => {
    expect(formatGrams(1.5e9)).toBe('1,500 t');
    expect(formatGrams(2200)).toBe('2.2 kg');
    expect(formatGrams(8.5)).toBe('8.5 g');
  });
  it('kiest de juiste eenheid', () => {
    expect(formatGrams(999)).toBe('999 g');
    expect(formatGrams(1000)).toBe('1 kg');
    expect(formatGrams(7260)).toBe('7.26 kg');
    expect(formatGrams(13_700_000)).toBe('13.7 t');
    expect(formatGrams(10_100_000_000)).toBe('10,100 t');
  });
  it('toont exacte totalen', () => {
    expect(formatGramsExact(1001)).toBe('1.001 kg');
    expect(formatGramsExact(1_111_000)).toBe('1.111 t');
  });
  it('markeert schattingen', () => {
    expect(formatObjectWeight(8e6, true)).toBe('± 8 t (est.)');
  });
  it('labelt gewichtjes', () => {
    expect(weightLabel(1e9)).toBe('1000 t');
    expect(weightLabel(10)).toBe('10 g');
  });
  it('formatteert factoren', () => {
    expect(formatFactor(3)).toBe('3×');
    expect(formatFactor(1.5)).toBe('1.5×');
  });
});
