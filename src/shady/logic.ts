/**
 * Shady: één van vier schaduwen is echt.
 * Een zwevend blokbeeld (polycube) draait rond. Kies de enige schaduw die het kan werpen, vanuit om het even welke kant.
 * De lokvogels zijn schaduwen van bijna-identieke beelden (één blokje verplaatst). Alles is gegenereerd: eindeloos, nooit hetzelfde.
 */
import { hashString, mulberry32 } from '../game/rng';

export type Cube = [number, number, number];
export type Cell = [number, number];

export interface Puzzle {
  cubes: Cube[];
  /** grootte van het rooster (3 of 4) */
  size: number;
  /** vier schaduwen, elk een lijst roostercellen */
  options: Cell[][];
  answer: number;
  /** as waarlangs de echte schaduw valt (0 = x, 1 = y, 2 = z) */
  axis: number;
}

export interface Level {
  cubes: number;
  size: number;
}

/** Moeilijkheid stijgt met het aantal juiste antwoorden in deze run. */
export function levelFor(solved: number): Level {
  if (solved < 3) return { cubes: 4, size: 3 };
  if (solved < 7) return { cubes: 5, size: 3 };
  if (solved < 12) return { cubes: 6, size: 3 };
  if (solved < 18) return { cubes: 7, size: 4 };
  if (solved < 26) return { cubes: 8, size: 4 };
  return { cubes: 10, size: 4 };
}

// ---------------- tijd ----------------
export const START_TIME = 40;
export const MAX_TIME = 60;
export const WRONG_PENALTY = 7;
/** Bonus per juist antwoord: royaal in het begin, krapper naarmate je verder komt. */
export function timeBonus(solved: number): number {
  return Math.max(2.5, 5 - solved * 0.1);
}

// ---------------- geometrie ----------------
const key = (c: number[]) => c.join(',');
const NB: Cube[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export function connected(cubes: Cube[]): boolean {
  if (cubes.length <= 1) return true;
  const set = new Set(cubes.map(key));
  const seen = new Set([key(cubes[0])]);
  const stack = [cubes[0]];
  while (stack.length) {
    const [x, y, z] = stack.pop()!;
    for (const [dx, dy, dz] of NB) {
      const k = key([x + dx, y + dy, z + dz]);
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push([x + dx, y + dy, z + dz]);
      }
    }
  }
  return seen.size === cubes.length;
}

const inside = (c: Cube, size: number) => c.every((v) => v >= 0 && v < size);

function freeNeighbours(cubes: Cube[], size: number): Cube[] {
  const set = new Set(cubes.map(key));
  const out = new Map<string, Cube>();
  for (const [x, y, z] of cubes)
    for (const [dx, dy, dz] of NB) {
      const c: Cube = [x + dx, y + dy, z + dz];
      if (inside(c, size) && !set.has(key(c))) out.set(key(c), c);
    }
  return [...out.values()];
}

/** Groei een verbonden beeld van n blokjes. */
export function grow(rnd: () => number, n: number, size: number): Cube[] {
  const m = Math.floor(size / 2);
  const cubes: Cube[] = [[m, m, m]];
  while (cubes.length < n) {
    const free = freeNeighbours(cubes, size);
    cubes.push(free[Math.floor(rnd() * free.length)]);
  }
  return cubes;
}

/** Schaduw langs een as: de cellen die het beeld op de muur bedekt. */
export function project(cubes: Cube[], axis: number): Cell[] {
  const m = new Map<string, Cell>();
  for (const [x, y, z] of cubes) {
    const c: Cell = axis === 0 ? [z, y] : axis === 1 ? [x, z] : [x, y];
    m.set(key(c), c);
  }
  return [...m.values()];
}

const DIHEDRAL: ((c: Cell) => Cell)[] = [
  ([u, v]) => [u, v],
  ([u, v]) => [-v, u],
  ([u, v]) => [-u, -v],
  ([u, v]) => [v, -u],
  ([u, v]) => [-u, v],
  ([u, v]) => [u, -v],
  ([u, v]) => [v, u],
  ([u, v]) => [-v, -u],
];

