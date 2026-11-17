import objects from '../../data/objects.json';
import * as sfx from '../audio/sfx';
import { buzz } from '../game/haptics';
import { dayString, msUntilNextDay, puzzleNumber } from '../game/seed';
import type { GameObject } from '../game/types';
import {
  buildRounds,
  dailyRounds,
  SHADY_MAX,
  shadyLine,
  shadyScore,
  shadyShare,
  shadySquare,
  shadyVerdict,
  STAGE_POINTS,
  type ShadyResult,
  type ShadyRound,
} from '../shady/logic';
import { shareResult } from '../game/share';
import { formatCountdown, soundButton } from './common';
import { confetti } from './confetti';
import { announce, h } from './dom';

const POOL = objects as GameObject[];
const KEY = 'shady:v1';
const BASE = import.meta.env.BASE_URL;

interface ShadyStore {
  daily: Record<string, { results: ShadyResult[]; done: boolean }>;
  practice: { played: number; best: number; recent: string[] };
}
function loadStore(): ShadyStore {
  const d: ShadyStore = { daily: {}, practice: { played: 0, best: 0, recent: [] } };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ShadyStore>;
      return { daily: p.daily ?? {}, practice: { ...d.practice, ...p.practice } };
    }
  } catch {
    /* geen opslag: gewoon spelen */
  }
  return d;
}
function saveStore(s: ShadyStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* negeren */
  }
}

/** "Football (size 5)" → "Football" */
const shortName = (o: GameObject) => o.name.replace(/\s*\(.*\)\s*$/, '');
const pad = (n: number) => String(n).padStart(3, '0');

export interface ShadyOpts {
  onPortal: () => void;
}

