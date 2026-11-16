import { WEIGHTS } from '../game/config';
import { formatFactor, formatGramsExact, formatObjectWeight, formatGrams, weightLabel } from '../game/format';
import { Session } from '../game/session';
import type { RoundResult } from '../game/types';
import { buzz } from '../game/haptics';
import * as sfx from '../audio/sfx';
import { t } from '../i18n/nl';
import { ScaleView } from '../scale/ScaleView';
import { paintWeightIcon } from '../scale/sprites';
import { confetti } from './confetti';
import { announce, h, reducedMotion, tween } from './dom';
import { soundButton } from './common';

export interface GameScreenOpts {
  session: Session;
  onRoundDone: (s: Session, r: RoundResult) => void;
  onFinish: (s: Session) => void;
  onQuit: () => void;
}

function reaction(r: RoundResult): string {
  if (r.score >= 100) return t.reveal.exact;
  if (r.score >= 95) return t.reveal.close;
  const light = r.guess < r.actual;
  const f = light ? r.actual / r.guess : r.guess / r.actual;
  if (f >= 50) return t.reveal.miles;
  if (f < 1.25) return light ? t.reveal.slightlyLight : t.reveal.slightlyHeavy;
  return light ? t.reveal.tooLight(formatFactor(f)) : t.reveal.tooHeavy(formatFactor(f));
}

