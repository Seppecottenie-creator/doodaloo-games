import { dayString, puzzleNumber, msUntilNextDay } from '../game/seed';
import { formatCountdown, soundButton } from './common';
import { barcode, ticker } from './decor';
import { h } from './dom';
import { ART as SHADY_ART } from './shadyScreen';

export interface PortalOpts {
  onWeigh: () => void;
  onShady: () => void;
}

const BASE = import.meta.env.BASE_URL;

export function portalScreen(root: HTMLElement, opts: PortalOpts): () => void {
  const n = puzzleNumber(dayString());
  const star = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" fill="#B79CFF"/></svg>';
  const brand = h('div', { class: 'wordmark' });
  brand.innerHTML = `${star}<span>doodaloo</span>`;

  const cd = h('span', null, formatCountdown(msUntilNextDay()));
  const iv = window.setInterval(() => (cd.textContent = formatCountdown(msUntilNextDay())), 1000);

  // rustige hero: alleen het merk, geen spel in de kijker
  const hero = h(
    'section',
    { class: 'q-hero' },
    h('span', { class: 'mono q-kicker' }, `DAILY GAMES · DROP #${String(n).padStart(3, '0')}`),
    h('h1', { class: 'q-title' }, 'dooda', h('span', null, 'loo')),
    h('p', { class: 'q-lede' }, 'Tiny daily games with big opinions. Pick one. Get judged. Come back tomorrow.'),
    h('span', { class: 'mono q-cd' }, 'EVERYTHING RESETS IN ', cd),
  );

  // alle spellen even groot naast elkaar
  const card = (o: { num: string; title: string; desc: string; tag: string; art: HTMLElement; onClick?: () => void; cls: string }) => {
    const el = h(
      o.onClick ? 'button' : 'div',
      { class: `q-card ${o.cls}${o.onClick ? '' : ' locked'}`, type: o.onClick ? 'button' : undefined },
      h('div', { class: 'q-art', 'aria-hidden': 'true' }, o.art),
      h(
        'div',
        { class: 'q-info' },
        h('span', { class: 'mono q-num' }, o.num, h('span', { class: `q-tag${o.onClick ? ' on' : ''}` }, o.tag)),
        h('span', { class: 'q-name' }, o.title),
        h('span', { class: 'q-desc' }, o.desc),
        o.onClick ? h('span', { class: 'q-go' }, 'Play', h('span', { 'aria-hidden': 'true' }, ' →')) : null,
      ),
    );
    if (o.onClick) el.addEventListener('click', o.onClick);
    return el;
  };

  const weighArt = h('div', { class: 'q-weigh' }, h('img', { src: `${BASE}objects/nijlpaard.webp`, alt: '' }), h('span', { class: 'q-beam' }), h('span', { class: 'mono q-q' }, '? kg'));
  const shadyArt = h('div', { class: 'q-shady' });
  shadyArt.innerHTML = SHADY_ART;
  const lockedArt = h('div', { class: 'q-locked' }, h('span', null, '?'));

  const games = h(
    'section',
    { class: 'q-games', 'aria-label': 'Games' },
    card({ num: '01', title: 'Weight For It', desc: 'Guess how heavy it is. Load the scale. Get roasted.', tag: 'DAILY', art: weighArt, onClick: opts.onWeigh, cls: 'c-weigh' }),
    card({ num: '02', title: 'Shady', desc: 'Move the sun. Make the shadow fit the shape.', tag: 'NEW', art: shadyArt, onClick: opts.onShady, cls: 'c-shady' }),
    card({ num: '03', title: 'Coming soon', desc: 'Something with sound. Or tempo. Not telling.', tag: 'SOON', art: lockedArt, cls: 'c-soon' }),
  );

  const screen = h(
    'main',
    { class: 'screen portal q-portal' },
    h('div', { class: 'home-top' }, brand, h('div', { class: 'top-right' }, soundButton())),
    hero,
    games,
    ticker(['WEIGHT FOR IT', 'SHADY', 'ONE TRY PER DAY', 'NO ACCOUNT', 'NO ADS'], 'p-ticker'),
    h('footer', { class: 'p-foot mono' }, h('span', null, '© doodaloo 2026'), barcode('DDL-2026'), h('span', null, 'made with spite')),
  );
  root.replaceChildren(screen);
  return () => clearInterval(iv);
}