export function shadyScreen(root: HTMLElement, opts: ShadyOpts): () => void {
  const timers: number[] = [];
  let keyHandler: ((e: KeyboardEvent) => void) | null = null;
  const later = (f: () => void, ms: number) => timers.push(window.setTimeout(f, ms));
  const setKeys = (f: ((e: KeyboardEvent) => void) | null) => {
    if (keyHandler) window.removeEventListener('keydown', keyHandler);
    keyHandler = f;
    if (f) window.addEventListener('keydown', f);
  };

  const day = dayString();
  const n = puzzleNumber(day);

  const back = h('button', { class: 'sh-back', type: 'button', 'aria-label': 'Back to doodaloo' }, '← doodaloo');
  back.addEventListener('click', opts.onPortal);
  const top = h('header', { class: 'sh-top' }, back, h('span', { class: 'mono sh-tag' }, `SHADY · #${pad(n)}`), soundButton());
  const body = h('div', { class: 'sh-body' });
  const screen = h('main', { class: 'screen shady' }, top, body);
  root.replaceChildren(screen);

  // ---------------- intro ----------------
  function intro() {
    setKeys(null);
    const st = loadStore();
    const rec = st.daily[day];
    const cd = h('span', null, formatCountdown(msUntilNextDay()));
    const iv = window.setInterval(() => (cd.isConnected ? (cd.textContent = formatCountdown(msUntilNextDay())) : clearInterval(iv)), 1000);

    const daily = h('button', { class: 'btn primary sh-cta', type: 'button' }, rec?.done ? 'See today’s result' : rec?.results.length ? 'Continue today’s' : `Play today’s #${pad(n)}`);
    daily.addEventListener('click', () => (rec?.done ? end('daily', rec.results, dailyRounds(POOL, day)) : play('daily', dailyRounds(POOL, day), rec?.results ?? [])));
    const free = h('button', { class: 'btn ghost', type: 'button' }, 'Free play');
    free.addEventListener('click', () => {
      const s = loadStore();
      play('practice', buildRounds(POOL, Math.random, new Set(s.practice.recent)), []);
    });

    // decoratieve schaduw in de hero
    const demo = POOL.filter((o) => o.image);
    const pickDemo = demo[Math.floor(Math.random() * demo.length)];
    const art = h('div', { class: 'sh-wall sh-hero-wall', 'aria-hidden': 'true' }, h('img', { class: 'sh-obj', src: BASE + pickDemo.image, alt: '' }));

    body.replaceChildren(
      h(
        'section',
        { class: 'sh-intro' },
        h(
          'div',
          { class: 'sh-intro-text' },
          h('span', { class: 'mono sh-kicker' }, 'DOODALOO GAME 02'),
          h('h1', { class: 'sh-title' }, 'Shady'),
          h('p', { class: 'sh-lede' }, 'Name the thing from its shadow alone. Ask for more light if you must — it’ll cost you.'),
          h(
            'ol',
            { class: 'sh-rules' },
            h('li', null, h('b', null, `${STAGE_POINTS[0]}`), ' in the dark'),
            h('li', null, h('b', null, `${STAGE_POINTS[1]}`), ' with a little light'),
            h('li', null, h('b', null, `${STAGE_POINTS[2]}`), ' with the full shape'),
          ),
          h('div', { class: 'sh-actions' }, daily, free),
          h('span', { class: 'mono sh-cd' }, 'NEW SHADOWS IN ', cd),
        ),
        art,
      ),
    );
  }

  // ---------------- spel ----------------
  function play(mode: 'daily' | 'practice', rounds: ShadyRound[], prev: ShadyResult[]) {
    const results = prev.slice();
    let idx = results.length;
    if (idx >= rounds.length) return end(mode, results, rounds);

    const total = () => results.reduce((s, r) => s + r.score, 0);
    const pips = h('div', { class: 'sh-pips', 'aria-hidden': 'true' });
    const totalEl = h('b', { class: 'sh-total' }, String(total()));
    const roundEl = h('span', { class: 'mono' });
    const hud = h('div', { class: 'sh-hud' }, roundEl, pips, h('span', { class: 'sh-score mono' }, 'SCORE ', totalEl));

    const img = h('img', { class: 'sh-obj', alt: 'A mystery shadow' });
    const wall = h('div', { class: 'sh-wall' }, h('span', { class: 'sh-beam', 'aria-hidden': 'true' }), img);
    const meter = h('div', { class: 'sh-meter', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
    const light = h('button', { class: 'btn ghost sh-light', type: 'button' });
    const opts4 = h('div', { class: 'sh-options', role: 'group', 'aria-label': 'What is it?' });
    const line = h('p', { class: 'sh-line', 'aria-live': 'polite' });
    const fact = h('p', { class: 'sh-fact' });
    const next = h('button', { class: 'btn primary sh-next', type: 'button', hidden: true });
    const panel = h('div', { class: 'sh-panel' }, h('div', { class: 'sh-controls' }, meter, light), opts4, line, fact, next);
    body.replaceChildren(h('section', { class: 'sh-play' }, hud, h('div', { class: 'sh-stage' }, wall, panel)));

    let stage = 0;
    let answered = false;
    let round = rounds[idx];

    const renderPips = () =>
      pips.replaceChildren(
        ...rounds.map((_, i) => h('span', { class: `sh-pip${i < results.length ? ' ' + (results[i].correct ? 'ok' : 'bad') : ''}${i === idx ? ' now' : ''}` })),
      );

    const applyStage = () => {
      wall.dataset.stage = String(stage);
      const { focus, tilt } = round;
      const sc = [2.9, 1.6, 1][stage];
      const rot = [tilt, tilt * 0.35, 0][stage];
      img.style.transformOrigin = `${focus.x * 100}% ${focus.y * 100}%`;
      img.style.transform = `scale(${sc}) rotate(${rot}deg)`;
      [...meter.children].forEach((el, i) => el.classList.toggle('on', i <= stage));
      light.disabled = stage >= 2 || answered;
      light.textContent = stage >= 2 ? 'Full light' : `More light  −${STAGE_POINTS[stage] - STAGE_POINTS[stage + 1]}`;
    };

    const choose = (o: GameObject, btn: HTMLButtonElement) => {
      if (answered) return;
      answered = true;
      const correct = o.id === round.answer.id;
      const res: ShadyResult = { objectId: round.answer.id, stage, correct, score: shadyScore(stage, correct) };
      results.push(res);
      wall.classList.add('revealed');
      img.style.transform = 'scale(1) rotate(0deg)';
      img.alt = round.answer.name;
      for (const b of opts4.querySelectorAll<HTMLButtonElement>('button')) {
        b.disabled = true;
        if (b.dataset.id === round.answer.id) b.classList.add('right');
      }
      if (!correct) btn.classList.add('wrong');
      light.disabled = true;
      totalEl.textContent = String(total());
      line.textContent = `${correct ? `+${res.score}` : '0'} · ${shadyLine(res)}`;
      line.className = `sh-line ${correct ? 'ok' : 'bad'}`;
      fact.textContent = `It’s ${round.answer.name}. ${round.answer.funFact}`;
      announce(`${correct ? 'Correct' : 'Wrong'}. It is ${round.answer.name}.`);
      if (correct) {
        sfx.jingle(stage === 0);
        buzz(stage === 0 ? [20, 40, 20] : 20);
        if (stage === 0) {
          const r = wall.getBoundingClientRect();
          confetti((r.left + r.width / 2) / innerWidth, (r.top + r.height / 2) / innerHeight, 90);
        }
      } else {
        sfx.fail();
        buzz([60, 30, 60]);
      }
      renderPips();
      if (mode === 'daily') {
        const s = loadStore();
        s.daily[day] = { results: results.slice(), done: results.length >= rounds.length };
        saveStore(s);
      }
      const last = results.length >= rounds.length;
      next.hidden = false;
      next.textContent = last ? 'See your score →' : 'Next shadow →';
      next.focus({ preventScroll: true });
    };

    const load = () => {
      round = rounds[idx];
      stage = 0;
      answered = false;
      wall.classList.remove('revealed');
      wall.classList.add('swap');
      later(() => wall.classList.remove('swap'), 30);
      img.src = BASE + round.answer.image;
      img.alt = 'A mystery shadow';
      roundEl.textContent = `SHADOW ${idx + 1}/${rounds.length}`;
      line.textContent = 'What casts this shadow?';
      line.className = 'sh-line';
      fact.textContent = '';
      next.hidden = true;
      opts4.replaceChildren(
        ...round.options.map((o, i) => {
          const b = h('button', { class: 'sh-opt', type: 'button', 'data-id': o.id }, h('span', { class: 'mono sh-key' }, String(i + 1)), h('span', null, shortName(o)));
          b.addEventListener('click', () => choose(o, b));
          return b;
        }),
      );
      applyStage();
      renderPips();
    };

    light.addEventListener('click', () => {
      if (answered || stage >= 2) return;
      stage++;
      sfx.whoosh();
      buzz(10);
      applyStage();
    });
    next.addEventListener('click', () => {
      if (results.length >= rounds.length) return end(mode, results, rounds);
      idx++;
      load();
    });
    setKeys((e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = Number(e.key);
      if (!answered && k >= 1 && k <= 4) {
        const b = opts4.querySelectorAll<HTMLButtonElement>('button')[k - 1];
        b?.click();
      } else if (!answered && (e.key === 'l' || e.key === 'L')) light.click();
      else if (answered && e.key === 'Enter' && document.activeElement !== next) next.click();
    });
    load();
  }

  // ---------------- einde ----------------
  function end(mode: 'daily' | 'practice', results: ShadyResult[], rounds: ShadyRound[]) {
    setKeys(null);
    const total = results.reduce((s, r) => s + r.score, 0);
    if (mode === 'practice') {
      const s = loadStore();
      s.practice.played++;
      s.practice.best = Math.max(s.practice.best, total);
      s.practice.recent = [...rounds.map((r) => r.answer.id), ...s.practice.recent].slice(0, 12);
      saveStore(s);
    }
    const shareBtn = h('button', { class: 'btn primary', type: 'button' }, 'Share');
    const note = h('span', { class: 'mono sh-note', 'aria-live': 'polite' });
    shareBtn.addEventListener('click', async () => {
      const r = await shareResult(shadyShare(mode === 'daily' ? n : null, results));
      note.textContent = r === 'copied' ? 'COPIED' : r === 'shared' ? 'SHARED' : '';
    });
    const again = h('button', { class: 'btn ghost', type: 'button' }, 'Free play');
    again.addEventListener('click', () => {
      const s = loadStore();
      play('practice', buildRounds(POOL, Math.random, new Set(s.practice.recent)), []);
    });
    const home = h('button', { class: 'btn ghost', type: 'button' }, 'Other games');
    home.addEventListener('click', opts.onPortal);

    const byId = new Map(rounds.map((r) => [r.answer.id, r.answer]));
    body.replaceChildren(
      h(
        'section',
        { class: 'sh-end' },
        h('span', { class: 'mono sh-kicker' }, mode === 'daily' ? `SHADY #${pad(n)} · FINAL` : 'FREE PLAY · FINAL'),
        h('div', { class: 'sh-big' }, h('b', null, String(total)), h('span', null, `/${SHADY_MAX}`)),
        h('p', { class: 'sh-verdict' }, shadyVerdict(total)),
        h('div', { class: 'sh-squares', 'aria-label': results.map((r) => (r.correct ? 'right' : 'wrong')).join(', ') }, results.map(shadySquare).join('')),
        h(
          'ul',
          { class: 'sh-list' },
          ...results.map((r) => {
            const o = byId.get(r.objectId);
            return h(
              'li',
              { class: r.correct ? 'ok' : 'bad' },
              o?.image ? h('img', { src: BASE + o.image, alt: '' }) : null,
              h('span', null, o ? shortName(o) : r.objectId),
              h('b', { class: 'mono' }, r.correct ? `+${r.score}` : '✕'),
            );
          }),
        ),
        h('div', { class: 'sh-actions' }, shareBtn, again, home),
        note,
      ),
    );
    if (total >= SHADY_MAX * 0.8) confetti(0.5, 0.3, 160);
  }

  intro();
  return () => {
    setKeys(null);
    timers.forEach(clearTimeout);
  };
}
