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
import { spinBadge, sticker } from './decor';

export type PracticeKind = 'mix' | 'real' | 'fictional';

export interface HomeOpts {
  onDaily: () => void;
  onDailyResult: () => void;
  onPractice: (kind: PracticeKind) => void;
  onCredits: () => void;
  onPortal: () => void;
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

const ICON = {
  solo: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
  daily: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" fill="#B79CFF"/></svg>',
};

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

  let kind: PracticeKind = 'mix';
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Category' });
  const tabList: [PracticeKind, string][] = [
    ['mix', 'mix'],
    ['real', 'real'],
    ['fictional', 'fictional'],
  ];
  for (const [k, label] of tabList) {
    const b = h('button', { class: `tab${k === kind ? ' on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(k === kind) }, label);
    b.addEventListener('click', () => {
      kind = k;
      tabs.querySelectorAll('.tab').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-selected', String(x === b));
      });
    });
    tabs.append(b);
  }

  const solo = h('button', { class: 'round-btn', type: 'button', 'aria-label': t.home.practice });
  solo.innerHTML = ICON.solo;
  solo.addEventListener('click', () => opts.onPractice(kind));
  const daily = h('button', { class: 'round-btn', type: 'button', 'aria-label': done ? t.home.dailyDone(n) : t.home.playDaily(n) });
  daily.innerHTML = ICON.daily;
  daily.addEventListener('click', done ? opts.onDailyResult : opts.onDaily);

  const countdown = h('span', null);
  const tickCd = () => (countdown.textContent = formatCountdown(msUntilNextDay()));
  tickCd();
  const iv = window.setInterval(tickCd, 1000);

  const heroCanvas = h('canvas', { class: 'hero-canvas', role: 'img', 'aria-label': 'Balance scale with Noodle' });
  const hero = h('div', { class: 'hero' }, heroCanvas);
  const bubble = new Bubble(hero);

  const brand = h('button', { class: 'wordmark back', type: 'button', title: 'All doodaloo games' });
  brand.innerHTML = `<span class="back-arrow" aria-hidden="true">←</span>${ICON.star}<span>doodaloo</span>`;
  brand.addEventListener('click', opts.onPortal);

  const card = h(
    'section',
    { class: 'home-card' },
    h('div', { class: 'card-head' }, h('h1', null, 'weeg', h('span', { class: 'accent' }, 'schaal')), h('p', { class: 'tagline' }, t.tagline), tabs),
    hero,
    sticker('DAILY!', 's-lime', 'right:22px;top:24px;--r:9deg'),
    sticker('NO ACCOUNT', 's-aqua', 'right:34px;top:64px;--r:-6deg'),
    spinBadge('5 THINGS ✦ 1 SCALE ✦ 0 MERCY ✦ ', '⚖', 'home-badge'),
    h(
      'div',
      { class: 'card-foot' },
      h('div', { class: 'foot-group' }, h('span', { class: 'foot-label' }, t.home.practice), h('div', { class: 'foot-btns' }, solo)),
      h(
        'div',
        { class: 'foot-group right' },
        h('span', { class: 'foot-label' }, done ? 'Done today' : inProgress ? `Daily · ${rec.rounds.length}/5` : 'Daily'),
        h('div', { class: 'daily-ring' }, daily, h('span', { class: 'ring-tag mono' }, `#${String(n).padStart(3, '0')}`)),
      ),
    ),
  );

  const stat = (value: string | number, label: string, cls = '') => h('div', { class: `stat ${cls}` }, h('b', null, String(value)), h('span', { class: 'mono' }, label));
  const stats = h('div', { class: 'stats' }, stat(played, 'PLAYED'), stat(best, 'BEST', 'lime'), stat(streak, 'STREAK', 'lilac'));

  const tickerItems = () => [
    h('span', null, '✦ TODAY: 5 MYSTERY OBJECTS'),
    h('span', { class: 'pink' }, '✦ ANIMALS · POKÉMON · LANDMARKS'),
    h('span', null, '✦ ONE TRY PER DAY'),
    h('span', { class: 'lime' }, '✦ NEW SCALE IN ', countdown.cloneNode(true)),
  ];
  const ticker = h('div', { class: 'ticker mono', 'aria-hidden': 'true' }, h('div', { class: 'ticker-track' }, ...tickerItems(), ...tickerItems()));

  const credits = h('button', { class: 'link small', type: 'button' }, t.home.credits);
  credits.addEventListener('click', opts.onCredits);

  const screen = h(
    'main',
    { class: 'screen home' },
    h('div', { class: 'home-top' }, brand, h('div', { class: 'top-right' }, h('span', { class: 'pill mono' }, `#${String(n).padStart(3, '0')}`), soundButton())),
    card,
    stats,
    ticker,
    h('section', { class: 'how' }, h('h2', { class: 'mono' }, 'HOW IT WORKS'), h('ol', { class: 'steps' }, ...t.home.howSteps.map(([a, b], i) => h('li', { class: 'step' }, h('span', { class: 'step-n mono' }, `0${i + 1}`), h('div', null, h('b', null, a), h('span', null, b)))))),
    h('p', { class: 'muted small center foot' }, t.home.leaderboardSoon, ' · ', credits),
  );
  root.replaceChildren(screen);

  // ticker-countdown live houden
  const iv2 = window.setInterval(() => ticker.querySelectorAll('.lime span').forEach((x) => (x.textContent = countdown.textContent)), 1000);

  let scale: ScaleLike | null = null;
  let dead = false;
  const timers: number[] = [];
  void createScale(heroCanvas, {}).then((sc) => {
    if (dead) return sc.destroy();
    scale = sc;
    heroCanvas.classList.add('ready');
    sc.setObject({ emoji: '🐘', image: `${import.meta.env.BASE_URL}objects/olifant.webp` }, true);
    timers.push(window.setTimeout(() => sc.addWeight(10), 900));
    timers.push(window.setTimeout(() => bubble.show(pick(t.home.greetings), sc.headScreenPos?.() ?? null, 3200), 1700));
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
    clearInterval(iv2);
    timers.forEach(clearTimeout);
    scale?.destroy();
    bubble.destroy();
  };
}
