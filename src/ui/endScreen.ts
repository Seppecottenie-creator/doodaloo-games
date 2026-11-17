import { formatGrams, formatObjectWeight } from '../game/format';
import { maxTotal, scoreSquare } from '../game/score';
import { msUntilNextDay } from '../game/seed';
import { shareResult, shareText } from '../game/share';
import { verdict } from '../game/roast';
import type { GameObject, Mode, RoundResult } from '../game/types';
import { t } from '../i18n';
import { formatCountdown, soundButton } from './common';
import { confetti } from './confetti';
import { announce, h, toast, tween } from './dom';

export interface EndOpts {
  mode: Mode;
  number: number | null;
  results: RoundResult[];
  objects: GameObject[];
  onAgain: () => void;
  onHome: () => void;
}

const band = (s: number) => (s >= 90 ? 'g' : s >= 60 ? 'y' : s >= 30 ? 'o' : 'r');

export function thumb(obj: GameObject | undefined): HTMLElement {
  const el = h('span', { class: 'end-thumb', 'aria-hidden': 'true' });
  if (obj?.image) el.append(h('img', { src: `${import.meta.env.BASE_URL}${obj.image}`, alt: '', loading: 'lazy' }));
  else el.textContent = obj?.emoji ?? '❔';
  return el;
}

function ring(fraction: number): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.classList.add('ring');
  const C = 2 * Math.PI * 52;
  svg.innerHTML = `<circle cx="60" cy="60" r="52" class="ring-bg"/><circle cx="60" cy="60" r="52" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C}"/>`;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => (svg.querySelector('.ring-fg') as SVGCircleElement).setAttribute('stroke-dashoffset', String(C * (1 - fraction)))),
  );
  return svg;
}

export function endScreen(root: HTMLElement, o: EndOpts): () => void {
  const total = o.results.reduce((s, r) => s + r.score, 0);
  const max = maxTotal();
  const v = verdict(total);
  const byId = new Map(o.objects.map((x) => [x.id, x]));

  const big = h('span', { class: 'end-total' }, '0');
  const rows = o.results.map((r, i) => {
    const obj = byId.get(r.objectId);
    return h(
      'li',
      { class: 'end-row', style: `--i:${i}` },
      thumb(obj),
      h('div', { class: 'end-mid' }, h('b', null, obj?.name ?? r.objectId), h('small', null, `${formatGrams(r.guess)} → ${formatObjectWeight(r.actual, obj?.estimate)}`)),
      h('span', { class: `end-score ${band(r.score)}` }, String(r.score)),
    );
  });

  const share = h('button', { class: 'btn primary big', type: 'button' }, t.end.share);
  share.addEventListener('click', async () => {
    const res = await shareResult(shareText(o.number, o.results, o.objects));
    if (res === 'copied') toast(t.end.copied);
  });
  const again = h('button', { class: 'btn secondary', type: 'button' }, o.mode === 'daily' ? t.home.practice : t.end.again);
  again.addEventListener('click', o.onAgain);
  const home = h('button', { class: 'btn ghost', type: 'button' }, t.end.home);
  home.addEventListener('click', o.onHome);

  let iv = 0;
  let cd: HTMLElement | null = null;
  if (o.mode === 'daily') {
    const span = h('span', { class: 'mono' });
    const tick = () => (span.textContent = formatCountdown(msUntilNextDay()));
    tick();
    iv = window.setInterval(tick, 1000);
    cd = h('p', { class: 'next-in center' }, `${t.end.next} `, span);
  }

  const screen = h(
    'main',
    { class: 'screen end' },
    h('div', { class: 'home-top' }, h('span', { class: 'end-kicker' }, o.number ? `Weegschaal #${o.number}` : t.end.titlePractice), soundButton()),
    h('div', { class: 'end-hero' }, ring(total / max), h('div', { class: 'end-score-wrap' }, h('span', { class: 'end-title' }, t.end.title), big, h('span', { class: 'of' }, `/ ${max}`))),
    h('p', { class: 'verdict' }, v),
    h('div', { class: 'squares', 'aria-hidden': 'true' }, o.results.map((r) => scoreSquare(r.score)).join('')),
    h('ol', { class: 'end-list' }, ...rows),
    h('div', { class: 'end-actions' }, share, h('div', { class: 'row' }, again, home)),
    cd,
  );
  root.replaceChildren(screen);
  tween(0, total, 1400, (val) => (big.textContent = String(Math.round(val))));
  if (total >= 400) setTimeout(() => confetti(0.5, 0.3), 1200);
  announce(`${t.end.title}: ${total} out of ${max}. ${v}`);
  share.focus({ preventScroll: true });
  return () => clearInterval(iv);
}
