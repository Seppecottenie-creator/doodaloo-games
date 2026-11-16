import { dayString, msUntilNextDay, puzzleNumber } from '../game/seed';
import { load } from '../game/storage';
import { t } from '../i18n/nl';
import { formatCountdown, soundButton } from './common';
import { h, logo } from './dom';

export interface HomeOpts {
  onDaily: () => void;
  onDailyResult: () => void;
  onPractice: () => void;
}

export function homeScreen(root: HTMLElement, opts: HomeOpts): () => void {
  const st = load();
  const day = dayString();
  const n = puzzleNumber(day);
  const rec = st.daily[day];
  const done = rec?.done;
  const inProgress = rec && !rec.done && rec.rounds.length > 0;

  const daily = h(
    'button',
    { class: 'btn primary big', type: 'button' },
    done ? t.home.dailyDone(n) : inProgress ? `${t.home.playDaily(n)} · ${rec.rounds.length}/5` : t.home.playDaily(n),
  );
  daily.addEventListener('click', done ? opts.onDailyResult : opts.onDaily);
  const practice = h('button', { class: 'btn secondary big', type: 'button' }, t.home.practice);
  practice.addEventListener('click', opts.onPractice);

  const countdown = h('span', { class: 'mono' });
  const tickCd = () => (countdown.textContent = formatCountdown(msUntilNextDay()));
  tickCd();
  const iv = window.setInterval(tickCd, 1000);

  const how = h(
    'details',
    { class: 'how', open: !st.seenIntro },
    h('summary', null, t.home.how),
    h('ol', null, ...t.home.howText.map((x) => h('li', null, x))),
  );

  const screen = h(
    'main',
    { class: 'screen home' },
    h('div', { class: 'home-top' }, h('span'), soundButton()),
    h('div', { class: 'brand' }, logo(84), h('h1', null, t.appName), h('p', { class: 'tagline' }, t.tagline)),
    h('div', { class: 'home-actions' }, daily, practice),
    done ? h('p', { class: 'muted center' }, `${t.home.newDailyIn} `, countdown) : null,
    st.practice.played ? h('p', { class: 'muted center' }, `${t.home.practice}: ${t.home.stats(st.practice.played, st.practice.best)}`) : null,
    how,
    h('p', { class: 'muted small center' }, t.home.localNote),
  );
  root.replaceChildren(screen);
  daily.focus({ preventScroll: true });
  return () => clearInterval(iv);
}
