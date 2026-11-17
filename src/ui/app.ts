import objects from '../../data/objects.json';
import { setSoundEnabled } from '../audio/sfx';
import { setHapticsEnabled } from '../game/haptics';
import { maxTotal } from '../game/score';
import { dailySelection, dayString, practiceSelection, puzzleNumber } from '../game/seed';
import { Session } from '../game/session';
import { load, save } from '../game/storage';
import type { GameObject } from '../game/types';
import { endScreen } from './endScreen';
import { gameScreen } from './gameScreen';
import { homeScreen, type PracticeKind } from './homeScreen';
import { creditsScreen } from './creditsScreen';
import { preloadScale, weightIcons } from '../scale';
import { portalScreen } from './portalScreen';
import { mountBackdrop } from './decor';

// Mijlpaal 1: de pool zit in de bundle. Vanaf mijlpaal 3 komt het dagelijkse spel van de server.
const POOL = objects as GameObject[];

export function startApp(root: HTMLElement) {
  const st = load();
  setSoundEnabled(st.settings.sound);
  setHapticsEnabled(st.settings.haptics);

  let cleanup: () => void = () => {};
  const show = (f: () => () => void) => {
    cleanup();
    window.scrollTo(0, 0);
    cleanup = f();
  };

  let lastKind: PracticeKind = 'mix';
  const home = () =>
    show(() =>
      homeScreen(root, {
        onDaily: daily,
        onDailyResult: dailyResult,
        onPractice: practice,
        onCredits: () => show(() => creditsScreen(root, POOL, home)),
        onPortal: () => go(''),
      }),
    );

  // ---------- routing: #weegschaal = het spel, anders het doodaloo-portaal ----------
  const portal = () => show(() => portalScreen(root, { onWeegschaal: () => go('weegschaal') }));
  function go(hash: string) {
    if (location.hash.replace('#', '') === hash) return route();
    if (hash) location.hash = hash;
    else history.pushState(null, '', location.pathname + location.search);
    route();
  }
  function route() {
    const h = location.hash.replace('#', '');
    if (h === 'weegschaal') home();
    else portal();
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);

  function daily() {
    const day = dayString();
    const objs = dailySelection(POOL, day);
    const prev = load().daily[day]?.rounds ?? [];
    const session = new Session('daily', objs, day, prev);
    save((s) => {
      s.seenIntro = true;
      s.daily[day] ??= { day, rounds: [], done: false };
    });
    if (session.phase === 'done') return dailyResult();
    show(() =>
      gameScreen(root, {
        session,
        onRoundDone: (s) =>
          save((st) => {
            st.daily[day] = { day, rounds: s.results.slice(), done: s.results.length >= s.objects.length };
          }),
        onFinish: () => dailyResult(),
        onQuit: home,
      }),
    );
  }

  function dailyResult() {
    const day = dayString();
    const rec = load().daily[day];
    if (!rec) return home();
    show(() =>
      endScreen(root, {
        mode: 'daily',
        number: puzzleNumber(day),
        results: rec.rounds,
        objects: dailySelection(POOL, day),
        onAgain: () => practice(),
        onHome: home,
      }),
    );
  }

  function practice(kind: PracticeKind = 'mix') {
    lastKind = kind;
    const recent = load().practice.recent;
    const pool = kind === 'mix' ? POOL : POOL.filter((o) => o.fictional === (kind === 'fictional'));
    // ?test=id1,id2 speelt precies die voorwerpen (handig om nieuwe foto's of renders te bekijken)
    const forced = new URLSearchParams(location.search).get('test')?.split(',').map((id) => POOL.find((o) => o.id === id)).filter((o): o is GameObject => !!o);
    const objs = forced?.length ? forced : practiceSelection(pool, recent);
    const session = new Session('practice', objs, null);
    save((s) => {
      s.seenIntro = true;
      s.practice.recent = [...objs.map((o) => o.id), ...s.practice.recent].slice(0, Math.floor(POOL.length * 0.6));
    });
    show(() =>
      gameScreen(root, {
        session,
        onRoundDone: () => {},
        onFinish: (s) => {
          save((st) => {
            st.practice.played++;
            st.practice.best = Math.min(maxTotal(), Math.max(st.practice.best, s.total));
          });
          show(() =>
            endScreen(root, {
              mode: 'practice',
              number: null,
              results: s.results,
              objects: s.objects,
              onAgain: () => practice(lastKind),
              onHome: home,
            }),
          );
        },
        onQuit: home,
      }),
    );
  }

  mountBackdrop();
  // ?test=… gaat meteen naar Weegschaal
  if (new URLSearchParams(location.search).get('test') && !location.hash) location.hash = 'weegschaal';
  route();
  // 3D-balans alvast laden terwijl de speler op home staat
  const idle = (window as Window & { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 300));
  idle(() => void preloadScale().then(() => weightIcons()));
}
