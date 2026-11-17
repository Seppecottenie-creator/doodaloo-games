import * as sfx from '../audio/sfx';
import { buzz } from '../game/haptics';
import { dayString, msUntilNextDay, puzzleNumber } from '../game/seed';
import { shareResult } from '../game/share';
import {
  buildLevels,
  dailyLevels,
  iou,
  LEVELS,
  matchScore,
  rasterize,
  roundLine,
  shadowPolys,
  shadyShare,
  shadySquare,
  shadyVerdict,
  type Level,
  type Sun,
} from '../shady/logic';
import type { SundialView } from '../shady/SundialView';
import { formatCountdown, soundButton } from './common';
import { confetti } from './confetti';
import { announce, h } from './dom';

const KEY = 'shady:v3';
interface ShadyStore {
  daily: Record<string, { scores: number[]; done: boolean }>;
  best: number;
}
function loadStore(): ShadyStore {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ShadyStore>;
    return { daily: p.daily ?? {}, best: p.best ?? 0 };
  } catch {
    return { daily: {}, best: 0 };
  }
}
function saveStore(s: ShadyStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* negeren */
  }
}

let viewMod: Promise<typeof import('../shady/SundialView') | null> | null = null;
const loadView = () => (viewMod ??= import('../shady/SundialView').catch(() => null));

const pad = (n: number) => String(n).padStart(3, '0');
/** drempels voor de warmtemeter (zonder cijfers: je voelt het, je ziet het niet exact) */
const HEAT = [0.35, 0.55, 0.72, 0.85, 0.95];

export interface ShadyOpts {
  onPortal: () => void;
}