export function gameScreen(root: HTMLElement, opts: GameScreenOpts): () => void {
  const s = opts.session;
  const cleanups: (() => void)[] = [];

  // ---------- opbouw ----------
  const dots = h('ol', { class: 'dots', 'aria-label': t.game.round(s.round + 1, s.objects.length) });
  const scoreEl = h('output', { class: 'run-score', 'aria-label': t.game.score }, String(s.total));
  const quit = h('button', { class: 'icon-btn', 'aria-label': t.game.quit, title: t.game.quit }, '✕');
  const top = h('header', { class: 'topbar' }, quit, dots, h('div', { class: 'topbar-right' }, scoreEl, soundButton()));

  const nameEl = h('h2', { class: 'obj-name' });
  const tagEl = h('span', { class: 'tag' });
  const descEl = h('p', { class: 'obj-desc' });
  const card = h('section', { class: 'obj-card', 'aria-live': 'polite' }, h('div', { class: 'obj-head' }, nameEl, tagEl), descEl);

  const canvas = h('canvas', { class: 'scale-canvas', role: 'img', 'aria-label': t.game.locked });
  const hint = h('div', { class: 'stage-hint' }, t.game.emptyHint);
  const stage = h('div', { class: 'stage' }, canvas, hint);

  const totalEl = h('output', { class: 'total' }, '0 g');
  const readout = h('div', { class: 'readout' }, h('span', { class: 'readout-label' }, t.game.total), totalEl);

  const trayBtns: HTMLButtonElement[] = [];
  const badges: HTMLSpanElement[] = [];
  const tray = h('div', { class: 'tray', role: 'group', 'aria-label': t.game.trayLabel });
  WEIGHTS.forEach((w, idx) => {
    const icon = h('canvas', { class: 'w-icon', 'aria-hidden': 'true' });
    const badge = h('span', { class: 'badge', 'aria-hidden': 'true' });
    const btn = h('button', { class: `w-btn w-${idx}`, type: 'button', 'data-idx': String(idx) }, icon, h('span', { class: 'w-label' }, weightLabel(w)), badge);
    trayBtns.push(btn);
    badges.push(badge);
    tray.append(btn);
    requestAnimationFrame(() => paintWeightIcon(icon, idx, 46, 32));
  });

  const clearBtn = h('button', { class: 'btn ghost', type: 'button' }, t.game.clear);
  const weighBtn = h('button', { class: 'btn primary weigh', type: 'button' }, t.game.weigh);
  const actions = h('div', { class: 'actions' }, clearBtn, weighBtn);

  const sheet = h('div', { class: 'sheet', hidden: true, role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'sheet-score' });
  const bottom = h('div', { class: 'bottom' }, tray, actions, sheet);

  const screen = h('main', { class: 'screen game' }, top, card, stage, readout, bottom);
  root.replaceChildren(screen);

  // ---------- balans ----------
  const scale = new ScaleView(canvas, {
    onLand: (kind, idx, strength) => {
      if (kind === 'object') {
        sfx.plof(strength);
        buzz(12);
      } else {
        sfx.clink(idx, strength);
        buzz(idx >= 6 ? 18 : 8);
      }
    },
  });
  cleanups.push(() => scale.destroy());

  // ---------- render helpers ----------
  let shownTotal = 0;
  let stopTotal = () => {};
  function renderTotal() {
    const target = s.guess;
    stopTotal();
    stopTotal = tween(shownTotal, target, 260, (v, done) => {
      shownTotal = done ? target : v;
      totalEl.textContent = formatGramsExact(done ? target : Math.round(v));
    });
    totalEl.classList.remove('bump');
    void totalEl.offsetWidth;
    totalEl.classList.add('bump');
  }

  function renderTray() {
    trayBtns.forEach((b, i) => {
      const n = s.counts[i];
      badges[i].textContent = n ? `×${n}` : '';
      b.classList.toggle('has', n > 0);
      b.classList.toggle('full', !s.canAdd(i) && s.phase === 'placing');
      b.setAttribute('aria-label', t.game.addWeight(weightLabel(WEIGHTS[i]), n));
      b.disabled = s.phase !== 'placing';
    });
    weighBtn.disabled = s.phase !== 'placing' || s.guess <= 0;
    clearBtn.disabled = s.phase !== 'placing' || s.guess <= 0;
    hint.classList.toggle('hide', s.guess > 0 || s.phase !== 'placing');
  }

  function renderDots() {
    dots.replaceChildren(
      ...s.objects.map((_, i) => {
        const r = s.results[i];
        const cls = r ? (r.score >= 90 ? 'g' : r.score >= 60 ? 'y' : r.score >= 30 ? 'o' : 'r') : i === s.round ? 'cur' : '';
        return h('li', { class: `dot ${cls}` });
      }),
    );
    dots.setAttribute('aria-label', t.game.round(Math.min(s.round + 1, s.objects.length), s.objects.length));
  }

  function renderObject(drop: boolean) {
    const o = s.current;
    nameEl.textContent = o.name;
    tagEl.textContent = o.fictional ? t.game.fictional : t.game.real;
    tagEl.className = `tag ${o.fictional ? 'fict' : 'real'}`;
    descEl.textContent = o.description;
    card.classList.remove('enter');
    void card.offsetWidth;
    card.classList.add('enter');
    canvas.setAttribute('aria-label', `${o.name}. ${t.game.locked}`);
    scale.reset();
    scale.setObject({ emoji: o.emoji, image: o.image ? `${import.meta.env.BASE_URL}${o.image}` : undefined }, drop);
    shownTotal = 0;
    totalEl.textContent = formatGramsExact(0);
    renderTray();
    renderDots();
  }

  // ---------- acties ----------
  function add(idx: number, from?: { x: number; y: number }) {
    sfx.unlockAudio();
    if (!s.add(idx)) {
      const b = trayBtns[idx];
      b.classList.remove('nope');
      void b.offsetWidth;
      b.classList.add('nope');
      buzz([6, 40, 6]);
      return;
    }
    scale.addWeight(idx, from);
    renderTray();
    renderTotal();
  }

  function removeIdx(idx: number) {
    if (!s.remove(idx)) return;
    scale.removeOne(idx);
    sfx.lift();
    buzz(5);
    announce(t.game.removedWeight(weightLabel(WEIGHTS[idx])));
    renderTray();
    renderTotal();
  }

  // Tikken (en Enter/Spatie) op de lade
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
    if (e.key === 'Delete' || e.key === 'Backspace' || e.key === '-') {
      e.preventDefault();
      removeIdx(Number(b.dataset.idx));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const i = Number(b.dataset.idx) + (e.key === 'ArrowRight' ? 1 : -1);
      trayBtns[(i + trayBtns.length) % trayBtns.length].focus();
      e.preventDefault();
    }
  });

  // Slepen van de lade naar de schaal
  let drag: { idx: number; id: number; x0: number; y0: number; ghost: HTMLElement | null; over: boolean } | null = null;
  tray.addEventListener('pointerdown', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.w-btn');
    if (!b || b.disabled || e.button !== 0) return;
    sfx.unlockAudio();
    drag = { idx: Number(b.dataset.idx), id: e.pointerId, x0: e.clientX, y0: e.clientY, ghost: null, over: false };
  });
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.ghost) {
      if (Math.hypot(dx, dy) < 10) return;
      const gc = h('canvas');
      paintWeightIcon(gc, drag.idx, 72, 56);
      drag.ghost = h('div', { class: 'drag-ghost', 'aria-hidden': 'true' }, gc);
      document.body.append(drag.ghost);
      buzz(4);
    }
    e.preventDefault();
    drag.ghost.style.transform = `translate(${e.clientX - 36}px, ${e.clientY - 46}px) rotate(${Math.max(-12, Math.min(12, dx * 0.05))}deg)`;
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
    if (!d.ghost) return; // gewone tik: de click-handler doet het werk
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
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
  // Geen scroll/zoom tijdens slepen op touch
  tray.style.touchAction = 'none';

  // Tik op een gewicht op de schaal = weghalen
  canvas.addEventListener('pointerdown', (e) => {
    if (s.phase !== 'placing') return;
    const id = scale.hitTest(e.clientX, e.clientY);
    if (id === null) return;
    const idx = scale.removeWeight(id);
    if (idx === undefined) return;
    s.remove(idx);
    sfx.lift();
    buzz(5);
    announce(t.game.removedWeight(weightLabel(WEIGHTS[idx])));
    renderTray();
    renderTotal();
  });

  clearBtn.addEventListener('click', () => {
    s.clear();
    scale.clearWeights();
    sfx.lift();
    renderTray();
    renderTotal();
  });

  quit.addEventListener('click', () => {
    if (s.phase === 'placing' && s.guess > 0 && !confirm(t.game.quitConfirm)) return;
    opts.onQuit();
  });

  // ---------- wegen + onthulling ----------
  const timers: number[] = [];
  const later = (ms: number, f: () => void) => timers.push(window.setTimeout(f, reducedMotion() ? Math.min(ms, 150) : ms));
  cleanups.push(() => timers.forEach(clearTimeout));

  weighBtn.addEventListener('click', () => {
    sfx.unlockAudio();
    const out = s.weigh();
    if (!out) return;
    const { result, tilt } = out;
    opts.onRoundDone(s, result);
    renderTray();
    sfx.lockClick();
    buzz(10);
    later(220, () => {
      scale.unlock(tilt);
      sfx.creak(Math.min(1, Math.abs(tilt) / 22));
    });
    later(1500, () => showReveal(result));
  });

  function showReveal(r: RoundResult) {
    const o = s.current;
    const last = s.round >= s.objects.length - 1;
    const scoreNum = h('span', { class: 'big', id: 'sheet-score' }, '0');
    const actualEl = h('b', { class: 'actual' }, formatGrams(r.guess));
    const nextBtn = h('button', { class: 'btn primary', type: 'button' }, last ? t.reveal.finish : t.reveal.next);
    sheet.replaceChildren(
      h('div', { class: 'sheet-top' }, h('div', { class: 'sheet-score' }, scoreNum, h('span', { class: 'of' }, '/100')), h('p', { class: 'reaction' }, reaction(r))),
      h(
        'div',
        { class: 'compare' },
        h('div', null, h('small', null, t.reveal.yourGuess), h('b', null, formatGrams(r.guess))),
        h('div', { class: 'arrow', 'aria-hidden': 'true' }, '→'),
        h('div', null, h('small', null, t.reveal.actual), actualEl),
      ),
      h('div', { class: 'fact' }, h('small', null, t.reveal.funFact), h('p', null, o.funFact)),
      nextBtn,
    );
    sheet.hidden = false;
    sheet.classList.remove('open');
    void sheet.offsetWidth;
    sheet.classList.add('open');

    // echt gewicht telt (in log-ruimte) van jouw gok naar de waarheid
    const la = Math.log10(r.guess);
    const lb = Math.log10(r.actual);
    tween(la, lb, 900, (v, done) => {
      actualEl.textContent = done ? formatObjectWeight(r.actual, o.estimate) : formatGrams(Math.pow(10, v));
    });
    let lastTick = 0;
    later(350, () =>
      tween(0, r.score, 700, (v, done) => {
        const n = Math.round(v);
        scoreNum.textContent = String(n);
        if (n - lastTick >= 7) {
          sfx.tick(n);
          lastTick = n;
        }
        if (done) {
          scoreEl.textContent = String(s.total);
          scoreEl.classList.remove('bump');
          void scoreEl.offsetWidth;
          scoreEl.classList.add('bump');
          renderDots();
          if (r.score >= 100) {
            sfx.jingle(true);
            confetti(0.5, 0.45);
            buzz([20, 40, 20, 40, 60]);
          } else if (r.score >= 90) {
            sfx.jingle(false);
            buzz([15, 30, 15]);
          } else if (r.score === 0) {
            sfx.fail();
            scale.shake();
            buzz([40, 30, 40]);
          } else buzz(15);
        }
      }),
    );
    announce(`${r.score} van 100. ${reaction(r)}. ${t.reveal.yourGuess}: ${formatGrams(r.guess)}. ${t.reveal.actual}: ${formatObjectWeight(r.actual, o.estimate)}.`);
    later(250, () => nextBtn.focus());

    nextBtn.addEventListener('click', () => {
      sheet.classList.remove('open');
      sheet.hidden = true;
      if (s.next()) {
        renderObject(true);
        trayBtns[0].focus({ preventScroll: true });
      } else opts.onFinish(s);
    });
  }

  renderObject(true);
  return () => cleanups.forEach((f) => f());
}
