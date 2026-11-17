import { WEIGHTS, WEIGHT_SPECS } from '../game/config';
import { formatGramsExact, formatObjectWeight, formatGrams, formatFactor, weightLabel } from '../game/format';
import { Session } from '../game/session';
import type { RoundResult } from '../game/types';
import { buzz } from '../game/haptics';
import { CLEARED, IDLE, LOADING, POKE_HEAD, POKE_OBJECT, moodFor, pick, roastLine } from '../game/roast';
import * as sfx from '../audio/sfx';
import { t } from '../i18n';
import { createScale, weightIcons } from '../scale';
import type { ScaleLike } from '../scale/types';
import { paintWeightIcon } from '../scale/sprites';
import { confetti } from './confetti';
import { announce, h, reducedMotion, tween } from './dom';
import { soundButton } from './common';
import { Bubble } from './bubble';
import { barcode, monogram, spinBadge, sticker, ticker } from './decor';

export interface GameScreenOpts {
  session: Session;
  onRoundDone: (s: Session, r: RoundResult) => void;
  onFinish: (s: Session) => void;
  onQuit: () => void;
}

const band = (s: number) => (s >= 90 ? 'g' : s >= 60 ? 'y' : s >= 30 ? 'o' : 'r');

export function gameScreen(root: HTMLElement, opts: GameScreenOpts): () => void {
  const s = opts.session;
  const cleanups: (() => void)[] = [];

  // ---------- opbouw ----------
  const roundLabel = h('span', { class: 'hud-round mono' });
  const segs = h('ol', { class: 'segs', 'aria-hidden': 'true' });
  const scoreEl = h('output', { class: 'hud-score', 'aria-label': t.game.score }, String(s.total));
  const quit = h('button', { class: 'quit-btn', type: 'button', title: t.game.quit });
  quit.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/></svg>';
  quit.append(t.game.quit);
  const top = h(
    'header',
    { class: 'hud' },
    h('div', { class: 'hud-row' }, quit, segs, h('div', { class: 'hud-right' }, scoreEl, soundButton())),
    roundLabel,
  );

  const nameEl = h('h2', { class: 'obj-name' });
  const tagEl = h('span', { class: 'tag' });
  const catEl = h('span', { class: 'tag cat' });
  const descEl = h('p', { class: 'obj-desc' });
  const thumbEl = h('div', { class: 'obj-thumb', 'aria-hidden': 'true' });
  const card = h('section', { class: 'obj-card', 'aria-live': 'polite' }, thumbEl, h('div', { class: 'obj-text' }, h('div', { class: 'tags' }, tagEl, catEl), nameEl, descEl));

  const screenHost = h('main', { class: 'screen game' });
  const canvas = h('canvas', { class: 'scale-canvas', role: 'img', 'aria-label': t.game.locked });
  const hint = h('div', { class: 'stage-hint' }, t.game.emptyHint);
  const intro = h('div', { class: 'round-intro', 'aria-hidden': 'true' });
  const panA = h('span', { class: 'stage-label mono left' }, 'PAN A · LOCKED');
  const panB = h('span', { class: 'stage-label mono right' }, 'PAN B · 0 ITEMS');
  const credit = h('p', { class: 'credit' });
  const peek = sticker('SEALED · NO PEEKING', 's-pink peek', '--r:0deg');
  const stage = h(
    'div',
    { class: 'stage' },
    canvas,
    h('span', { class: 'ruler', 'aria-hidden': 'true' }),
    h('span', { class: 'corner tl', 'aria-hidden': 'true' }),
    h('span', { class: 'corner tr', 'aria-hidden': 'true' }),
    h('span', { class: 'corner bl', 'aria-hidden': 'true' }),
    h('span', { class: 'corner br', 'aria-hidden': 'true' }),
    spinBadge('CALIBRATED · WEIGHT · INSTRUMENT · ', '◆', 'stage-badge'),
    peek,
    panA,
    panB,
    hint,
    credit,
    intro,
  );
  // info-band onder de header
  const tickHost = h('div', { class: 'game-ticker' });
  // spec-kaart en logboek (alleen op brede schermen zichtbaar)
  const spec = h('dl', { class: 'spec' });
  const logList = h('ol', { class: 'log mono' });
  const extra = h(
    'aside',
    { class: 'extra' },
    h('section', { class: 'panel' }, h('header', { class: 'panel-head mono' }, h('span', null, 'SPEC SHEET'), barcode('WGS')), spec),
    h('section', { class: 'panel' }, h('header', { class: 'panel-head mono' }, h('span', null, 'LOG'), h('span', { class: 'rec' }, '● REC')), logList),
  );
  const log = (text: string, cls = '') => {
    logList.prepend(h('li', { class: cls }, h('span', { class: 'log-t' }, new Date().toTimeString().slice(0, 8)), ' ', text));
    while (logList.children.length > 7) logList.lastElementChild!.remove();
  };
  const bubble = new Bubble(screenHost);

  const totalEl = h('output', { class: 'total' }, '0 g');
  const deltas = h('div', { class: 'deltas', 'aria-hidden': 'true' });
  const readout = h('div', { class: 'readout' }, h('span', { class: 'readout-label mono' }, t.game.total.toUpperCase()), h('div', { class: 'total-wrap' }, totalEl, deltas));

  const trayBtns: HTMLButtonElement[] = [];
  const badges: HTMLSpanElement[] = [];
  const tray = h('div', { class: 'tray', role: 'group', 'aria-label': t.game.trayLabel });
  WEIGHTS.forEach((w, idx) => {
    const icon = h('canvas', { class: 'w-icon', 'aria-hidden': 'true' });
    const badge = h('span', { class: 'badge', 'aria-hidden': 'true' });
    const five = String(w)[0] === '5';
    const btn = h('button', { class: `w-btn w-${idx}${five ? ' five' : ''}`, type: 'button', 'data-idx': String(idx) }, icon, h('span', { class: 'w-label' }, weightLabel(w)), badge);
    trayBtns.push(btn);
    badges.push(badge);
    tray.append(btn);
    requestAnimationFrame(() => paintWeightIcon(icon, idx, 52, 36));
  });
  void weightIcons().then((urls) => {
    if (!urls) return;
    trayBtns.forEach((b, i) => {
      const img = h('img', { class: 'w-icon', src: urls[i], alt: '', 'aria-hidden': 'true', draggable: 'false' });
      b.querySelector('.w-icon')?.replaceWith(img);
    });
  });

  const clearBtn = h('button', { class: 'btn ghost clear', type: 'button', title: t.game.clear }, t.game.clear.toLowerCase());
  const weighBtn = h('button', { class: 'btn weigh', type: 'button' }, h('span', { class: 'weigh-label' }, t.game.weigh), h('span', { class: 'weigh-icon', 'aria-hidden': 'true' }, '↓'));
  const actions = h('div', { class: 'actions' }, clearBtn, weighBtn);

  const sheet = h('div', { class: 'sheet', hidden: true, role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'sheet-score' });
  const bottom = h('div', { class: 'bottom' }, tray, actions, sheet);

  const screen = screenHost;
  screen.append(top, tickHost, card, stage, readout, bottom, extra);
  root.replaceChildren(screen);

  // ---------- balans ----------
  let scale!: ScaleLike;
  let destroyed = false;
  cleanups.push(() => {
    destroyed = true;
    scale?.destroy();
    bubble.destroy();
  });

  const timers: number[] = [];
  const later = (ms: number, f: () => void) => {
    const id = window.setTimeout(f, reducedMotion() ? Math.min(ms, 150) : ms);
    timers.push(id);
    return id;
  };
  cleanups.push(() => timers.forEach(clearTimeout));

  const say = (text: string, ms = 2600) => bubble.show(text, scale?.headScreenPos?.() ?? null, ms);

  // ---------- render helpers ----------
  let shownTotal = 0;
  let stopTotal = () => {};
  function renderTotal() {
    const target = s.guess;
    stopTotal();
    stopTotal = tween(shownTotal, target, 280, (v, done) => {
      shownTotal = done ? target : v;
      totalEl.textContent = formatGramsExact(done ? target : Math.round(v));
    });
    totalEl.classList.remove('bump');
    void totalEl.offsetWidth;
    totalEl.classList.add('bump');
  }

  function floatDelta(text: string, plus: boolean) {
    if (reducedMotion()) return;
    const d = h('span', { class: `delta ${plus ? 'plus' : 'minus'}` }, text);
    deltas.append(d);
    later(900, () => d.remove());
  }

  function renderTray() {
    trayBtns.forEach((b, i) => {
      const n = s.counts[i];
      badges[i].textContent = n ? `${n}` : '';
      b.classList.toggle('has', n > 0);
      b.classList.toggle('full', !s.canAdd(i) && s.phase === 'placing');
      b.setAttribute('aria-label', t.game.addWeight(weightLabel(WEIGHTS[i]), n));
      b.disabled = s.phase !== 'placing';
    });
    weighBtn.disabled = s.phase !== 'placing' || s.guess <= 0;
    clearBtn.disabled = s.phase !== 'placing' || s.guess <= 0;
    const items = s.counts.reduce((a, b) => a + b, 0);
    panB.textContent = `PAN B · ${items} ${items === 1 ? 'ITEM' : 'ITEMS'}`;
    panA.textContent = s.phase === 'placing' ? 'PAN A · LOCKED' : 'PAN A · RELEASED';
    hint.classList.toggle('hide', s.guess > 0 || s.phase !== 'placing');
  }

  function renderHud() {
    const n = s.objects.length;
    const cat = s.current?.category ?? '';
    roundLabel.textContent = `ROUND ${Math.min(s.round + 1, n)}/${n}${cat ? ` · ${cat.toUpperCase()}` : ''}`;
    segs.replaceChildren(
      ...s.objects.map((_, i) => {
        const r = s.results[i];
        return h('li', { class: `seg ${r ? band(r.score) : i === s.round ? 'cur' : ''}` });
      }),
    );
  }

  let idleTimer = 0;
  function armIdle() {
    clearTimeout(idleTimer);
    idleTimer = later(9000, () => s.phase === 'placing' && say(pick(IDLE)));
  }

  function renderObject() {
    const o = s.current;
    // eerste woord wit, de rest lila (zoals in de mockup)
    const words = o.name.split(' ');
    nameEl.replaceChildren(words[0], words.length > 1 ? ' ' : '', words.length > 1 ? h('span', { class: 'accent' }, words.slice(1).join(' ')) : '');
    nameEl.classList.toggle('long', o.name.length > 22);
    tagEl.textContent = o.fictional ? t.game.fictional : t.game.real;
    tagEl.className = `tag ${o.fictional ? 'fict' : 'real'}`;
    catEl.textContent = o.franchise ?? o.category ?? '';
    catEl.hidden = !catEl.textContent;
    descEl.textContent = o.description;
    credit.textContent = o.credit ? `Photo: ${o.credit.author} · ${o.credit.license}` : '';
    // scherpe afbeelding naast de naam (alleen zichtbaar op brede schermen)
    thumbEl.replaceChildren(o.image ? h('img', { src: `${import.meta.env.BASE_URL}${o.image}`, alt: '' }) : h('span', { class: 'thumb-glyph' }, monogram(o.name)));
    card.classList.remove('enter');
    void card.offsetWidth;
    card.classList.add('enter');
    canvas.setAttribute('aria-label', `${o.name}. ${t.game.locked}`);
    const dots = '●'.repeat(o.difficulty) + '○'.repeat(5 - o.difficulty);
    const src = o.source ? new URL(o.source).hostname.replace('www.', '') : '—';
    tickHost.replaceChildren(
      ticker([`ROUND ${s.round + 1}/${s.objects.length}`, `${(o.category ?? 'object').toUpperCase()}`, `DIFFICULTY ${dots}`, o.fictional ? `FICTIONAL · ${(o.franchise ?? '').toUpperCase()}` : 'REAL THING', 'PAN A SEALED', 'NO PEEKING', `SCORE ${s.total}`, 'CALIBRATED ±0.00 G']),
    );
    const row = (k: string, v: string | Node) => [h('dt', { class: 'mono' }, k), h('dd', null, v)];
    spec.replaceChildren(
      ...row('SUBJECT', o.name),
      ...row('TYPE', o.fictional ? 'Fictional' : 'Real'),
      ...row('CATEGORY', o.franchise ?? o.category ?? '—'),
      ...row('DIFFICULTY', h('span', { class: 'dots' }, dots)),
      ...row('SOURCE', src),
      ...row('ROUND', `${s.round + 1} / ${s.objects.length}`),
    );
    log(`NEW SUBJECT: ${o.name.toUpperCase()}`, 'hl');
    bubble.hide();
    scale.reset();
    shownTotal = 0;
    totalEl.textContent = formatGramsExact(0);
    renderTray();
    renderHud();
    // ronde-intro, daarna valt het voorwerp
    intro.replaceChildren(h('span', { class: 'ri-kicker' }, t.game.roundIntro(s.round + 1)), h('span', { class: 'ri-name' }, o.name));
    intro.classList.remove('show');
    void intro.offsetWidth;
    intro.classList.add('show');
    sfx.whoosh();
    later(reducedMotion() ? 0 : 650, () => {
      scale.setObject({ emoji: o.emoji, image: o.image ? `${import.meta.env.BASE_URL}${o.image}` : undefined, title: o.name, sub: o.franchise ?? o.category }, true);
    });
    armIdle();
  }

  // ---------- acties ----------
  let addsThisRound = 0;
  function add(idx: number, from?: { x: number; y: number }): boolean {
    sfx.unlockAudio();
    if (!s.add(idx)) {
      const b = trayBtns[idx];
      b.classList.remove('nope');
      void b.offsetWidth;
      b.classList.add('nope');
      buzz([6, 40, 6]);
      return false;
    }
    scale.addWeight(idx, from);
    floatDelta(`+${weightLabel(WEIGHTS[idx])}`, true);
    log(`+ ${weightLabel(WEIGHTS[idx])}`, 'plus');
    renderTray();
    renderTotal();
    armIdle();
    addsThisRound++;
    if (addsThisRound % 5 === 0 && Math.random() < 0.6) say(pick(LOADING), 1800);
    return true;
  }

  /** Haalt één gewicht van soort idx weg (de balans is al bijgewerkt als viaScale). */
  function removeIdx(idx: number, viaScale = false) {
    if (!s.remove(idx)) return;
    if (!viaScale) scale.removeOne(idx);
    floatDelta(`−${weightLabel(WEIGHTS[idx])}`, false);
    log(`− ${weightLabel(WEIGHTS[idx])}`, 'minus');
    sfx.lift();
    buzz(5);
    announce(t.game.removedWeight(weightLabel(WEIGHTS[idx])));
    renderTray();
    renderTotal();
    armIdle();
  }

  // Tikken op de lade
  let suppressClick = false;
  tray.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.w-btn');
    if (!b) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    add(Number(b.dataset.idx));
  });
  tray.addEventListener('keydown', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.w-btn');
    if (!b) return;
    const i = Number(b.dataset.idx);
    if (e.key === 'Delete' || e.key === 'Backspace' || e.key === '-') {
      e.preventDefault();
      removeIdx(i);
    } else if (e.key.startsWith('Arrow')) {
      const step = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 } as Record<string, number>)[e.key] ?? 0;
      trayBtns[(i + step + trayBtns.length) % trayBtns.length].focus();
      e.preventDefault();
    }
  });

  // Slepen naar de schaal; ingedrukt houden = blijven toevoegen
  interface Drag {
    idx: number;
    id: number;
    x0: number;
    y0: number;
    ghost: HTMLElement | null;
    over: boolean;
    hold: number;
    repeated: boolean;
  }
  let drag: Drag | null = null;
  tray.addEventListener('pointerdown', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.w-btn');
    if (!b || b.disabled || e.button !== 0) return;
    sfx.unlockAudio();
    const idx = Number(b.dataset.idx);
    const d: Drag = { idx, id: e.pointerId, x0: e.clientX, y0: e.clientY, ghost: null, over: false, hold: 0, repeated: false };
    const repeat = (delay: number) => {
      d.hold = window.setTimeout(() => {
        if (drag !== d || d.ghost) return;
        if (!add(idx)) return;
        d.repeated = true;
        b.classList.add('holding');
        repeat(Math.max(70, delay * 0.8));
      }, delay);
    };
    repeat(420);
    drag = d;
  });
  const endHold = (d: Drag) => {
    clearTimeout(d.hold);
    trayBtns[d.idx].classList.remove('holding');
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.ghost) {
      if (Math.hypot(dx, dy) < 10 || drag.repeated) return;
      endHold(drag);
      const src = trayBtns[drag.idx].querySelector<HTMLImageElement>('img.w-icon')?.src;
      let gc: HTMLElement;
      if (src) gc = h('img', { src, alt: '' });
      else {
        gc = h('canvas');
        paintWeightIcon(gc as HTMLCanvasElement, drag.idx, 72, 56);
      }
      drag.ghost = h('div', { class: 'drag-ghost', 'aria-hidden': 'true' }, gc);
      document.body.append(drag.ghost);
      buzz(4);
    }
    e.preventDefault();
    drag.ghost.style.transform = `translate(${e.clientX - 36}px, ${e.clientY - 46}px) rotate(${Math.max(-14, Math.min(14, dx * 0.06))}deg)`;
    scale.lookAtScreen?.(e.clientX, e.clientY);
    const over = scale.isOverRightSide(e.clientX, e.clientY);
    if (over !== drag.over) {
      drag.over = over;
      scale.setDropHighlight(over);
      drag.ghost.classList.toggle('over', over);
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    endHold(d);
    if (d.repeated || d.ghost) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
    }
    if (!d.ghost) return;
    d.ghost.remove();
    scale.setDropHighlight(false);
    if (e.type === 'pointerup' && d.over) add(d.idx, { x: e.clientX, y: e.clientY });
  };
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  cleanups.push(() => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    drag?.ghost?.remove();
  });
  tray.addEventListener('contextmenu', (e) => e.preventDefault());

  // Tik op de balans: gewicht weghalen, of het hoofd/voorwerp porren
  canvas.addEventListener('pointerdown', (e) => {
    if (!scale) return;
    sfx.unlockAudio();
    if (s.phase === 'placing') {
      const id = scale.hitTest(e.clientX, e.clientY);
      if (id !== null) {
        const idx = scale.removeWeight(id);
        if (idx !== undefined) removeIdx(idx, true);
        return;
      }
    }
    const hit = scale.poke?.(e.clientX, e.clientY);
    if (hit === 'head') {
      sfx.boing();
      buzz(10);
      say(pick(POKE_HEAD), 1800);
    } else if (hit === 'object') {
      sfx.plof(0.4);
      buzz(8);
      if (Math.random() < 0.5) say(pick(POKE_OBJECT), 1800);
    }
  });

  clearBtn.addEventListener('click', () => {
    s.clear();
    scale.clearWeights();
    sfx.lift();
    renderTray();
    renderTotal();
    if (Math.random() < 0.5) say(pick(CLEARED), 1600);
    log('PAN B CLEARED', 'minus');
  });

  quit.addEventListener('click', () => opts.onQuit());

  // ---------- wegen + onthulling ----------
  weighBtn.addEventListener('click', () => {
    sfx.unlockAudio();
    const out = s.weigh();
    if (!out) return;
    const { result, tilt } = out;
    clearTimeout(idleTimer);
    bubble.hide();
    opts.onRoundDone(s, result);
    renderTray();
    sfx.lockClick();
    buzz(10);
    screen.classList.add('weighing');
    peek.classList.add('gone');
    log(`WEIGHED · ${formatGrams(result.guess)} · ${result.score}/100`, 'hl');
    later(260, () => {
      scale.unlock(tilt);
      sfx.creak(Math.min(1, Math.abs(tilt) / 22));
    });
    later(1150, () => {
      scale.setMood?.(moodFor(result.score));
      const line = roastLine(result);
      say(line, 60000);
      log(`VERDICT: “${line}”`, 'roast');
    });
    later(1500, () => showReveal(result));
  });

  /** Logaritmische meter: waar zat je gok t.o.v. het echte gewicht? */
  function meter(r: RoundResult) {
    const lg = Math.log10(r.guess);
    const la = Math.log10(r.actual);
    const span = Math.max(1.2, Math.abs(lg - la) * 1.4);
    const mid = (lg + la) / 2;
    const pct = (v: number) => Math.max(4, Math.min(96, 50 + ((v - mid) / span) * 100));
    const gap = h('span', { class: `m-gap ${band(r.score)}` });
    const you = h('span', { class: 'm-pin you', style: `left:${pct(lg)}%` }, h('b', null, t.reveal.yourGuess));
    const real = h('span', { class: 'm-pin real', style: `left:${pct(lg)}%` }, h('b', null, t.reveal.actual));
    const a = Math.min(pct(lg), pct(la));
    const b = Math.max(pct(lg), pct(la));
    gap.style.left = `${a}%`;
    gap.style.width = `${b - a}%`;
    const el = h('div', { class: 'meter', 'aria-hidden': 'true' }, h('span', { class: 'm-track' }), gap, you, real);
    // het "echt"-pinnetje schuift van jouw gok naar de waarheid
    requestAnimationFrame(() => requestAnimationFrame(() => (real.style.left = `${pct(la)}%`)));
    return el;
  }

  function showReveal(r: RoundResult) {
    const o = s.current;
    const last = s.round >= s.objects.length - 1;
    const scoreNum = h('span', { class: 'big', id: 'sheet-score' }, '0');
    const light = r.guess < r.actual;
    const f = light ? r.actual / r.guess : r.guess / r.actual;
    const offBy = r.score >= 100 ? t.reveal.spotOn : light ? t.reveal.tooLight(formatFactor(f)) : t.reveal.tooHeavy(formatFactor(f));
    const actualEl = h('b', { class: 'actual' }, formatGrams(r.guess));
    const nextBtn = h('button', { class: 'btn primary big', type: 'button' }, last ? t.reveal.finish : t.reveal.next);
    sheet.replaceChildren(
      h(
        'div',
        { class: 'sheet-top' },
        h('div', { class: `sheet-score ${band(r.score)}` }, scoreNum, h('span', { class: 'of' }, '/100')),
        h('div', { class: 'sheet-vs' }, h('span', { class: `off ${band(r.score)}` }, offBy), h('span', { class: 'vs-line' }, `${formatGrams(r.guess)} → `, actualEl)),
      ),
      meter(r),
      h('div', { class: 'fact' }, h('small', null, t.reveal.funFact), h('p', null, o.funFact)),
      nextBtn,
    );
    sheet.hidden = false;
    sheet.classList.remove('open');
    void sheet.offsetWidth;
    sheet.classList.add('open');

    tween(Math.log10(r.guess), Math.log10(r.actual), 900, (v, done) => {
      actualEl.textContent = done ? formatObjectWeight(r.actual, o.estimate) : formatGrams(Math.pow(10, v));
    });
    let lastTick = 0;
    later(300, () =>
      tween(0, r.score, 750, (v, done) => {
        const n = Math.round(v);
        scoreNum.textContent = String(n);
        if (n - lastTick >= 7) {
          sfx.tick(n);
          lastTick = n;
        }
        if (!done) return;
        scoreEl.textContent = String(s.total);
        const wrap = scoreEl.parentElement!;
        wrap.classList.remove('bump');
        void wrap.offsetWidth;
        wrap.classList.add('bump');
        renderHud();
        if (r.score >= 100) {
          sfx.jingle(true);
          confetti(0.5, 0.4);
          buzz([20, 40, 20, 40, 60]);
        } else if (r.score >= 90) {
          sfx.jingle(false);
          confetti(0.5, 0.4, 50);
          buzz([15, 30, 15]);
        } else if (r.score === 0) {
          sfx.fail();
          scale.shake();
          buzz([40, 30, 40]);
        } else buzz(15);
      }),
    );
    announce(`${r.score} out of 100. ${offBy}. ${t.reveal.yourGuess}: ${formatGrams(r.guess)}. ${t.reveal.actual}: ${formatObjectWeight(r.actual, o.estimate)}.`);
    later(250, () => nextBtn.focus({ preventScroll: true }));

    nextBtn.addEventListener('click', () => {
      sheet.classList.remove('open');
      sheet.hidden = true;
      screen.classList.remove('weighing');
      peek.classList.remove('gone');
      bubble.hide();
      if (s.next()) {
        addsThisRound = 0;
        renderObject();
      } else opts.onFinish(s);
    });
  }

  // tot de balans er is: lade uit
  trayBtns.forEach((b) => (b.disabled = true));
  weighBtn.disabled = true;
  // op pc vult de balans het hele scherm; schuif de scène naar links, weg van de panelen
  const updateShift = () => {
    const wide = window.innerWidth >= 900;
    canvas.style.setProperty('--scene-shift', wide ? `${Math.max(0, window.innerWidth - card.getBoundingClientRect().left + 16)}px` : '0px');
  };
  updateShift();
  window.addEventListener('resize', updateShift);
  cleanups.push(() => window.removeEventListener('resize', updateShift));
  void createScale(canvas, {
    onLand: (kind, idx, strength) => {
      if (kind === 'object') {
        sfx.plof(strength);
        buzz(12);
      } else {
        sfx.clink(idx, strength);
        buzz(WEIGHT_SPECS[idx].heft > 0.5 ? 18 : 8);
      }
    },
  }).then((sc) => {
    if (destroyed) return sc.destroy();
    scale = sc;
    canvas.classList.add('ready');
    renderObject();
  });
  return () => cleanups.forEach((f) => f());
}
