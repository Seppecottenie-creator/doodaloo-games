type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; style?: string };

/** Mini-hyperscript: h('button', { class: 'x', onclick }, 'Tekst') */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k === 'text') el.textContent = String(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export function announce(msg: string) {
  const el = document.getElementById('live');
  if (!el) return;
  el.textContent = '';
  // forceer een nieuwe aankondiging, ook bij dezelfde tekst
  requestAnimationFrame(() => (el.textContent = msg));
}

export function reducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Tween met easing; geeft een stop-functie terug. */
export function tween(from: number, to: number, ms: number, onUpdate: (v: number, done: boolean) => void, ease = (t: number) => 1 - Math.pow(1 - t, 3)) {
  if (reducedMotion() || ms <= 0) {
    onUpdate(to, true);
    return () => {};
  }
  const start = performance.now();
  let raf = 0;
  const f = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    onUpdate(from + (to - from) * ease(t), t >= 1);
    if (t < 1) raf = requestAnimationFrame(f);
  };
  raf = requestAnimationFrame(f);
  return () => cancelAnimationFrame(raf);
}

export function toast(msg: string) {
  const el = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2200);
}

/** Klein balans-logo als SVG. */
export function logo(size = 56): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <defs><linearGradient id="lg-b" x1="0" x2="1"><stop offset="0" stop-color="#8c6a1f"/><stop offset=".45" stop-color="#f6e2a0"/><stop offset="1" stop-color="#9c7624"/></linearGradient></defs>
    <rect x="20" y="54" width="24" height="6" rx="2" fill="#8a5a33"/>
    <path d="M30 14h4l2 40h-8z" fill="#2b2b30"/>
    <g class="logo-beam"><path d="M8 15 Q32 9 56 15 L56 18 Q32 14 8 18Z" fill="url(#lg-b)"/>
    <path d="M10 17 L4 34 M10 17 L16 34 M54 17 L48 34 M54 17 L60 34" stroke="#9c7624" stroke-width="1.2"/>
    <path d="M2 34 Q10 41 18 34Z M46 34 Q54 41 62 34Z" fill="url(#lg-b)"/></g>
    <circle cx="32" cy="14" r="3.5" fill="url(#lg-b)"/>`;
  return svg;
}
