import { CONFIG } from './config';
import { hashString, mulberry32 } from './rng';
import type { GameObject } from './types';

const DAY_MS = 86_400_000;

/** Datum "YYYY-MM-DD" in de gegeven tijdzone (standaard Europe/Brussels). */
export function dayString(date: Date = new Date(), timeZone: string = CONFIG.timeZone): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function dayToUtc(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(day: string, n: number): string {
  return new Date(dayToUtc(day) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((dayToUtc(to) - dayToUtc(from)) / DAY_MS);
}

/** Spelnummer (#1 op de lanceerdag). */
export function puzzleNumber(day: string): number {
  return daysBetween(CONFIG.launchDate, day) + 1;
}

/** Milliseconden tot de volgende middernacht in Brussel. */
export function msUntilNextDay(now: Date = new Date(), timeZone: string = CONFIG.timeZone): number {
  const today = dayString(now, timeZone);
  // Zoek het eerste moment (per minuut, dan per seconde) waarop de datum wisselt. Robuust bij zomeruur.
  let lo = now.getTime();
  let hi = lo + 26 * 3600_000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayString(new Date(mid), timeZone) === today) lo = mid;
    else hi = mid;
  }
  return hi - now.getTime();
}

function pickRound(
  pool: GameObject[],
  round: number,
  chosen: Set<string>,
  ageOf: (id: string) => number,
  rnd: () => number,
  noRepeat: number,
  predicate: (o: GameObject) => boolean = () => true,
): GameObject | undefined {
  const free = pool.filter((o) => !chosen.has(o.id) && predicate(o));
  if (!free.length) return undefined;
  // Moeilijkheid volgt de ronde. Eerst exact, dan ±1, en pas daarna een recent gebruikt voorwerp.
  const near = (spread: number) => free.filter((o) => Math.abs(o.difficulty - round) <= spread);
  let eligible: GameObject[] = [];
  for (let spread = 0; spread <= 1 && !eligible.length; spread++) {
    eligible = near(spread).filter((o) => ageOf(o.id) >= noRepeat);
  }
  if (!eligible.length) {
    let bucket: GameObject[] = [];
    for (let spread = 1; spread <= 4 && !bucket.length; spread++) bucket = near(spread);
    // Pool te klein voor de volledige regel: kies uit het langst-niet-gebruikte kwart.
    const sorted = bucket.slice().sort((a, b) => ageOf(b.id) - ageOf(a.id) || (a.id < b.id ? -1 : 1));
    eligible = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 4)));
  }
  return eligible[Math.floor(rnd() * eligible.length)];
}

/**
 * Kies 5 voorwerpen met oplopende moeilijkheid (ronde 1 → 5) en minstens één verzonnen personage.
 */
export function pickFive(
  pool: GameObject[],
  rnd: () => number,
  ageOf: (id: string) => number = () => Infinity,
  noRepeat: number = CONFIG.noRepeatDays,
  rounds: number = CONFIG.rounds,
): GameObject[] {
  const chosen = new Set<string>();
  const out: GameObject[] = [];
  // Het personage krijgt een vaste, "willekeurige" ronde (2, 3 of 4).
  const fictionalRound = 2 + Math.floor(rnd() * 3);
  const hasFictional = pool.some((o) => o.fictional);
  for (let r = 1; r <= rounds; r++) {
    const wantFictional = hasFictional && r === Math.min(fictionalRound, rounds);
    const pick =
      pickRound(pool, r, chosen, ageOf, rnd, noRepeat, (o) => o.fictional === wantFictional) ??
      pickRound(pool, r, chosen, ageOf, rnd, noRepeat);
    if (!pick) break;
    chosen.add(pick.id);
    out.push(pick);
  }
  return out;
}

const cache = new Map<string, { picks: Map<string, GameObject[]> }>();

function poolKey(pool: GameObject[]): string {
  return pool.map((o) => o.id).sort().join('|');
}

/**
 * Deterministische dagselectie. Dezelfde datum + dezelfde pool geeft altijd dezelfde 5 voorwerpen.
 * Simuleert alle dagen sinds de lancering zodat een voorwerp niet binnen `noRepeatDays` terugkomt
 * (zolang de pool groot genoeg is: 5 × 60 = 300 voorwerpen).
 */
export function dailySelection(pool: GameObject[], day: string): GameObject[] {
  const sorted = pool.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const key = poolKey(sorted);
  let entry = cache.get(key);
  if (!entry) {
    entry = { picks: new Map() };
    cache.set(key, entry);
  }
  const hit = entry.picks.get(day);
  if (hit) return hit;

  const start = CONFIG.launchDate;
  if (daysBetween(start, day) < 0) {
    return pickFive(sorted, mulberry32(hashString(`weegschaal:${day}`)));
  }
  // Simuleer vanaf de lancering (resultaten worden gecachet).
  const history = new Map<string, number>(); // id → dagindex laatste gebruik
  const total = daysBetween(start, day);
  let result: GameObject[] = [];
  for (let i = 0; i <= total; i++) {
    const d = addDays(start, i);
    const rnd = mulberry32(hashString(`weegschaal:${d}`));
    const ageOf = (id: string) => {
      const last = history.get(id);
      return last === undefined ? Infinity : i - last;
    };
    const picks = entry.picks.get(d) ?? pickFive(sorted, rnd, ageOf);
    entry.picks.set(d, picks);
    for (const o of picks) history.set(o.id, i);
    result = picks;
  }
  return result;
}

/** Vrij spel: willekeurig, maar met oplopende moeilijkheid en zonder recent gespeelde voorwerpen. */
export function practiceSelection(pool: GameObject[], recent: string[] = [], rnd: () => number = Math.random): GameObject[] {
  const recentSet = new Set(recent);
  return pickFive(pool, rnd, (id) => (recentSet.has(id) ? 0 : Infinity), 1);
}
