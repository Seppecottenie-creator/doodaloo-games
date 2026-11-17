import { h } from './dom';

/** Stripballon die uit de mond van de balans komt. */
export class Bubble {
  private el: HTMLDivElement;
  private text: HTMLSpanElement;
  private timer = 0;

  constructor(private host: HTMLElement) {
    this.text = h('span', { class: 'bubble-text' });
    this.el = h('div', { class: 'bubble', role: 'status', 'aria-live': 'polite' }, this.text);
    host.append(this.el);
  }

  /** `at` in client-coördinaten (mond van de balans); null = bovenaan in het midden. */
  show(text: string, at: { x: number; y: number } | null, ms = 2600) {
    const r = this.host.getBoundingClientRect();
    const x = at ? at.x - r.left : r.width / 2;
    const y = at ? at.y - r.top : 40;
    this.text.textContent = text;
    this.el.style.setProperty('--x', `${x}px`);
    this.el.style.setProperty('--y', `${y}px`);
    // ballon binnen het scherm houden; het puntje blijft naar de mond wijzen
    this.el.classList.remove('show');
    void this.el.offsetWidth;
    this.el.classList.add('show');
    const w = this.el.offsetWidth;
    const left = Math.max(8, Math.min(r.width - w - 8, x - w / 2));
    this.el.style.setProperty('--left', `${left}px`);
    this.el.style.setProperty('--tail', `${Math.max(18, Math.min(w - 18, x - left))}px`);
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), ms);
  }

  hide() {
    clearTimeout(this.timer);
    this.el.classList.remove('show');
  }

  destroy() {
    clearTimeout(this.timer);
    this.el.remove();
  }
}
