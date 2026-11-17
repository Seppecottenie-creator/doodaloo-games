/**
 * Shady: losse stukken zweven boven de vloer. Vanuit één zonnestand vallen hun schaduwen samen tot een figuur
 * (een kat, een dino…). Sleep de zon tot je de figuur ziet. Hoe dichter bij het voorbeeld, hoe meer punten.
 *
 * Hoe het werkt: de figuur is een masker van roostercellen op de vloer. We hakken het in stukken (Voronoi)
 * en tillen elk stuk op een eigen hoogte h langs de lichtstraal van de geheime zon. Een plat stuk op hoogte h
 * werpt met zon S zijn schaduw verschoven over h·(kT − kS), met k = (Lx, Lz) / Ly. Bij S = T valt alles op zijn plek.
 */
import { hashString, mulberry32 } from '../game/rng';

export type Vec3 = [number, number, number];

export interface Sun {
  az: number;
  el: number;
}

export interface Mask {
  w: number;
  h: number;
  /** w × h, rij per rij, 1 = figuur */
  cells: Uint8Array;
}

export interface Piece {
  /** roostercellen op de vloer waar dit stuk zijn schaduw hoort te werpen */
  cells: [number, number][];
  /** hoogte boven de vloer */
  h: number;
}

export interface Puzzle {
  name: string;
  emoji: string;
  mask: Mask;
  pieces: Piece[];
  target: Sun;
  start: Sun;
}

export interface Shape {
  emoji: string;
  name: string;
}

export const LEVELS = 5;
export const GROUND = 6;
export const RES = 96;
export const CELL = (GROUND * 2) / RES;
/** grootste afmeting van een figuur, in cellen */
export const MASK_SIZE = 32;
export const EL_MIN = (16 * Math.PI) / 180;
export const EL_MAX = (84 * Math.PI) / 180;
export const SLAB = 0.07;

export const SHAPES: Shape[] = [
  { emoji: '🐈', name: 'cat' },
  { emoji: '🦕', name: 'dinosaur' },
  { emoji: '🐘', name: 'elephant' },
  { emoji: '🐇', name: 'rabbit' },
  { emoji: '🦆', name: 'duck' },
  { emoji: '🦖', name: 'T. rex' },
  { emoji: '🐎', name: 'horse' },
  { emoji: '🐢', name: 'turtle' },
  { emoji: '🐓', name: 'rooster' },
  { emoji: '🚀', name: 'rocket' },
  { emoji: '🐕', name: 'dog' },
  { emoji: '🐿️', name: 'squirrel' },
  { emoji: '🐋', name: 'whale' },
  { emoji: '🦩', name: 'flamingo' },
  { emoji: '🐄', name: 'cow' },
  { emoji: '🦘', name: 'kangaroo' },
  { emoji: '🐊', name: 'crocodile' },
  { emoji: '⛵', name: 'sailboat' },
  { emoji: '✈️', name: 'aeroplane' },
  { emoji: '🎸', name: 'guitar' },
  { emoji: '🦞', name: 'lobster' },
];

/** Richting náár de zon. */
export function sunDir({ az, el }: Sun): Vec3 {
  return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
}

/** k = (Lx, Lz) / Ly: hoeveel een punt op hoogte 1 verschuift langs de lichtstraal. */
export function kOf(s: Sun): [number, number] {
  const [x, y, z] = sunDir(s);
  return [x / y, z / y];
}

export const cellX = (i: number) => -GROUND + (i + 0.5) * CELL;

export function clampEl(el: number) {
  return Math.min(EL_MAX, Math.max(EL_MIN, el));
}

/**
 * Hak het masker in n stukken en til ze op langs de straal van de geheime zon.
 * Geeft null als het niet netjes op de vloer past (dan probeert de aanroeper een andere zon).
 */
