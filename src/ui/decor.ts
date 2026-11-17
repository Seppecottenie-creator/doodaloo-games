import { h } from './dom';

/** Vaste achtergrondlaag: zwevende kleurvlekken, raster, kruisjes en coördinaten. Eén keer per pagina. */
export function mountBackdrop() {
  if (document.querySelector('.backdrop')) return;
  const marks = Array.from({ length: 14 }, (_, i) =>
    h('span', { class: 'bd-mark mono', style: `left:${(i * 37) % 100}%;top:${(i * 53 + 11) % 100}%` }, i % 3 === 0 ? '+' : i % 3 === 1 ? '✦' : '×'),
  );
  const el = h(
    'div',
    { class: 'backdrop', 'aria-hidden': 'true' },
    h('span', { class: 'bd-blob b1' }),
    h('span', { class: 'bd-blob b2' }),
    h('span', { class: 'bd-blob b3' }),
    h('span', { class: 'bd-grid' }),
    ...marks,
    h('span', { class: 'bd-coord mono tl' }, '51.2194° N · 4.4025° E'),
    h('span', { class: 'bd-coord mono br' }, 'DOODALOO / LAB 01'),
  );
  document.body.prepend(el);
}

/** Lopende tekstband. */
export function ticker(items: (string | Node)[], cls = ''): HTMLElement {
  const mk = () => items.map((x, i) => h('span', { class: `tk-item c${i % 4}` }, '✦ ', typeof x === 'string' ? x : x.cloneNode(true)));
  return h('div', { class: `ticker mono ${cls}`, 'aria-hidden': 'true' }, h('div', { class: 'ticker-track' }, ...mk(), ...mk()));
}

/** Schuine sticker. */
export function sticker(text: string, cls = '', style = ''): HTMLElement {
  return h('span', { class: `sticker ${cls}`, style, 'aria-hidden': 'true' }, text);
}

/** Ronde draaiende badge met tekst op een cirkel. */
export function spinBadge(text: string, center: string, cls = ''): HTMLElement {
  const id = `c${Math.random().toString(36).slice(2, 8)}`;
  const el = h('span', { class: `spin-badge ${cls}`, 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 100 100"><defs><path id="${id}" d="M50 50 m-38 0 a38 38 0 1 1 76 0 a38 38 0 1 1 -76 0"/></defs><g class="sb-rot"><text><textPath href="#${id}">${text}</textPath></text></g><text x="50" y="57" text-anchor="middle" class="sb-center">${center}</text></svg>`;
  return el;
}

/** Decoratieve barcode. */
export function barcode(label: string): HTMLElement {
  return h('span', { class: 'barcode', 'aria-hidden': 'true' }, h('span', { class: 'bars' }), h('span', { class: 'mono' }, label));
}
