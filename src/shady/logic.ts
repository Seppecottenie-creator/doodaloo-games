/**
 * Shady: raad het voorwerp aan zijn schaduw.
 * Elke ronde: een silhouet dat in drie stappen "meer licht" krijgt. Hoe vroeger juist, hoe meer punten.
 */
import { hashString, mulberry32 } from '../game/rng';
import type { GameObject } from '../game/types';

export const SHADY_ROUNDS = 5;
export const SHADY_OPTIONS = 4;
/** Punten voor een juist antwoord bij hint-stap 0, 1, 2. Fout = 0. */
export const STAGE_POINTS = [100, 60, 30] as const;
export const SHADY_MAX = SHADY_ROUNDS * STAGE_POINTS[0];

export interface ShadyRound {
  answer: GameObject;
  options: GameObject[];
  /** Waar de eerste, ingezoomde uitsnede op mikt (0..1). */
  focus: { x: number; y: number };
  /** Draaiing van de eerste schaduw in graden. */
  tilt: number;
}

export interface ShadyResult {
  objectId: string;
  /** hint-stap waarop geantwoord werd (0..2) */
  stage: number;
  correct: boolean;
  score: number;
}

export function shadyScore(stage: number, correct: boolean): number {
  if (!correct) return 0;
  return STAGE_POINTS[Math.max(0, Math.min(STAGE_POINTS.length - 1, stage))];
}

/** Alleen voorwerpen met een uitgeknipte foto geven een schaduw. */
export function shadowPool(pool: GameObject[]): GameObject[] {
  return pool.filter((o) => !!o.image).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Vijf rondes met verschillende categorieën (zo komen er geen vijf ballen na elkaar),
 * en lokvogels uit andere categorieën dan het antwoord (twee ronde ballen als keuze is oneerlijk).
 */
export function buildRounds(pool: GameObject[], rnd: () => number, avoid: Set<string> = new Set()): ShadyRound[] {
  const src = shadowPool(pool);
  const order = shuffle(src, rnd).sort((a, b) => Number(avoid.has(a.id)) - Number(avoid.has(b.id)));
  const picked: GameObject[] = [];
  const cats = new Set<string>();
  for (const o of order) {
    if (picked.length >= SHADY_ROUNDS) break;
    const c = o.category ?? o.id;
    if (cats.has(c)) continue;
    cats.add(c);
    picked.push(o);
  }
  // te weinig categorieën: vul aan met wat overblijft
  for (const o of order) {
    if (picked.length >= SHADY_ROUNDS) break;
    if (!picked.includes(o)) picked.push(o);
  }
  return picked.map((answer) => {
    const decoyPool = shuffle(
      src.filter((o) => o.id !== answer.id && (o.category ?? '') !== (answer.category ?? '-')),
      rnd,
    );
    const decoys: GameObject[] = [];
    const used = new Set<string>();
    for (const d of decoyPool) {
      if (decoys.length >= SHADY_OPTIONS - 1) break;
      const c = d.category ?? d.id;
      if (used.has(c)) continue; // lokvogels ook onderling verschillend
      used.add(c);
      decoys.push(d);
    }
    for (const d of decoyPool) if (decoys.length < SHADY_OPTIONS - 1 && !decoys.includes(d)) decoys.push(d);
    return {
      answer,
      options: shuffle([answer, ...decoys], rnd),
      focus: { x: 0.3 + rnd() * 0.4, y: 0.3 + rnd() * 0.4 },
      tilt: (rnd() < 0.5 ? -1 : 1) * (20 + rnd() * 50),
    };
  });
}

export function dailyRounds(pool: GameObject[], day: string): ShadyRound[] {
  return buildRounds(pool, mulberry32(hashString(`shady:${day}`)));
}

export function shadySquare(r: ShadyResult): string {
  if (!r.correct) return '🟥';
  return r.stage === 0 ? '🟩' : r.stage === 1 ? '🟨' : '🟧';
}

export function shadyVerdict(total: number): string {
  if (total >= 450) return 'You see in the dark. Unsettling.';
  if (total >= 340) return 'Sharp eyes. Slightly creepy.';
  if (total >= 220) return 'You squinted. It mostly worked.';
  if (total >= 100) return 'Lights on next time, maybe.';
  return 'You’d lose a staring contest with a lamp.';
}

const RIGHT = [
  ['In the dark? Show-off.', 'Called it from a blob. Respect.', 'Bat vision unlocked.'],
  ['Needed a bit of light. Fine.', 'Got there. Eventually.', 'Solid squint.'],
  ['Took the floodlights, but sure.', 'You needed the full shape. Noted.', 'Barely. But it counts.'],
];
const WRONG = [
  'That’s not even the same shape, mate.',
  'Confidently, spectacularly wrong.',
  'The shadow is embarrassed for you.',
  'Wrong. The lights were ON.',
  'Did you guess with your elbow?',
];

export function shadyLine(r: ShadyResult, rnd: () => number = Math.random): string {
  const list = r.correct ? RIGHT[Math.min(2, r.stage)] : WRONG;
  return list[Math.floor(rnd() * list.length)];
}

export function shadyShare(number: number | null, results: ShadyResult[]): string {
  const total = results.reduce((s, r) => s + r.score, 0);
  return [
    number === null ? `🕶 Shady (free play) — ${total}/${SHADY_MAX}` : `🕶 Shady #${number} — ${total}/${SHADY_MAX}`,
    results.map(shadySquare).join(''),
  ].join('\n');
}