export function normalize(cells: Cell[]): Cell[] {
  const mu = Math.min(...cells.map((c) => c[0]));
  const mv = Math.min(...cells.map((c) => c[1]));
  return cells.map(([u, v]) => [u - mu, v - mv] as Cell).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** Dezelfde schaduw, gedraaid of gespiegeld, geeft dezelfde sleutel. */
export function canon(cells: Cell[]): string {
  return DIHEDRAL.map((t) => normalize(cells.map(t)).map(key).join(';')).sort()[0];
}

export function transform(cells: Cell[], t: number): Cell[] {
  return normalize(cells.map(DIHEDRAL[t % 8]));
}

/** Verplaats één blokje: het beeld blijft verbonden maar de schaduw verandert subtiel. */
export function mutate(cubes: Cube[], size: number, rnd: () => number): Cube[] | null {
  for (let tries = 0; tries < 30; tries++) {
    const i = Math.floor(rnd() * cubes.length);
    const rest = cubes.filter((_, j) => j !== i);
    if (!connected(rest)) continue;
    const free = freeNeighbours(rest, size).filter((c) => key(c) !== key(cubes[i]));
    if (!free.length) continue;
    return [...rest, free[Math.floor(rnd() * free.length)]];
  }
  return null;
}

export function makePuzzle(rnd: () => number, level: Level): Puzzle {
  for (;;) {
    const cubes = grow(rnd, level.cubes, level.size);
    const truth = new Set([0, 1, 2].map((a) => canon(project(cubes, a))));
    const axis = Math.floor(rnd() * 3);
    const real = project(cubes, axis);
    if (real.length < 3) continue;
    const decoys: Cell[][] = [];
    const used = new Set(truth);
    for (let tries = 0; tries < 200 && decoys.length < 3; tries++) {
      const m = mutate(cubes, level.size, rnd);
      if (!m) continue;
      // liefst dezelfde as als het echte antwoord: zo lijken ze het meest op elkaar
      const axes = [axis, (axis + 1) % 3, (axis + 2) % 3];
      for (const a of axes) {
        const p = project(m, a);
        const c = canon(p);
        if (used.has(c)) continue;
        // even groot als het echte antwoord, of hooguit één cel verschil
        if (Math.abs(p.length - real.length) > 1) continue;
        used.add(c);
        decoys.push(p);
        break;
      }
    }
    if (decoys.length < 3) continue;
    const answer = Math.floor(rnd() * 4);
    const pool = decoys.slice();
    const options: Cell[][] = [];
    for (let i = 0; i < 4; i++) options.push(transform(i === answer ? real : pool.pop()!, Math.floor(rnd() * 8)));
    return { cubes, size: level.size, options, answer, axis };
  }
}

/** Een run: puzzels volgen elkaar op met één generator, dus de dagrun is voor iedereen dezelfde reeks. */
export class Run {
  private rnd: () => number;
  solved = 0;
  wrong = 0;
  streak = 0;
  bestStreak = 0;
  time = START_TIME;
  current: Puzzle;

  constructor(seed: string | number) {
    this.rnd = mulberry32(typeof seed === 'number' ? seed : hashString(seed));
    this.current = makePuzzle(this.rnd, levelFor(0));
  }

  /** Antwoord; geeft terug of het juist was. Daarna staat de volgende puzzel klaar. */
  answer(i: number): boolean {
    const ok = i === this.current.answer;
    if (ok) {
      this.time = Math.min(MAX_TIME, this.time + timeBonus(this.solved));
      this.solved++;
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
    } else {
      this.time = Math.max(0, this.time - WRONG_PENALTY);
      this.wrong++;
      this.streak = 0;
    }
    this.current = makePuzzle(this.rnd, levelFor(this.solved));
    return ok;
  }

  tick(dt: number) {
    this.time = Math.max(0, this.time - dt);
  }

  get over() {
    return this.time <= 0;
  }
}

export const dailySeed = (day: string) => `shady2:${day}`;

export function shadyVerdict(solved: number): string {
  if (solved >= 30) return 'You see in four dimensions. Seek help.';
  if (solved >= 20) return 'Spatial genius. Mildly terrifying.';
  if (solved >= 12) return 'Sharp. The lamp respects you.';
  if (solved >= 6) return 'Decent. Your brain did a little spin.';
  if (solved >= 2) return 'Your mental rotation needs oil.';
  return 'The lamp died of boredom.';
}

export function shadyShare(number: number | null, solved: number, bestStreak: number): string {
  const bulbs = '💡'.repeat(Math.min(10, Math.ceil(solved / 3))) || '🌑';
  return [number === null ? `🕶 Shady (endless) — ${solved} shadows` : `🕶 Shady #${number} — ${solved} shadows`, `${bulbs}  best streak ${bestStreak}`].join('\n');
}
