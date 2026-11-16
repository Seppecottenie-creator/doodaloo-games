import { CONFIG, WEIGHTS, maxCount } from './config';
import { roundScore, tiltDegrees } from './score';
import type { GameObject, Mode, RoundResult } from './types';

/** Eenvoudige toestandsmachine voor één spel van 5 rondes. */
export type Phase = 'placing' | 'weighing' | 'reveal' | 'done';

export class Session {
  round = 0;
  phase: Phase = 'placing';
  counts: number[] = WEIGHTS.map(() => 0);
  results: RoundResult[];

  constructor(
    readonly mode: Mode,
    readonly objects: GameObject[],
    readonly day: string | null,
    previous: RoundResult[] = [],
  ) {
    this.results = previous.slice();
    this.round = previous.length;
    if (this.round >= objects.length) this.phase = 'done';
  }

  get current(): GameObject {
    return this.objects[this.round];
  }

  get total(): number {
    return this.results.reduce((s, r) => s + r.score, 0);
  }

  get guess(): number {
    return this.counts.reduce((s, n, i) => s + n * WEIGHTS[i], 0);
  }

  canAdd(idx: number): boolean {
    return this.phase === 'placing' && this.counts[idx] < maxCount(WEIGHTS[idx]);
  }

  add(idx: number): boolean {
    if (!this.canAdd(idx)) return false;
    this.counts[idx]++;
    return true;
  }

  remove(idx: number): boolean {
    if (this.phase !== 'placing' || this.counts[idx] <= 0) return false;
    this.counts[idx]--;
    return true;
  }

  clear() {
    if (this.phase === 'placing') this.counts = this.counts.map(() => 0);
  }

  /** Weeg: berekent de score van deze ronde. */
  weigh(): { result: RoundResult; tilt: number } | null {
    if (this.phase !== 'placing' || this.guess <= 0) return null;
    const o = this.current;
    const guess = this.guess;
    const result: RoundResult = { objectId: o.id, guess, actual: o.grams, score: roundScore(guess, o.grams) };
    this.results.push(result);
    this.phase = 'reveal';
    return { result, tilt: tiltDegrees(guess, o.grams) };
  }

  next(): boolean {
    if (this.phase !== 'reveal') return false;
    this.round++;
    this.counts = this.counts.map(() => 0);
    this.phase = this.round >= Math.min(CONFIG.rounds, this.objects.length) ? 'done' : 'placing';
    return this.phase === 'placing';
  }
}
