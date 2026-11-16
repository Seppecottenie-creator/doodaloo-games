import type { RoundResult } from './types';

const KEY = 'weegschaal:v1';

export interface Settings {
  sound: boolean;
  haptics: boolean;
}

export interface DailyRecord {
  day: string;
  rounds: RoundResult[];
  done: boolean;
}

export interface Store {
  settings: Settings;
  seenIntro: boolean;
  practice: { played: number; best: number; recent: string[] };
  daily: Record<string, DailyRecord>;
}

const defaults = (): Store => ({
  settings: { sound: true, haptics: true },
  seenIntro: false,
  practice: { played: 0, best: 0, recent: [] },
  daily: {},
});

let cache: Store | null = null;

export function load(): Store {
  if (cache) return cache;
  let s = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Store>;
      s = { ...s, ...p, settings: { ...s.settings, ...p.settings }, practice: { ...s.practice, ...p.practice } };
    }
  } catch {
    /* privévenster of geblokkeerde opslag: gewoon zonder */
  }
  cache = s;
  return s;
}

export function save(mut?: (s: Store) => void) {
  const s = load();
  mut?.(s);
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* negeren */
  }
}
