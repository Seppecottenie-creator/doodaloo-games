/**
 * The scale has opinions. Lines are picked at random; {f} = factor ("3.4×"), {guess}, {actual}, {name}.
 * Rude, sweary, aimed at the player's guess, never at who they are.
 */
import { formatFactor, formatGrams } from './format';
import type { RoundResult } from './types';

const PERFECT = [
  'HOLY SHIT. Are you secretly a scale?',
  'Dead fucking on. Who taught you that?',
  'Perfect. I’m genuinely scared of you now.',
  'To the gram. Get out of my workshop, witch.',
  'Okay, that was obscene. Do it again, I dare you.',
];
const GREAT = [
  'Damn. Close enough to annoy me.',
  'Okay, show-off. Calm down.',
  'Nearly perfect. Emphasis on nearly.',
  'Fine. You’re good. I hate it.',
  'Tasty guess. Don’t let it go to your head.',
];
const GOOD = [
  'Not bad for a meat-based scale.',
  'Respectable. Mid, but respectable.',
  'You’re in the right postcode at least.',
  'I’ve seen worse. Mostly from you, but still.',
  'Decent. Your maths teacher would nod. Slowly.',
];
const MEH = [
  'Meh. My grandma guesses better and she’s a toaster.',
  'That’s a guess. Technically.',
  'You were in the right galaxy. Wrong planet.',
  'Bold of you to call that an estimate.',
  'I felt that one in my springs. Not in a good way.',
];
const BAD = [
  'Oof. That’s a crime against physics.',
  'What the fuck was that?',
  'Did you close your eyes and slap the screen?',
  'I’m a scale, not a therapist. Get help.',
  'Every weight you placed is now embarrassed.',
];
const ZERO_LIGHT = [
  '{f} too light. Do you even lift, bro?',
  'It weighs {actual}. You put {guess} on me. Jesus Christ.',
  '{guess}?! For THAT? Were you weighing its feelings?',
  'Too light by {f}. My pan is laughing at you.',
  'You brought a feather to a gunfight.',
];
const ZERO_HEAVY = [
  '{f} too heavy. Did you think it was made of neutron star?',
  '{guess} for something that weighs {actual}? My fucking back.',
  'You loaded me like a moving truck. It’s {actual}, genius.',
  'Too heavy by {f}. I can hear my bolts crying.',
  'Bro put the whole hardware store on me.',
];

export const POKE_HEAD = [
  'Ow. Fuck. That’s my face.',
  'Stop poking me, I’m working.',
  'Touch me again and I’ll tip on purpose.',
  'Do I poke YOUR face? No.',
  'Boop yourself, coward.',
  'I’m brass, not a stress ball.',
];
export const POKE_OBJECT = [
  'Hands off the merchandise.',
  'Poking it won’t tell you what it weighs, Sherlock.',
  'It’s not going to confess.',
  'Yes, it’s real. No, I won’t give you a hint.',
];
export const LOADING = ['Easy, tiger.', 'My back…', 'Is this a scale or a landfill?', 'Ooh, heavy.', 'Commit, you coward.', 'Keep going. Or don’t. I’m not your mum.'];
export const CLEARED = ['Commitment issues?', 'Starting over? Bold.', 'Ah yes, the classic panic dump.'];
export const IDLE = ['Well? I haven’t got all day.', 'Put something on me. Anything.', 'Tick tock, genius.'];

export function verdict(total: number): string {
  if (total >= 475) return 'Absolute fucking menace. 🏆';
  if (total >= 400) return 'Okay, weigh-master. Respect.';
  if (total >= 300) return 'Solid. You may brag to one (1) friend.';
  if (total >= 200) return 'Mid. Aggressively mid.';
  if (total >= 100) return 'Rough. Your guesses need a spotter.';
  return 'Catastrophic. I’m telling everyone.';
}

export function pick<T>(list: readonly T[], rnd: () => number = Math.random): T {
  return list[Math.floor(rnd() * list.length)];
}

export function roastLine(r: RoundResult, rnd: () => number = Math.random): string {
  const light = r.guess < r.actual;
  const f = light ? r.actual / r.guess : r.guess / r.actual;
  let pool: string[];
  if (r.score >= 100) pool = PERFECT;
  else if (r.score >= 90) pool = GREAT;
  else if (r.score >= 60) pool = GOOD;
  else if (r.score >= 30) pool = MEH;
  else if (r.score > 0) pool = BAD;
  else pool = light ? ZERO_LIGHT : ZERO_HEAVY;
  return pick(pool, rnd)
    .replaceAll('{f}', formatFactor(f))
    .replaceAll('{guess}', formatGrams(r.guess))
    .replaceAll('{actual}', formatGrams(r.actual));
}

/** Mood of the scale's face after the reveal. */
export function moodFor(score: number): 'happy' | 'smug' | 'meh' | 'angry' | 'dead' {
  if (score >= 90) return 'happy';
  if (score >= 60) return 'smug';
  if (score >= 30) return 'meh';
  if (score > 0) return 'angry';
  return 'dead';
}
