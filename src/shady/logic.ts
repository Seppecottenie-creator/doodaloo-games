/**
 * Shady: draai de zon tot de schaduw van het beeld in de vorm op de grond valt.
 * Elke dag 5 beelden. De score per beeld is hoeveel de schaduw overlapt met de doelvorm (IoU, 0–100).
 *
 * Alles is analytisch: elk deel van het beeld is convex, dus zijn schaduw op de grond (y = 0)
 * is de convexe omhulling van zijn geprojecteerde punten. De schaduw van het hele beeld is de unie daarvan.
 */
import { hashString, mulberry32 } from '../game/rng';

export type Vec3 = [number, number, number];
export type Pt = [number, number]; // (x, z) op de grond

export interface Part {
  kind: 'box' | 'sphere' | 'cyl';
  c: Vec3;
  /** box: halve maten; sphere: [r]; cyl: [r, halve hoogte] */
  s: number[];
}

export interface Sun {
  /** azimut in radialen */
  az: number;
  /** hoogte boven de horizon in radialen */
  el: number;
}

export interface Level {
  parts: Part[];
  target: Sun;
  start: Sun;
}

export const LEVELS = 5;
export const GROUND = 6; // grond loopt van −GROUND tot +GROUND
export const EL_MIN = (18 * Math.PI) / 180;
export const EL_MAX = (82 * Math.PI) / 180;

/** Richting náár de zon. */
export function sunDir({ az, el }: Sun): Vec3 {
  return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
}

function partPoints(p: Part): Vec3[] {
  const [cx, cy, cz] = p.c;
  const pts: Vec3[] = [];
  if (p.kind === 'box') {
    const [a, b, c] = p.s;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push([cx + sx * a, cy + sy * b, cz + sz * c]);
  } else if (p.kind === 'sphere') {
    const r = p.s[0];
    for (let i = 0; i <= 6; i++) {
      const phi = (i / 6) * Math.PI;
      for (let j = 0; j < 16; j++) {
        const th = (j / 16) * Math.PI * 2;
        pts.push([cx + r * Math.sin(phi) * Math.cos(th), cy + r * Math.cos(phi), cz + r * Math.sin(phi) * Math.sin(th)]);
      }
    }
  } else {
    const [r, hh] = p.s;
    for (const sy of [-1, 1])
      for (let j = 0; j < 16; j++) {
        const th = (j / 16) * Math.PI * 2;
        pts.push([cx + r * Math.cos(th), cy + sy * hh, cz + r * Math.sin(th)]);
      }
  }
  return pts;
}

/** Convexe omhulling (monotone chain), tegen de klok in. */
export function hull(points: Pt[]): Pt[] {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Schaduw van elk deel als convexe veelhoek op de grond. */
export function shadowPolys(parts: Part[], sun: Sun): Pt[][] {
  const [lx, ly, lz] = sunDir(sun);
  return parts.map((p) =>
    hull(
      partPoints(p).map(([x, y, z]) => {
        const t = y / ly;
        return [x - lx * t, z - lz * t] as Pt;
      }),
    ),
  );
}

function inside(poly: Pt[], x: number, z: number): boolean {
  // convex, tegen de klok in: punt moet links van elke rand liggen
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false;
  }
  return poly.length >= 3;
}

export const RES = 96;

/** Raster van de schaduw op de grond. */
export function rasterize(polys: Pt[][], res = RES): Uint8Array {
  const out = new Uint8Array(res * res);
  const cell = (GROUND * 2) / res;
  for (const poly of polys) {
    if (poly.length < 3) continue;
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (const [x, z] of poly) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    const i0 = Math.max(0, Math.floor((x0 + GROUND) / cell));
    const i1 = Math.min(res - 1, Math.floor((x1 + GROUND) / cell));
    const j0 = Math.max(0, Math.floor((z0 + GROUND) / cell));
    const j1 = Math.min(res - 1, Math.floor((z1 + GROUND) / cell));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = j * res + i;
        if (out[k]) continue;
        if (inside(poly, -GROUND + (i + 0.5) * cell, -GROUND + (j + 0.5) * cell)) out[k] = 1;
      }
  }
  return out;
}

/** Overlap: doorsnede / unie. */
export function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0,
    uni = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) inter++;
    if (a[i] || b[i]) uni++;
  }
  return uni ? inter / uni : 0;
}

/** Score per beeld. Boven 97% telt als perfect. */
export function matchScore(m: number): number {
  return m >= 0.97 ? 100 : Math.round(m * 100);
}

