import { addDays, dayString, msUntilNextDay, puzzleNumber } from '../game/seed';
import { load } from '../game/storage';
import { POKE_HEAD, pick } from '../game/roast';
import * as sfx from '../audio/sfx';
import { buzz } from '../game/haptics';
import { t } from '../i18n';
import { createScale } from '../scale';
import type { ScaleLike } from '../scale/types';
import { Bubble } from './bubble';
import { formatCountdown, soundButton } from './common';
import { h } from './dom';

export interface HomeOpts {
  onDaily: () => void;
  onDailyResult: () => void;
  onPractice: () => void;
  onCredits: () => void;
}

/** Aantal opeenvolgende dagen met een afgewerkt dagelijks spel (tot vandaag of gisteren). */
export function dailyStreak(days: Record<string, { done: boolean }>, today: string): number {
  let d = days[today]?.done ? today : addDays(today, -1);
  let n = 0;
  while (days[d]?.done) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function homeScreen(root: HTMLElement, opts: HomeOpts): () => void {
  const st = load();
  const day = dayString();
  const n = puzzleNumber(day);
  const rec = st.daily[day];
  const done = rec?.done;
  const inProgress = rec && !rec.done && rec.rounds.length > 0;
  const dailyTotals = Object.values(st.daily).filter((d) => d.done).map((d) => d.rounds.reduce((s, r) => s + r.score, 0));
  const played = dailyTotals.length + st.practice.played;
  const best = Math.max(st.practice.best, ...dailyTotals, 0);
  const streak = dailyStreak(st.daily, day);

  const daily = h(
    'button',
    { class: 'btn primary big cta', type: 'button' },
    h('span', { class: 'cta-main' }, done ? t.home.dailyDone(n) : inProgress ? t.home.continueDaily(n, rec.rounds.length) : t.home.playDaily(n)),
    h('span', { class: 'cta-arrow', 'aria-hidden': 'true' }, '→'),
  );
  daily.addEventListener('click', done ? opts.onDailyResult : opts.onDaily);
  const practice = h('button', { class: 'btn secondary big', type: 'button' }, t.home.practice);
  practice.addEventListener('click', opts.onPractice);

  const countdown = h('span', { class: 'mono' });
  const tickCd = () => (countdown.textContent = formatCountdown(msUntilNextDay()));
  tickCd();
  const iv = window.setInterval(tickCd, 1000);

  const stat = (value: string | number, label: string) => h('div', { class: 'stat' }, h('b', null, String(value)), h('span', null, label));
  const stats = h('div', { class: 'stats' }, stat(played, t.home.played), stat(best, t.home.best), stat(`${streak}🔥`, t.home.streak));

  const steps = h(
    'ol',
    { class: 'steps' },
    ...t.home.howSteps.map(([a, b], i) => h('li', { class: 'step', style: `--i:${i}` }, h('span', { class: 'step-n' }, String(i + 1)), h('div', null, h('b', null, a), h('span', null, b)))),
  );
  const credits = h('button', { class: 'link small', type: 'button' }, t.home.credits);
  credits.addEventListener('click', opts.onCredits);

  const heroCanvas = h('canvas', { class: 'hero-canvas', role: 'img', 'aria-label': t.appName });
  const hero = h('div', { class: 'hero' }, heroCanvas);
  const bubble = new Bubble(hero);

  const screen = h(
    'main',
    { class: 'screen home' },
    h('div', { class: 'home-top' }, h('span', { class: 'brand-mini' }, t.appName), soundButton()),
    hero,
    h('div', { class: 'brand' }, h('h1', null, t.appName), h('p', { class: 'tagline' }, t.tagline)),
    h('div', { class: 'home-actions' }, daily, practice, h('p', { class: 'next-in' }, `${t.home.newDailyIn} `, countdown)),
    stats,
    h('section', { class: 'how' }, h('h2', null, t.home.how), steps),
    h('p', { class: 'muted small center foot' }, t.home.leaderboardSoon, ' · ', credits),
  );
  root.replaceChildren(screen);

  // levende balans bovenaan: begroet je en mag geprord worden
  let scale: ScaleLike | null = null;
  let dead = false;
  const timers: number[] = [];
  void createScale(heroCanvas, {}).then((sc) => {
    if (dead) return sc.destroy();
    scale = sc;
    heroCanvas.classList.add('ready');
    sc.setObject({ emoji: '🐘', image: `${import.meta.env.BASE_URL}objects/olifant.webp` }, true);
    timers.push(window.setTimeout(() => sc.addWeight(9), 900));
    timers.push(window.setTimeout(() => bubble.show(pick(t.home.greetings), sc.headScreenPos?.() ?? null, 3200), 1500));
  });
  heroCanvas.addEventListener('pointerdown', (e) => {
    if (!scale) return;
    sfx.unlockAudio();
    const hit = scale.poke?.(e.clientX, e.clientY);
    if (hit === 'head') {
      sfx.boing();
      buzz(10);
      bubble.show(pick(POKE_HEAD), scale.headScreenPos?.() ?? null, 1800);
    } else if (hit === 'object') sfx.plof(0.4);
  });
  return () => {
    dead = true;
    clearInterval(iv);
    timers.forEach(clearTimeout);
    scale?.destroy();
    bubble.destroy();
  };
}
