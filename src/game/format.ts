const nf = new Map<number, Intl.NumberFormat>();
function fmt(n: number, maxFrac: number): string {
  let f = nf.get(maxFrac);
  if (!f) {
    f = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: maxFrac, useGrouping: true });
    nf.set(maxFrac, f);
  }
  return f.format(n);
}

function split(grams: number): [number, string] {
  const a = Math.abs(grams);
  if (a >= 1e6) return [grams / 1e6, 't'];
  if (a >= 1e3) return [grams / 1e3, 'kg'];
  return [grams, 'g'];
}

/**
 * Gewicht in Belgische notatie, afgerond op ±3 beduidende cijfers:
 * 1.500.000.000 → "1.500 t", 2200 → "2,2 kg", 8.5 → "8,5 g".
 */
export function formatGrams(grams: number): string {
  const [v, unit] = split(grams);
  const a = Math.abs(v);
  const frac = a < 10 ? 2 : a < 100 ? 1 : 0;
  return `${fmt(v, frac)} ${unit}`;
}

/** Exacte notatie voor het totaal op de schaal (tot op de gram waar het past). */
export function formatGramsExact(grams: number): string {
  const [v, unit] = split(grams);
  return `${fmt(v, 3)} ${unit}`;
}

/** Gewicht van een voorwerp, met "±" en "(schatting)" waar nodig. */
export function formatObjectWeight(grams: number, estimate?: boolean): string {
  return estimate ? `± ${formatGrams(grams)} (schatting)` : formatGrams(grams);
}

/** Label voor een gewichtje in de lade: "1 g", "10 kg", "1000 t". */
export function weightLabel(grams: number): string {
  const [v, unit] = split(grams);
  return `${v} ${unit}`;
}

/** "3×", "1,5×" */
export function formatFactor(f: number): string {
  return `${fmt(f, f < 10 ? 1 : 0)}×`;
}