export function buildPieces(mask: Mask, n: number, target: Sun, rnd: () => number): Piece[] | null {
  const pts: [number, number][] = [];
  for (let r = 0; r < mask.h; r++) for (let c = 0; c < mask.w; c++) if (mask.cells[r * mask.w + c]) pts.push([c, r]);
  if (pts.length < n * 4) return null;

  // hoogtes: gelijkmatig verdeeld tussen 1,1 en 3,6, dan geschud
  const hs = Array.from({ length: n }, (_, i) => 1.1 + (2.5 * (i + 0.5)) / n + (rnd() - 0.5) * 0.12);
  for (let i = hs.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [hs[i], hs[j]] = [hs[j], hs[i]];
  }
  const hMean = hs.reduce((s, x) => s + x, 0) / n;
  const [kx, kz] = kOf(target);
  // leg de figuur zo dat figuur en zwevende stukken samen rond het midden liggen
  const ci = Math.round(RES / 2 - mask.w / 2 - (kx * hMean) / 2 / CELL);
  const cj = Math.round(RES / 2 - mask.h / 2 - (kz * hMean) / 2 / CELL);

  // Voronoi met zaden die ver uit elkaar liggen (farthest point), zodat de stukken ongeveer even groot zijn
  const seeds: [number, number][] = [pts[Math.floor(rnd() * pts.length)]];
  const dist = pts.map((p) => (p[0] - seeds[0][0]) ** 2 + (p[1] - seeds[0][1]) ** 2);
  while (seeds.length < n) {
    // een beetje toeval in de keuze, anders lijken alle puzzels op elkaar
    let best = 0;
    let bestD = -1;
    for (let i = 0; i < pts.length; i++) {
      const d = dist[i] * (0.75 + rnd() * 0.5);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    const s = pts[best];
    seeds.push(s);
    for (let i = 0; i < pts.length; i++) dist[i] = Math.min(dist[i], (pts[i][0] - s[0]) ** 2 + (pts[i][1] - s[1]) ** 2);
  }
  const pieces: Piece[] = hs.map((h) => ({ cells: [], h }));
  for (const [c, r] of pts) {
    let bi = 0;
    let bd = Infinity;
    seeds.forEach(([sc, sr], i) => {
      const d = (c - sc) ** 2 + (r - sr) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    pieces[bi].cells.push([ci + c, cj + r]);
  }

  // alles moet op de vloer: de figuur én de opgetilde stukken
  const lim = GROUND - 0.4;
  for (const p of pieces)
    for (const [i, j] of p.cells) {
      const x = cellX(i);
      const z = cellX(j);
      if (Math.hypot(x, z) > lim || Math.hypot(x + kx * p.h, z + kz * p.h) > lim) return null;
    }
  return pieces.filter((p) => p.cells.length);
}

/** De doelvorm als raster. */
export function targetRaster(pieces: Piece[]): Uint8Array {
  const out = new Uint8Array(RES * RES);
  for (const p of pieces) for (const [i, j] of p.cells) out[j * RES + i] = 1;
  return out;
}

/** Waar de schaduwen nu vallen, met de zon in stand `sun`. */
export function shadowRaster(pieces: Piece[], target: Sun, sun: Sun): Uint8Array {
  const out = new Uint8Array(RES * RES);
  const [tx, tz] = kOf(target);
  const [sx, sz] = kOf(sun);
  for (const p of pieces) {
    const h = p.h + SLAB / 2;
    const di = Math.round((h * (tx - sx)) / CELL);
    const dj = Math.round((h * (tz - sz)) / CELL);
    for (const [i, j] of p.cells) {
      const a = i + di;
      const b = j + dj;
      if (a >= 0 && a < RES && b >= 0 && b < RES) out[b * RES + a] = 1;
    }
  }
  return out;
}

export function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0,
    uni = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) inter++;
    if (a[i] || b[i]) uni++;
  }
  return uni ? inter / uni : 0;
}

/** Punten: 95% overlap of meer = 100, onder 20% = 0. */
export function matchScore(m: number): number {
  return Math.round(Math.min(1, Math.max(0, (m - 0.2) / 0.75)) * 100);
}

/** Stukken per ronde: steeds meer scherven. */
export const piecesFor = (idx: number) => [5, 7, 9, 11, 14][Math.min(4, idx)];

export interface LevelSeed {
  shape: Shape;
  seed: number;
}

/** Welke figuren vandaag, met een vaste seed per ronde (los van het toestel). */
export function dailySeeds(day: string): LevelSeed[] {
  const rnd = mulberry32(hashString(`shady4:${day}`));
  const pool = SHAPES.slice();
  const out: LevelSeed[] = [];
  for (let i = 0; i < LEVELS; i++) {
    const k = Math.floor(rnd() * pool.length);
    out.push({ shape: pool.splice(k, 1)[0], seed: Math.floor(rnd() * 2 ** 31) });
  }
  return out;
}

export function randomSeeds(): LevelSeed[] {
  return dailySeeds(`free:${Math.random()}`);
}

/** Puzzel opbouwen uit een masker (het masker komt uit de browser: een emoji op een canvas). */
export function makePuzzle(ls: LevelSeed, mask: Mask, idx: number): Puzzle {
  const rnd = mulberry32(ls.seed);
  for (let tries = 0; tries < 200; tries++) {
    // zon aan de achterkant (−z), zodat de scherven boven hun schaduw zweven en ze niet bedekken
    const target: Sun = { az: Math.PI * (1.15 + rnd() * 0.7), el: ((42 + rnd() * 20) * Math.PI) / 180 };
    const pieces = buildPieces(mask, piecesFor(idx), target, rnd);
    if (!pieces) continue;
    const start: Sun = { az: target.az + Math.PI * (0.55 + rnd() * 0.9), el: ((68 + rnd() * 10) * Math.PI) / 180 };
    return { name: ls.shape.name, emoji: ls.shape.emoji, mask, pieces, target, start };
  }
  throw new Error('no fit');
}

export function shadySquare(score: number): string {
  if (score >= 100) return '☀️';
  if (score >= 85) return '🟩';
  if (score >= 65) return '🟨';
  if (score >= 40) return '🟧';
  return '🟥';
}

export function shadyVerdict(total: number): string {
  if (total >= 480) return 'You don’t move the sun. The sun moves for you.';
  if (total >= 420) return 'Shadow puppeteer. Elite.';
  if (total >= 340) return 'Nicely shaded. The sun approves.';
  if (total >= 240) return 'Partly sunny. Partly abstract art.';
  return 'Overcast. Try sunglasses.';
}

export function roundLine(score: number): string {
  if (score >= 100) return 'PERFECT SHADOW';
  if (score >= 85) return 'There it is.';
  if (score >= 65) return 'Squint and it’s there.';
  if (score >= 40) return 'Modern art, at best.';
  return 'That’s a blob, mate.';
}

export function shadyShare(number: number | null, scores: number[], emojis: string[]): string {
  const total = scores.reduce((s, x) => s + x, 0);
  return [
    number === null ? `🕶 Shady (free play) — ${total}/500` : `🕶 Shady #${number} — ${total}/500`,
    scores.map(shadySquare).join(''),
    emojis.join(' '),
  ].join('\n');
}