export function shadyScreen(root: HTMLElement, opts: ShadyOpts): () => void {
  const day = dayString();
  const n = puzzleNumber(day);
  let view: SundialView | null = null;
  let dead = false;
  const timers: number[] = [];
  let keyHandler: ((e: KeyboardEvent) => void) | null = null;
  const setKeys = (f: ((e: KeyboardEvent) => void) | null) => {
    if (keyHandler) window.removeEventListener('keydown', keyHandler);
    keyHandler = f;
    if (f) window.addEventListener('keydown', f);
  };
  const stop = () => {
    view?.destroy();
    view = null;
    timers.forEach(clearTimeout);
    timers.length = 0;
    setKeys(null);
  };

  const back = h('button', { class: 'sh-back', type: 'button', 'aria-label': 'Back to doodaloo' }, '← doodaloo');
  back.addEventListener('click', opts.onPortal);
  const top = h('header', { class: 'sh-top' }, back, h('span', { class: 'mono sh-tag' }, `SHADY · #${pad(n)}`), soundButton());
  const body = h('div', { class: 'sh-body' });
  root.replaceChildren(h('main', { class: 'screen shady' }, top, body));

  // ---------------- intro ----------------
  function intro() {
    stop();
    const st = loadStore();
    const rec = st.daily[day];
    const cd = h('span', null, formatCountdown(msUntilNextDay()));
    const iv = window.setInterval(() => (cd.isConnected ? (cd.textContent = formatCountdown(msUntilNextDay())) : clearInterval(iv)), 1000);
    const label = rec?.done ? 'See today’s result' : rec?.scores.length ? 'Continue today’s suns' : `Play today’s #${pad(n)}`;
    const daily = h('button', { class: 'btn primary sh-cta', type: 'button' }, label);
    daily.addEventListener('click', () => (rec?.done ? end('daily', rec.scores) : play('daily', dailyLevels(day), rec?.scores ?? [])));
    const free = h('button', { class: 'btn ghost', type: 'button' }, 'Free play');
    free.addEventListener('click', () => play('free', buildLevels(Math.random), []));

    const art = h('div', { class: 'sh-art', 'aria-hidden': 'true' });
    art.innerHTML = ART;
    body.replaceChildren(
      h(
        'section',
        { class: 'sh-intro' },
        h(
          'div',
          { class: 'sh-intro-text' },
          h('span', { class: 'mono sh-kicker' }, 'DOODALOO GAME 02 · SUNDIAL'),
          h('h1', { class: 'sh-title' }, 'Shady'),
          h('p', { class: 'sh-lede' }, 'You control the sun. Drag it across the sky until the sculpture’s shadow fills the outline on the floor. Then lock it in.'),
          h(
            'ul',
            { class: 'sh-rules' },
            h('li', null, h('b', null, '↔'), ' sun goes round'),
            h('li', null, h('b', null, '↕'), ' sun goes up / down'),
            h('li', null, h('b', null, '5'), ' suns a day'),
          ),
          h('div', { class: 'sh-actions' }, daily, free),
          h('span', { class: 'mono sh-cd' }, st.best ? `PERSONAL BEST ${st.best}/500 · ` : '', 'NEW SUNS IN ', cd),
        ),
        art,
      ),
    );
  }

  // ---------------- spel ----------------
  function play(mode: 'daily' | 'free', levels: Level[], prev: number[]) {
    stop();
    const scores = prev.slice();
    let idx = scores.length;
    if (idx >= levels.length) return end(mode, scores);

    const roundEl = h('span', { class: 'mono' });
    const totalEl = h('b', { class: 'sh-total' });
    const segs = HEAT.map(() => h('i'));
    const meter = h('div', { class: 'sh-heat', 'aria-hidden': 'true' }, ...segs);
    const pips = h('div', { class: 'sh-pips', 'aria-hidden': 'true' });
    const hud = h('div', { class: 'sh-hud' }, h('div', { class: 'sh-hud-l' }, roundEl, pips), h('div', { class: 'sh-hud-r' }, h('span', { class: 'mono' }, 'SCORE'), totalEl));

    const canvas = h('canvas', { class: 'sh-canvas', 'aria-label': 'Sundial. Drag to move the sun; arrow keys work too.' });
    const result = h('div', { class: 'sh-result', 'aria-live': 'polite' });
    const hint = h('span', { class: 'mono sh-hint' }, 'DRAG ANYWHERE TO MOVE THE SUN');
    const stage = h('div', { class: 'sh-sky' }, canvas, result, hint);
    const lock = h('button', { class: 'btn primary sh-lock', type: 'button' }, 'Lock it in');
    const next = h('button', { class: 'btn primary sh-lock', type: 'button', hidden: true });
    const bar = h('div', { class: 'sh-bar' }, h('div', { class: 'sh-heat-wrap' }, h('span', { class: 'mono' }, 'MATCH'), meter), lock, next);
    body.replaceChildren(h('section', { class: 'sh-play' }, hud, stage, bar));

    let level = levels[idx];
    let target = rasterize(shadowPolys(level.parts, level.target));
    let match = 0;
    let heat = -1;
    let moved = false;

    const renderHud = () => {
      roundEl.textContent = `SUN ${idx + 1}/${levels.length}`;
      totalEl.textContent = String(scores.reduce((s, x) => s + x, 0));
      pips.replaceChildren(...levels.map((_, i) => h('span', { class: `sh-pip${i < scores.length ? (scores[i] >= 90 ? ' ok' : scores[i] >= 60 ? ' mid' : ' bad') : ''}${i === idx ? ' now' : ''}` })));
    };

    // live meten terwijl je sleept, hooguit één keer per frame
    let pending = false;
    const onSun = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (!view || view.locked) return;
        match = iou(target, rasterize(shadowPolys(level.parts, view.sun)));
        const lv = HEAT.filter((t) => match >= t).length;
        if (lv !== heat) {
          if (lv > heat && heat >= 0) {
            sfx.tick(lv * 2);
            buzz(lv >= 5 ? [10, 30, 10] : 6);
          }
          heat = lv;
          segs.forEach((s, i) => s.classList.toggle('on', i < lv));
          meter.classList.toggle('hot', lv >= 5);
          view.drawTarget(lv >= 5 ? 1 : lv / 5);
        }
        if (!moved) {
          moved = true;
          hint.classList.add('gone');
        }
      });
    };

    const startLevel = () => {
      level = levels[idx];
      target = rasterize(shadowPolys(level.parts, level.target));
      heat = -1;
      result.className = 'sh-result';
      result.replaceChildren();
      lock.hidden = false;
      next.hidden = true;
      renderHud();
      view?.setLevel(level.parts, shadowPolys(level.parts, level.target), level.start);
    };

    const doLock = () => {
      if (!view || view.locked) return;
      view.locked = true;
      const mine: Sun = { ...view.sun };
      const sc = matchScore(iou(target, rasterize(shadowPolys(level.parts, mine))));
      scores.push(sc);
      lock.hidden = true;
      // toon waar de zon echt stond: de schaduw schuift in de vorm
      if (sc < 100) timers.push(window.setTimeout(() => view?.animateTo(level.target, 1200), 900));
      view.drawTarget(1);
      result.replaceChildren(h('b', null, `${sc}%`), h('span', null, roundLine(sc)));
      result.className = `sh-result show ${sc >= 90 ? 'ok' : sc >= 60 ? 'mid' : 'bad'}`;
      announce(`${sc} percent. ${roundLine(sc)}`);
      if (sc >= 100) {
        sfx.jingle(true);
        buzz([20, 40, 20, 40, 60]);
        const r = stage.getBoundingClientRect();
        confetti((r.left + r.width / 2) / innerWidth, (r.top + r.height * 0.6) / innerHeight, 140);
      } else if (sc >= 75) {
        sfx.jingle(false);
        buzz(20);
      } else sfx.fail();
      if (mode === 'daily') {
        const s = loadStore();
        s.daily[day] = { scores: scores.slice(), done: scores.length >= levels.length };
        saveStore(s);
      }
      renderHud();
      const last = scores.length >= levels.length;
      next.textContent = last ? 'See your score →' : 'Next sun →';
      timers.push(
        window.setTimeout(() => {
          next.hidden = false;
          next.focus({ preventScroll: true });
        }, 600),
      );
    };

    lock.addEventListener('click', doLock);
    next.addEventListener('click', () => {
      if (scores.length >= levels.length) return end(mode, scores);
      idx++;
      startLevel();
    });
    setKeys((e) => {
      const step = e.shiftKey ? 0.01 : 0.05;
      if (e.key === 'ArrowLeft') view?.nudge(-step, 0);
      else if (e.key === 'ArrowRight') view?.nudge(step, 0);
      else if (e.key === 'ArrowUp') view?.nudge(0, step * 0.7);
      else if (e.key === 'ArrowDown') view?.nudge(0, -step * 0.7);
      else if (e.key === 'Enter' || e.key === ' ') {
        if (!lock.hidden) doLock();
        else if (!next.hidden) next.click();
      } else return;
      e.preventDefault();
    });

    renderHud();
    void loadView().then((m) => {
      if (dead || !canvas.isConnected) return;
      try {
        if (!m) throw new Error('no 3d');
        view = new m.SundialView(canvas, onSun);
        startLevel();
      } catch {
        stage.append(h('p', { class: 'sh-nogl' }, 'Your browser can’t show 3D. Shady needs WebGL.'));
      }
    });
  }

  // ---------------- einde ----------------
  function end(mode: 'daily' | 'free', scores: number[]) {
    stop();
    const total = scores.reduce((s, x) => s + x, 0);
    const st = loadStore();
    const isBest = total > st.best;
    if (isBest) {
      st.best = total;
      saveStore(st);
    }
    const shareBtn = h('button', { class: 'btn primary', type: 'button' }, 'Share');
    const note = h('span', { class: 'mono sh-note', 'aria-live': 'polite' });
    shareBtn.addEventListener('click', async () => {
      const r = await shareResult(shadyShare(mode === 'daily' ? n : null, scores));
      note.textContent = r === 'copied' ? 'COPIED' : r === 'shared' ? 'SHARED' : '';
    });
    const again = h('button', { class: 'btn ghost', type: 'button' }, 'Free play');
    again.addEventListener('click', () => play('free', buildLevels(Math.random), []));
    const home = h('button', { class: 'btn ghost', type: 'button' }, 'Other games');
    home.addEventListener('click', opts.onPortal);
    body.replaceChildren(
      h(
        'section',
        { class: 'sh-end' },
        h('span', { class: 'mono sh-kicker' }, mode === 'daily' ? `SHADY #${pad(n)} · SUNSET` : 'FREE PLAY · SUNSET'),
        h('div', { class: 'sh-big' }, h('b', null, String(total)), h('span', null, `/${LEVELS * 100}`)),
        h('p', { class: 'sh-verdict' }, shadyVerdict(total)),
        h('div', { class: 'sh-squares' }, scores.map(shadySquare).join('')),
        h(
          'ol',
          { class: 'sh-bars' },
          ...scores.map((s, i) =>
            h('li', null, h('span', { class: 'mono' }, `SUN ${i + 1}`), h('i', { style: `--w:${s}%`, class: s >= 90 ? 'ok' : s >= 60 ? 'mid' : 'bad' }), h('b', { class: 'mono' }, `${s}%`)),
          ),
        ),
        isBest && total > 0 ? h('span', { class: 'mono sh-best' }, 'NEW PERSONAL BEST') : null,
        h('div', { class: 'sh-actions' }, shareBtn, again, home),
        note,
      ),
    );
    if (total >= 450) confetti(0.5, 0.3, 160);
  }

  intro();
  return () => {
    dead = true;
    stop();
  };
}

