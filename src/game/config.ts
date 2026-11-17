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

/** Hoe een gewicht eruitziet (3D-model en icoon). */
export type WeightStyle =
  | 'brass' // messing knopgewicht
  | 'bell' // gietijzeren klokgewicht
  | 'kettle' // kettlebell
  | 'block' // gietijzeren blok met hengsel
  | 'plate' // halterschijf
  | 'ring' // blok met ring
  | 'anvil' // aambeeld
  | 'concrete' // betonblok met hijsoog
  | 'safe' // brandkast
  | 'steel' // stalen blok met waarschuwingsstrepen
  | 'container' // zeecontainer
  | 'mega'; // grote container aan kraanhaak

export interface WeightSpec {
  grams: number;
  style: WeightStyle;
  /** basisafmeting (breedte, hoogte) in "px" bij een schaal van 150 px breed */
  size: [number, number];
  /** zwaarte voor geluid en schokken, 0–1 */
  heft: number;
}

export const WEIGHT_SPECS: readonly WeightSpec[] = [
  { grams: 1, style: 'brass', size: [11, 15], heft: 0 },
  { grams: 10, style: 'brass', size: [15, 20], heft: 0.08 },
  { grams: 100, style: 'brass', size: [21, 27], heft: 0.16 },
  { grams: 1e3, style: 'bell', size: [30, 27], heft: 0.26 },
  { grams: 5e3, style: 'kettle', size: [32, 34], heft: 0.33 },
  { grams: 1e4, style: 'block', size: [40, 30], heft: 0.4 },
  { grams: 5e4, style: 'plate', size: [52, 15], heft: 0.48 },
  { grams: 1e5, style: 'ring', size: [52, 34], heft: 0.55 },
  { grams: 5e5, style: 'anvil', size: [60, 34], heft: 0.63 },
  { grams: 1e6, style: 'concrete', size: [62, 38], heft: 0.7 },
  { grams: 5e6, style: 'safe', size: [56, 50], heft: 0.78 },
  { grams: 1e7, style: 'steel', size: [78, 38], heft: 0.85 },
  { grams: 1e8, style: 'container', size: [104, 40], heft: 0.93 },
  { grams: 1e9, style: 'mega', size: [130, 50], heft: 1 },
];

/** Gewichtenset in gram (1 g … 1000 t, met tussenstappen van 5 kg, 50 kg, 500 kg en 5 t). */
export const WEIGHTS: readonly number[] = WEIGHT_SPECS.map((w) => w.grams);

/** Hoeveel exemplaren van één gewicht maximaal op de schaal mogen. Het zwaarste mag vaker (tot 20.000 t). */
export function maxCount(w: number): number {
  if (w === 1e9) return 20;
  return String(w)[0] === '5' ? 4 : 9;
}
