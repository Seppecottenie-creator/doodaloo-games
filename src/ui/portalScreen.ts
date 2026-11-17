import { dayString, puzzleNumber, msUntilNextDay } from '../game/seed';
import { load } from '../game/storage';
import { createScale } from '../scale';
import type { ScaleLike } from '../scale/types';
import { formatCountdown, soundButton } from './common';
import { barcode, sticker, ticker } from './decor';
import { h } from './dom';

export interface PortalOpts {
  onWeegschaal: () => void;
}

export function portalScreen(root: HTMLElement, opts: PortalOpts): () => void {
  const st = load();
  const n = puzzleNumber(dayString());
  const plays = Object.values(st.daily).filter((d) => d.done).length + st.practice.played;

  const star = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" fill="#B79CFF"/></svg>';
  const brand = h('div', { class: 'wordmark' });
  brand.innerHTML = `${star}<span>doodaloo</span>`;

  const cd = h('span', null, formatCountdown(msUntilNextDay()));
  const iv = window.setInterval(() => (cd.textContent = formatCountdown(msUntilNextDay())), 1000);

  // filmische hero: live balans over de volle breedte, reuzetitel eroverheen
  const canvas = h('canvas', { class: 'x-canvas', role: 'img', 'aria-label': 'A chrome balance scale, live' });
  const play = h('button', { class: 'btn primary x-play', type: 'button' }, `Play today’s #${String(n).padStart(3, '0')}`, h('span', { 'aria-hidden': 'true' }, ' →'));
  play.addEventListener('click', opts.onWeegschaal);
  const hero = h(
    'section',
    { class: 'x-hero' },
    canvas,
    h('div', { class: 'x-vignette', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'x-top' },
      h('span', { class: 'mono x-kicker' }, 'DOODALOO / GAMES THAT JUDGE YOU'),
      h('span', { class: 'mono x-kicker right' }, 'NOW PLAYING — WEEGSCHAAL'),
    ),
    sticker('LIVE · DAILY', 's-lime', 'left:20px;top:64px'),
    sticker('NEXT DROP ', 's-aqua', 'right:20px;top:64px'),
    h(
      'div',
      { class: 'x-bottom' },
      h('h1', { class: 'x-title' }, h('span', { class: 'x-solid' }, 'DOODA'), h('span', { class: 'x-outline' }, 'LOO')),
      h(
        'div',
        { class: 'x-row' },
        h('p', { class: 'x-lede' }, 'Daily games with real stakes and zero mercy. Guess, weigh, get judged. One try per day.'),
        h('div', { class: 'x-cta' }, play, h('span', { class: 'mono x-cd' }, 'NEW PUZZLE IN ', cd)),
      ),
    ),
  );
  (hero.querySelector('.s-aqua') as HTMLElement).append(String(n + 1).padStart(3, '0'));

  // index van spellen: grote typografische rijen
  const row = (num: string, title: string, status: string, desc: string, live: boolean) => {
    const el = h(
      live ? 'button' : 'div',
      { class: `x-game${live ? ' live' : ''}`, type: live ? 'button' : undefined },
      h('span', { class: 'mono x-num' }, num),
      h('span', { class: 'x-name' }, title),
      h('span', { class: 'x-desc' }, desc),
      h('span', { class: `mono x-status${live ? ' on' : ''}` }, status),
      h('span', { class: 'x-arrow', 'aria-hidden': 'true' }, live ? '→' : '—'),
    );
    if (live) el.addEventListener('click', opts.onWeegschaal);
    return el;
  };
  const games = h(
    'section',
    { class: 'x-games', 'aria-label': 'Games' },
    h('header', { class: 'x-games-head mono' }, h('span', null, 'INDEX'), h('span', null, '01 — 03'), barcode('DDL-IDX')),
    row('01', 'Weegschaal', '● LIVE', 'Guess the weight. Load the scale. Get roasted.', true),
    row('02', 'Schaduw', 'IN DEVELOPMENT', 'Name the thing from its shadow alone.', false),
    row('03', 'Untitled', 'CLASSIFIED', 'Sound. Or tempo. Not telling.', false),
  );

  const strip = h(
    'section',
    { class: 'p-strip' },
    h('div', { class: 'p-stat' }, h('b', null, String(plays)), h('span', { class: 'mono' }, 'GAMES PLAYED')),
    h('div', { class: 'p-stat' }, h('b', null, '66'), h('span', { class: 'mono' }, 'OBJECTS ON FILE')),
    h('div', { class: 'p-stat' }, h('b', { class: 'accent' }, '14'), h('span', { class: 'mono' }, 'CALIBRATED WEIGHTS')),
    h('div', { class: 'p-stat' }, h('b', { class: 'lime' }, '0'), h('span', { class: 'mono' }, 'ADS. EVER.')),
  );

  const screen = h(
    'main',
    { class: 'screen portal' },
    h('div', { class: 'home-top' }, brand, h('div', { class: 'top-right' }, h('span', { class: 'pill mono' }, 'v0.5'), soundButton())),
    hero,
    ticker(['WEEGSCHAAL IS LIVE', 'ONE TRY PER DAY', 'NO ACCOUNT', 'SCHADUW IN DEVELOPMENT', 'BUILT IN BRASS & CHROME'], 'p-ticker'),
    games,
    strip,
    ticker(['DOODALOO', 'WEEGSCHAAL', 'SCHADUW', 'UNTITLED 03'], 'p-ticker alt'),
    h('footer', { class: 'p-foot mono' }, h('span', null, '© doodaloo 2026'), barcode('DDL-2026'), h('span', null, 'made with brass, chrome & spite')),
  );
  root.replaceChildren(screen);

  let scale: ScaleLike | null = null;
  let dead = false;
  const timers: number[] = [];
  void createScale(canvas, {}).then((sc) => {
    if (dead) return sc.destroy();
    scale = sc;
    canvas.classList.add('ready');
    sc.setObject({ emoji: '', image: `${import.meta.env.BASE_URL}objects/olifant.webp` }, true);
    timers.push(window.setTimeout(() => sc.addWeight(12), 1100));
    timers.push(window.setTimeout(() => sc.addWeight(10), 1500));
    // elke paar seconden "weegt" de hero opnieuw: altijd beweging
    const loop = (k: number) =>
      timers.push(
        window.setTimeout(() => {
          sc.unlock(k % 2 ? 9 : -6);
          sc.setMood?.(k % 2 ? 'happy' : 'angry');
          timers.push(window.setTimeout(() => sc.reset(), 3600));
          timers.push(window.setTimeout(() => (sc.addWeight(12), sc.addWeight(10 - (k % 2) * 2)), 4300));
          loop(k + 1);
        }, k === 0 ? 3200 : 6500),
      );
    loop(0);
  });
  return () => {
    dead = true;
    clearInterval(iv);
    timers.forEach(clearTimeout);
    scale?.destroy();
  };
}
