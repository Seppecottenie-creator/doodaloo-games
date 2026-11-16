export const CONFIG = {
  rounds: 5,
  /** +10 punten binnen 3%. Standaard uit zodat het maximum 500 blijft. */
  bonusEnabled: false,
  bonusPoints: 10,
  bonusTolerance: 0.03,
  /** Dag #1 van het dagelijkse spel (Europe/Brussels). */
  launchDate: '2026-11-16',
  timeZone: 'Europe/Brussels',
  noRepeatDays: 60,
  shareUrl: 'weegschaal.example.com',
} as const;

/** Decadische gewichtenset, in gram. */
export const WEIGHTS = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9] as const;
export type WeightValue = (typeof WEIGHTS)[number];

/** Hoeveel exemplaren van één gewicht maximaal op de schaal mogen. Het zwaarste mag vaker (tot 20.000 t). */
export function maxCount(w: number): number {
  return w === 1e9 ? 20 : 9;
}
