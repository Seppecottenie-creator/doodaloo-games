import * as sfx from '../audio/sfx';
import { buzz } from '../game/haptics';
import { dayString, msUntilNextDay, puzzleNumber } from '../game/seed';
import { shareResult } from '../game/share';
import { dailySeed, MAX_TIME, Run, shadyShare, shadyVerdict, timeBonus, WRONG_PENALTY , makePuzzle, levelFor } from '../shady/logic';
import { shadowSvg } from '../shady/shadowSvg';
import type { SculptureView } from '../shady/SculptureView';
import { mulberry32 } from '../game/rng';
import { formatCountdown, soundButton } from './common';
import { confetti } from './confetti';
import { announce, h } from './dom';

const KEY = 'shady:v2';
interface ShadyStore {
  daily: Record<string, { solved: number; bestStreak: number }>;
  best: number;
  runs: number;
}
function loadStore(): ShadyStore {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ShadyStore>;
    return { daily: p.daily ?? {}, best: p.best ?? 0, runs: p.runs ?? 0 };
  } catch {
    return { daily: {}, best: 0, runs: 0 };
  }
}
function saveStore(s: ShadyStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* negeren */
  }
}

let viewMod: Promise<typeof import('../shady/SculptureView') | null> | null = null;
function loadView() {
  viewMod ??= import('../shady/SculptureView').catch(() => null);
  return viewMod;
}
async function makeView(canvas: HTMLCanvasElement): Promise<SculptureView | null> {
  const m = await loadView();
  if (!m) return null;
  try {
    return new m.SculptureView(canvas);
  } catch {
    return null;
  }
}

const pad = (n: number) => String(n).padStart(3, '0');

export interface ShadyOpts {
  onPortal: () => void;
}

