import type { GameObject } from '../game/types';
import { t } from '../i18n';
import { h } from './dom';

export function creditsScreen(root: HTMLElement, pool: GameObject[], onBack: () => void): () => void {
  const back = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t.end.home }, '←');
  back.addEventListener('click', onBack);
  const items = pool
    .filter((o) => o.credit)
    .map((o) =>
      h(
        'li',
        null,
        h('b', null, o.name),
        ` — ${o.credit!.author}, `,
        h('a', { href: o.credit!.url, target: '_blank', rel: 'noopener' }, o.credit!.license),
        ', via Wikimedia Commons (achtergrond verwijderd)',
      ),
    );
  root.replaceChildren(
    h(
      'main',
      { class: 'screen credits' },
      h('div', { class: 'home-top' }, back, h('span')),
      h('h1', null, t.home.credits),
      h('p', { class: 'muted small' }, t.home.creditsIntro),
      h('ul', null, ...items),
    ),
  );
  back.focus();
  return () => {};
}