/** Kleine illustratie voor de intro: zon, beeld, schaduw en doelvorm. */
export const ART = `<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
<defs>
<radialGradient id="sg" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff6d0"/><stop offset="0.35" stop-color="#ffd27a" stop-opacity="0.8"/><stop offset="1" stop-color="#ff9a3d" stop-opacity="0"/></radialGradient>
<linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6defc"/><stop offset="1" stop-color="#b9a9ee"/></linearGradient>
<linearGradient id="bx" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9b8ff"/><stop offset="1" stop-color="#6f4fe0"/></linearGradient>
</defs>
<ellipse cx="200" cy="215" rx="185" ry="70" fill="url(#fl)"/>
<path class="art-target" d="M190 222 L300 252 L330 236 L262 214 L262 200 L226 192 Z" fill="rgba(126,232,226,0.25)" stroke="#40c8dc" stroke-width="3" stroke-linejoin="round"/>
<path class="art-shadow" d="M190 222 L292 250 L322 236 L258 216 L258 202 L224 194 Z" fill="#1a1430" opacity="0.85"/>
<rect x="186" y="150" width="6" height="72" fill="#2a2440"/>
<rect x="165" y="110" width="44" height="44" rx="6" fill="url(#bx)"/>
<rect x="165" y="70" width="44" height="44" rx="6" fill="url(#bx)"/>
<rect x="205" y="110" width="44" height="44" rx="6" fill="url(#bx)"/>
<circle class="art-sun" cx="70" cy="60" r="46" fill="url(#sg)"/>
<circle cx="70" cy="60" r="14" fill="#fff3c4"/>
<path d="M60 40 Q 200 -10 330 60" fill="none" stroke="#ffd27a" stroke-opacity="0.4" stroke-dasharray="4 6"/>
</svg>`;
