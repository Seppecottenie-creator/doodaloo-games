import { setSoundEnabled, unlockAudio } from '../audio/sfx';
import { load, save } from '../game/storage';
import { t } from '../i18n';
import { h } from './dom';

export function soundButton(): HTMLButtonElement {
  const btn = h('button', { class: 'icon-btn', type: 'button' });
  const render = () => {
    const on = load().settings.sound;
    btn.textContent = on ? '🔊' : '🔇';
    btn.setAttribute('aria-label', on ? t.settings.soundOn : t.settings.soundOff);
    btn.setAttribute('aria-pressed', String(on));
    btn.title = t.settings.sound;
  };
  btn.addEventListener('click', () => {
    save((s) => (s.settings.sound = !s.settings.sound));
    setSoundEnabled(load().settings.sound);
    unlockAudio();
    render();
  });
  render();
  return btn;
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