export function shadyScreen(root: HTMLElement, opts: ShadyOpts): () => void {
  const day = dayString();
  const n = puzzleNumber(day);
  let view: SculptureView | null = null;
  let dead = false;
  let raf = 0;
  const timers: number[] = [];
  let keyHandler: ((e: KeyboardEvent) => void) | null = null;
  const setKeys = (f: ((e: KeyboardEvent) => void) | null) => {
    if (keyHandler) window.removeEventListener('keydown', keyHandler);
    keyHandler = f;
    if (f) window.addEventListener('keydown', f);
  };
  const stopView = () => {
    view?.destroy();
    view = null;
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
    timers.length = 0;
  };

  const back = h('button', { class: 'sh-back', type: 'button', 'aria-label': 'Back to doodaloo' }, '← doodaloo');
  back.addEventListener('click', opts.onPortal);
  const top = h('header', { class: 'sh-top' }, back, h('span', { class: 'mono sh-tag' }, `SHADY · #${pad(n)}`), soundButton());
  const body = h('div', { class: 'sh-body' });
  root.replaceChildren(h('main', { class: 'screen shady' }, top, body));

  // ---------------- intro ----------------
  function intro() {
    stopView();
    setKeys(null);
    const st = loadStore();
    const today = st.daily[day];
    const cd = h('span', null, formatCountdown(msUntilNextDay()));
    const iv = window.setInterval(() => (cd.isConnected ? (cd.textContent = formatCountdown(msUntilNextDay())) : clearInterval(iv)), 1000);

    const daily = h('button', { class: 'btn primary sh-cta', type: 'button' }, today ? `Today: ${today.solved} shadows` : `Daily run #${pad(n)}`);
    daily.addEventListener('click', () => (today ? end('daily', today.solved, today.bestStreak) : play('daily')));
    const endless = h('button', { class: 'btn ghost', type: 'button' }, 'Endless');
    endless.addEventListener('click', () => play('endless'));

    const canvas = h('canvas', { class: 'sh-canvas', 'aria-label': 'A floating block sculpture' });
    // voorbeeld: het beeld en zijn echte schaduw naast elkaar
    const demo = makePuzzle(mulberry32(Date.now() % 100000), levelFor(4));
    const demoShadow = h('div', { class: 'sh-card demo', 'aria-hidden': 'true' });
    demoShadow.innerHTML = shadowSvg(demo.options[demo.answer], demo.size);

    body.replaceChildren(
      h(
        'section',
        { class: 'sh-intro' },
        h(
          'div',
          { class: 'sh-intro-text' },
          h('span', { class: 'mono sh-kicker' }, 'DOODALOO GAME 02 · SPATIAL'),
          h('h1', { class: 'sh-title' }, 'Shady'),
          h('p', { class: 'sh-lede' }, 'A sculpture floats under the lamp. Four shadows on the wall. ', h('b', null, 'Only one is real'), ' — from any side. Find it before the lamp burns out.'),
          h(
            'ul',
            { class: 'sh-rules' },
            h('li', null, h('b', null, 'RIGHT'), ' +time'),
            h('li', null, h('b', { class: 'bad' }, 'WRONG'), ` −${WRONG_PENALTY}s`),
            h('li', null, h('b', null, 'DRAG'), ' to spin it'),
            h('li', null, h('b', null, 'IT GETS'), ' nastier'),
          ),
          h('div', { class: 'sh-actions' }, daily, endless),
          h('span', { class: 'mono sh-cd' }, st.best ? `PERSONAL BEST ${st.best} · ` : '', 'NEW DAILY RUN IN ', cd),
        ),
        h('div', { class: 'sh-demo' }, h('div', { class: 'sh-plinth' }, canvas), h('span', { class: 'mono sh-arrow' }, 'CASTS →'), demoShadow),
      ),
    );
    void makeView(canvas).then((v) => {
      if (dead || !canvas.isConnected) return v?.destroy();
      view = v;
      v?.setSculpture(demo.cubes, demo.size);
    });
  }

  // ---------------- spel ----------------
  function play(mode: 'daily' | 'endless') {
    stopView();
    const run = new Run(mode === 'daily' ? dailySeed(day) : Math.floor(Math.random() * 2 ** 31));
    if (mode === 'daily') {
      // één poging per dag: meteen vastleggen, zodat herladen geen nieuwe kans geeft
      const s = loadStore();
      s.daily[day] = { solved: 0, bestStreak: 0 };
      saveStore(s);
    }

    const fill = h('i', { class: 'sh-lamp-fill' });
    const timeEl = h('span', { class: 'mono sh-time' });
    const solvedEl = h('b', { class: 'sh-solved' }, '0');
    const streakEl = h('span', { class: 'mono sh-streak' });
    const hud = h(
      'div',
      { class: 'sh-hud' },
      h('div', { class: 'sh-count' }, solvedEl, h('span', { class: 'mono' }, 'SHADOWS')),
      h('div', { class: 'sh-lamp', role: 'timer', 'aria-label': 'Time left' }, h('span', { class: 'sh-bulb', 'aria-hidden': 'true' }), h('div', { class: 'sh-lamp-bar' }, fill), timeEl),
      streakEl,
    );
    const canvas = h('canvas', { class: 'sh-canvas', 'aria-label': 'The sculpture. Drag to spin it.' });
    const float = h('span', { class: 'sh-float', 'aria-hidden': 'true' });
    const plinth = h('div', { class: 'sh-plinth' }, canvas, float, h('span', { class: 'mono sh-hint' }, 'DRAG TO SPIN'));
    const cards = h('div', { class: 'sh-cards', role: 'group', 'aria-label': 'Which shadow is real?' });
    const prompt = h('p', { class: 'sh-prompt' }, 'Which shadow can it cast?');
    body.replaceChildren(h('section', { class: 'sh-play' }, hud, h('div', { class: 'sh-stage' }, plinth, h('div', { class: 'sh-side' }, prompt, cards))));

    let locked = false;
    let paused = true;

    const render = () => {
      const p = run.current;
      view?.setSculpture(p.cubes, p.size);
      cards.replaceChildren(
        ...p.options.map((cells, i) => {
          const b = h('button', { class: 'sh-card', type: 'button', 'aria-label': `Shadow ${i + 1}` }, h('span', { class: 'mono sh-key' }, String(i + 1)));
          b.insertAdjacentHTML('beforeend', shadowSvg(cells, p.size));
          b.addEventListener('click', () => choose(i));
          return b;
        }),
      );
      cards.classList.remove('done');
      locked = false;
      paused = false;
    };

    const showFloat = (txt: string, cls: string) => {
      float.textContent = txt;
      float.className = `sh-float ${cls}`;
      void float.offsetWidth;
      float.classList.add('go');
    };

    const choose = (i: number) => {
      if (locked || run.over) return;
      locked = true;
      paused = true;
      const p = run.current;
      const bonus = timeBonus(run.solved);
      const ok = run.answer(i);
      const btns = [...cards.querySelectorAll<HTMLButtonElement>('.sh-card')];
      btns[p.answer].classList.add('right');
      cards.classList.add('done');
      view?.showAxis(p.axis);
      if (ok) {
        btns[i].classList.add('pop');
        showFloat(`+${bonus.toFixed(1)}s`, 'ok');
        sfx.tick(run.streak);
        if (run.streak > 0 && run.streak % 5 === 0) {
          sfx.jingle(true);
          const r = plinth.getBoundingClientRect();
          confetti((r.left + r.width / 2) / innerWidth, (r.top + r.height / 2) / innerHeight, 70);
        }
        buzz(15);
        announce('Right.');
      } else {
        btns[i].classList.add('wrong');
        showFloat(`−${WRONG_PENALTY}s`, 'bad');
        sfx.fail();
        buzz([50, 30, 50]);
        announce(`Wrong. It was shadow ${p.answer + 1}.`);
      }
      solvedEl.textContent = String(run.solved);
      streakEl.textContent = run.streak >= 2 ? `${run.streak} IN A ROW` : '';
      streakEl.classList.toggle('hot', run.streak >= 5);
      updateLamp();
      // even laten zien vanwaar de schaduw kwam, dan door
      timers.push(window.setTimeout(() => (run.over ? finish() : render()), ok ? 650 : 1500));
    };

    const updateLamp = () => {
      fill.style.transform = `scaleX(${run.time / MAX_TIME})`;
      timeEl.textContent = `${run.time.toFixed(1)}s`;
      hud.classList.toggle('low', run.time < 10);
    };

    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (!paused && !document.hidden) {
        run.tick(dt);
        updateLamp();
        if (run.over) {
          paused = true;
          locked = true;
          finish();
        }
      }
    };

    const finish = () => {
      cancelAnimationFrame(raf);
      setKeys(null);
      sfx.whoosh();
      const s = loadStore();
      s.runs++;
      s.best = Math.max(s.best, run.solved);
      if (mode === 'daily') s.daily[day] = { solved: run.solved, bestStreak: run.bestStreak };
      saveStore(s);
      body.classList.add('lights-out');
      timers.push(
        window.setTimeout(() => {
          body.classList.remove('lights-out');
          end(mode, run.solved, run.bestStreak);
        }, 900),
      );
    };

    setKeys((e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = Number(e.key);
      if (k >= 1 && k <= 4) choose(k - 1);
    });

    updateLamp();
    void makeView(canvas).then((v) => {
      if (dead || !canvas.isConnected) return v?.destroy();
      view = v;
      if (!v) plinth.append(h('p', { class: 'sh-nogl' }, 'Your browser can’t show 3D. Shady needs WebGL.'));
      render();
      last = performance.now();
      raf = requestAnimationFrame(loop);
    });
  }

  // ---------------- einde ----------------
  function end(mode: 'daily' | 'endless', solved: number, bestStreak: number) {
    stopView();
    setKeys(null);
    const st = loadStore();
    const shareBtn = h('button', { class: 'btn primary', type: 'button' }, 'Share');
    const note = h('span', { class: 'mono sh-note', 'aria-live': 'polite' });
    shareBtn.addEventListener('click', async () => {
      const r = await shareResult(shadyShare(mode === 'daily' ? n : null, solved, bestStreak));
      note.textContent = r === 'copied' ? 'COPIED' : r === 'shared' ? 'SHARED' : '';
    });
    const again = h('button', { class: 'btn ghost', type: 'button' }, mode === 'daily' ? 'Play endless' : 'Again');
    again.addEventListener('click', () => play('endless'));
    const home = h('button', { class: 'btn ghost', type: 'button' }, 'Other games');
    home.addEventListener('click', opts.onPortal);
    const isBest = solved > 0 && solved >= st.best;
    body.replaceChildren(
      h(
        'section',
        { class: 'sh-end' },
        h('span', { class: 'mono sh-kicker' }, mode === 'daily' ? `SHADY #${pad(n)} · LAMP OUT` : 'ENDLESS · LAMP OUT'),
        h('div', { class: 'sh-big' }, h('b', null, String(solved)), h('span', null, solved === 1 ? 'shadow' : 'shadows')),
        h('p', { class: 'sh-verdict' }, shadyVerdict(solved)),
        h(
          'div',
          { class: 'sh-stats' },
          h('div', null, h('b', null, String(bestStreak)), h('span', { class: 'mono' }, 'BEST STREAK')),
          h('div', null, h('b', { class: isBest ? 'lime' : '' }, String(st.best)), h('span', { class: 'mono' }, isBest ? 'NEW BEST' : 'PERSONAL BEST')),
          h('div', null, h('b', null, String(st.runs)), h('span', { class: 'mono' }, 'RUNS')),
        ),
        h('div', { class: 'sh-actions' }, shareBtn, again, home),
        note,
        mode === 'daily' ? h('span', { class: 'mono sh-cd' }, 'SAME SCULPTURES FOR EVERYONE TODAY. COMPARE.') : null,
      ),
    );
    if (isBest && solved >= 5) confetti(0.5, 0.3, 160);
  }

  intro();
  return () => {
    dead = true;
    stopView();
    setKeys(null);
  };
}