// ---------------- beelden ----------------
const key = (c: number[]) => c.join(',');
const NB: Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function growCubes(rnd: () => number, n: number): Vec3[] {
  const cubes: Vec3[] = [[0, 0, 0]];
  const set = new Set([key(cubes[0])]);
  while (cubes.length < n) {
    const base = cubes[Math.floor(rnd() * cubes.length)];
    const d = NB[Math.floor(rnd() * NB.length)];
    const c: Vec3 = [base[0] + d[0], base[1] + d[1], base[2] + d[2]];
    // niet onder de vloer van het beeld
    if (c[1] < 0 || set.has(key(c))) continue;
    set.add(key(c));
    cubes.push(c);
  }
  return cubes;
}

/** Een beeld op een paal: blokjes, soms met een bol. Hoe verder in de reeks, hoe grilliger. */
export function makeSculpture(rnd: () => number, idx: number): Part[] {
  const n = [3, 4, 5, 6, 7][Math.min(4, idx)];
  const u = 0.62;
  const H = 1.5 + rnd() * 0.6;
  const cubes = growCubes(rnd, n);
  const cx = cubes.reduce((s, c) => s + c[0], 0) / n;
  const cz = cubes.reduce((s, c) => s + c[2], 0) / n;
  const parts: Part[] = cubes.map((c) => ({
    kind: 'box',
    c: [(c[0] - cx) * u, H + (c[1] + 0.5) * u, (c[2] - cz) * u],
    s: [u / 2, u / 2, u / 2],
  }));
  // paal onder een blokje van de onderste laag
  const bottom = parts.filter((p) => Math.abs(p.c[1] - (H + u / 2)) < 1e-6);
  const b = bottom[Math.floor(rnd() * bottom.length)];
  parts.push({ kind: 'cyl', c: [b.c[0], H / 2, b.c[2]], s: [0.07, H / 2] });
  // af en toe een bol op het hoogste blokje
  if (idx >= 2 && rnd() < 0.6) {
    const top = parts.filter((p) => p.kind === 'box').sort((a, c) => c.c[1] - a.c[1])[0];
    parts.push({ kind: 'sphere', c: [top.c[0], top.c[1] + u / 2 + 0.3, top.c[2]], s: [0.3] });
  }
  return parts;
}

export function makeLevel(rnd: () => number, idx: number): Level {
  for (;;) {
    const parts = makeSculpture(rnd, idx);
    const target: Sun = { az: rnd() * Math.PI * 2, el: ((28 + rnd() * 34) * Math.PI) / 180 };
    const polys = shadowPolys(parts, target);
    // schaduw moet ruim op de grond passen
    const r = Math.max(...polys.flat().map(([x, z]) => Math.hypot(x, z)));
    if (r > GROUND * 0.9) continue;
    const start: Sun = { az: target.az + Math.PI + (rnd() - 0.5) * 1.6, el: ((70 + rnd() * 10) * Math.PI) / 180 };
    // de beginstand mag geen toevallige goede match zijn
    if (iou(rasterize(polys), rasterize(shadowPolys(parts, start))) > 0.35) continue;
    return { parts, target, start };
  }
}

export function buildLevels(rnd: () => number): Level[] {
  return Array.from({ length: LEVELS }, (_, i) => makeLevel(rnd, i));
}

export const dailyLevels = (day: string) => buildLevels(mulberry32(hashString(`shady3:${day}`)));

export function clampEl(el: number) {
  return Math.min(EL_MAX, Math.max(EL_MIN, el));
}

export function shadySquare(score: number): string {
  if (score >= 100) return '☀️';
  if (score >= 90) return '🟩';
  if (score >= 75) return '🟨';
  if (score >= 50) return '🟧';
  return '🟥';
}

export function shadyVerdict(total: number): string {
  if (total >= 480) return 'You don’t move the sun. The sun moves for you.';
  if (total >= 430) return 'Sundial-grade precision. Smug is allowed.';
  if (total >= 360) return 'Nicely shaded. The sun approves.';
  if (total >= 260) return 'Partly sunny. Partly not.';
  return 'Overcast. Try sunglasses.';
}

export function roundLine(score: number): string {
  if (score >= 100) return 'PERFECT ECLIPSE';
  if (score >= 90) return 'Basically perfect';
  if (score >= 75) return 'Close. The sun is mildly impressed.';
  if (score >= 50) return 'Half in the shade.';
  return 'Wrong side of the sky.';
}

export function shadyShare(number: number | null, scores: number[]): string {
  const total = scores.reduce((s, x) => s + x, 0);
  return [number === null ? `🕶 Shady (free play) — ${total}/500` : `🕶 Shady #${number} — ${total}/500`, scores.map(shadySquare).join('')].join('\n');
}
