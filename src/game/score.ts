import { CONFIG } from './config';

/** Score 0–100 voor één ronde. */
export function roundScore(guess: number, actual: number, bonus: boolean = CONFIG.bonusEnabled): number {
  if (!(guess > 0) || !(actual > 0)) return 0;
  const off = Math.abs(Math.log10(guess / actual));
  let s = Math.max(0, Math.round(100 * (1 - off * 1.3)));
  if (bonus && Math.abs(guess / actual - 1) <= CONFIG.bonusTolerance) s += CONFIG.bonusPoints;
  return s;
}

/** Kantelhoek in graden. Positief = de kant van het voorwerp (links) zakt. */
export function tiltDegrees(guess: number, actual: number): number {
  if (!(guess > 0)) return 22;
  const t = Math.log10(actual / guess) * 16;
  return Math.max(-22, Math.min(22, t));
}

export function scoreSquare(score: number): string {
  if (score >= 90) return '🟩';
  if (score >= 60) return '🟨';
  if (score >= 30) return '🟧';
  return '🟥';
}

export function maxTotal(rounds: number = CONFIG.rounds): number {
  return rounds * (100 + (CONFIG.bonusEnabled ? CONFIG.bonusPoints : 0));
}
