import { dayString, puzzleNumber, msUntilNextDay } from '../game/seed';
import { load } from '../game/storage';
import * as sfx from '../audio/sfx';
import { buzz } from '../game/haptics';
import { pick } from '../game/roast';
import { createScale, noodlePortrait } from '../scale';
import type { ScaleLike } from '../scale/types';
import { formatCountdown, soundButton } from './common';
import { barcode, spinBadge, sticker, ticker } from './decor';
import { h } from './dom';

const NOODLE_LINES = [
  'I’m Noodle. I judge things.',
  'Sunglasses stay on. Indoors. Always.',
  'Pick a game. Disappoint me.',
  'I don’t do smiles. I do verdicts.',
  'More games coming. Probably. Maybe.',
];

export interface PortalOpts {
  onWeegschaal: () => void;
}

export function portalScreen(root: HTMLElement, opts: PortalOpts): () => void {
  const st = load();
  const n = puzzleNumber(dayString());
  const plays = Object.values(st.daily).filter((d) => d.done).length + st.practice.played;

  const star = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" fill="#B79CFF"/></svg>';
  const brand = h('div', { class: 'wordmark' });
  brand.innerHTML = `${star}<span>doodaloo</span>`;

  // Noodle als portret, met tekstballon
  const noodleImg = h('img', { class: 'p-noodle-img', alt: 'Noodle, the doodaloo mascot, wearing sunglasses' });
  const say = h('div', { class: 'p-say' }, NOODLE_LINES[0]);
  const noodle = h('button', { class: 'p-noodle', type: 'button', 'aria-label': 'Poke Noodle' }, noodleImg);
  noodle.addEventListener('click', () => {
    sfx.unlockAudio();
    sfx.boing();
    buzz(10);
    noodle.classList.remove('boing');
    void noodle.offsetWidth;
    noodle.classList.add('boing');
    say.textContent = pick(NOODLE_LINES.filter((l) => l !== say.textContent));
  });
  void noodlePortrait().then((url) => {
    if (url) noodleImg.src = url;
    else noodle.classList.add('fallback');
  });

  const hero = h(
    'section',
    { class: 'p-hero' },
    h('div', { class: 'p-hero-text' },
      h('span', { class: 'p-kicker mono' }, 'GAMES THAT JUDGE YOU · EST. 2026'),
      h('h1', { class: 'p-title' }, h('span', null, 'dooda'), h('span', { class: 'accent' }, 'loo')),
      h('p', { class: 'p-lede' }, 'Tiny daily games. Big opinions. One very cool pill in sunglasses.'),
      h('div', { class: 'p-chips' }, h('span', { class: 'chip live' }, '● 1 LIVE'), h('span', { class: 'chip' }, '2 IN THE LAB'), h('span', { class: 'chip' }, 'FREE · NO ACCOUNT')),
    ),
    h('div', { class: 'p-hero-art' }, noodle, say, spinBadge('MORE GAMES IN DEVELOPMENT · ', '◆', 'p-badge'), sticker('CERTIFIED JUDGE', 's-lime', 'right:4%;top:6%;--r:0deg'), sticker('PROTOTYPE 0.4', 's-pink', 'left:2%;bottom:14%;--r:0deg')),
  );

  // Weegschaal-kaart met live balans
  const cd = h('span', null, formatCountdown(msUntilNextDay()));
  const iv = window.setInterval(() => (cd.textContent = formatCountdown(msUntilNextDay())), 1000);
  const canvas = h('canvas', { class: 'p-canvas', role: 'img', 'aria-label': 'Weegschaal preview: a chrome balance scale' });
  const play = h('button', { class: 'btn primary p-play', type: 'button' }, 'Play Weegschaal ', h('span', { 'aria-hidden': 'true' }, '→'));
  play.addEventListener('click', opts.onWeegschaal);
  const wCard = h(
    'article',
    { class: 'g-card g-main' },
    h('div', { class: 'g-top' }, h('span', { class: 'chip live' }, '● LIVE'), h('span', { class: 'mono g-num' }, `GAME 01 · DAILY #${String(n).padStart(3, '0')}`)),
    h('div', { class: 'g-art' }, canvas, sticker('RELEASE 01', 's-aqua', 'left:16px;top:14px;--r:0deg'), barcode('WGS-001')),
    h('h2', { class: 'g-title' }, 'weeg', h('span', { class: 'accent' }, 'schaal')),
    h('p', { class: 'g-desc' }, 'Something lands on the scale. Guess its weight with real weights. An elephant, a Pikachu, the Eiffel Tower. Get roasted.'),
    h('div', { class: 'g-meta mono' }, h('span', null, '5 ROUNDS'), h('span', null, '66 OBJECTS'), h('span', null, 'NEXT IN ', cd)),
    play,
  );
  wCard.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    opts.onWeegschaal();
  });

  const soon = (num: string, title: string, desc: string, art: HTMLElement, cls: string) =>
    h('article', { class: `g-card g-soon ${cls}` }, h('div', { class: 'g-top' }, h('span', { class: 'chip' }, 'IN THE LAB'), h('span', { class: 'mono g-num' }, num)), h('div', { class: 'g-art small' }, art), h('h3', { class: 'g-title small' }, title), h('p', { class: 'g-desc' }, desc));
  const shadowArt = h('div', { class: 'art-shadow' }, h('span', { class: 'sil' }), h('span', { class: 'q' }, '?'));
  const labArt = h('div', { class: 'art-lab' }, h('span', { class: 'stripe' }), h('span', { class: 'q mono' }, 'CLASSIFIED'));
  const games = h(
    'section',
    { class: 'p-games', 'aria-label': 'Games' },
    wCard,
    soon('GAME 02', 'schaduw', 'Guess the thing from its shadow alone. Coming soon.', shadowArt, 'g-shadow'),
    soon('GAME 03', '???', 'Something with sound. Or tempo. Noodle won’t say.', labArt, 'g-lab'),
  );

  const strip = h(
    'section',
    { class: 'p-strip' },
    h('div', { class: 'p-stat' }, h('b', null, String(plays)), h('span', { class: 'mono' }, 'GAMES PLAYED')),
    h('div', { class: 'p-stat' }, h('b', null, '1'), h('span', { class: 'mono' }, 'GAMES LIVE')),
    h('div', { class: 'p-stat' }, h('b', { class: 'accent' }, '∞'), h('span', { class: 'mono' }, 'ROASTS LEFT')),
    h('div', { class: 'p-stat' }, h('b', { class: 'lime' }, '0'), h('span', { class: 'mono' }, 'ADS. EVER.')),
  );

  const screen = h(
    'main',
    { class: 'screen portal' },
    h('div', { class: 'home-top' }, brand, h('div', { class: 'top-right' }, h('span', { class: 'pill mono' }, 'v0.4'), soundButton())),
    ticker(['NEW: WEEGSCHAAL IS LIVE', 'DAILY GAMES', 'NO ACCOUNT NEEDED', 'MADE IN A LAB BY A PILL', 'SCHADUW IN THE LAB'], 'p-ticker'),
    hero,
    games,
    strip,
    ticker(['DOODALOO', 'WEEGSCHAAL', 'SCHADUW', 'GAME 03', 'NOODLE SAYS HI'], 'p-ticker alt'),
    h('footer', { class: 'p-foot mono' }, h('span', null, '© doodaloo'), barcode('DDL-2026'), h('span', null, 'made with brass, chrome & spite')),
  );
  root.replaceChildren(screen);

  let scale: ScaleLike | null = null;
  let dead = false;
  const timers: number[] = [];
  void createScale(canvas, {}).then((sc) => {
    if (dead) return sc.destroy();
    scale = sc;
    canvas.classList.add('ready');
    sc.setObject({ emoji: '⚡', title: 'Pikachu', sub: 'Pokémon' }, true);
    timers.push(window.setTimeout(() => sc.addWeight(4), 1000));
    timers.push(window.setTimeout(() => sc.addWeight(3), 1400));
  });
  return () => {
    dead = true;
    clearInterval(iv);
    timers.forEach(clearTimeout);
    scale?.destroy();
  };
}
