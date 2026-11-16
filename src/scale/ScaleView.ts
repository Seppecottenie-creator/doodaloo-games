import { emojiSprite, weightSprite, WEIGHT_SIZE } from './sprites';
import { layoutStack, type Placed, type Slot } from './layout';

export interface ScaleObject {
  emoji: string;
  image?: string;
}

export interface ScaleCallbacks {
  /** Er landt iets op een schaal. `strength` 0–1. */
  onLand?: (kind: 'object' | 'weight', idx: number, strength: number) => void;
  /** De balans komt bijna tot rust na het wegen. */
  onSettled?: () => void;
}

interface ItemAnim {
  /** verticale offset t.o.v. de doelpositie (negatief = hoger) */
  dy: number;
  vy: number;
  dx: number;
  landed: boolean;
  bounces: number;
}

const DEG = Math.PI / 180;
const STEP = 1 / 120;

/**
 * Canvas-balans met een kleine veer-dempersimulatie:
 * - de balk (hoek θ) veert naar zijn doelhoek;
 * - elke schaal hangt als slinger aan de balk en reageert op de versnelling van het ophangpunt;
 * - de schaalbodem veert verticaal mee bij elke landing;
 * - de wijzer heeft een eigen kleine veer en trilt na.
 */
export class ScaleView {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private W = 360;
  private H = 300;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;

  // geometrie
  private cx = 0;
  private py = 0;
  private R = 0;
  private L = 0;
  private pw = 0;
  private unit = 1;
  private needleLen = 0;

  // physics-toestand
  private theta = 0;
  private omega = 0;
  private target = 0;
  private locked = true;
  private lockAnim = 1; // 1 = slot dicht en zichtbaar, 0 = weg
  private needle = 0;
  private needleV = 0;
  private pans = [
    { phi: 0, w: 0, b: 0, vb: 0, ax: 0, vx: 0, px: 0 },
    { phi: 0, w: 0, b: 0, vb: 0, ax: 0, vx: 0, px: 0 },
  ];
  private shakeT = 0;
  private settledNotified = true;
  private highlight = 0;
  private highlightTarget = 0;

  // inhoud
  private object: ScaleObject | null = null;
  private objectImg: HTMLImageElement | null = null;
  private objectAnim: ItemAnim | null = null;
  private placed: Placed[] = [];
  private slots: Slot[] = [];
  private anims = new Map<number, ItemAnim>();
  private nextId = 1;
  private hitRects: { id: number; x: number; y: number; w: number; h: number }[] = [];
  private panXform = [
    { x: 0, y: 0, a: 0 },
    { x: 0, y: 0, a: 0 },
  ];

  private dark = false;
  private reduced = false;
  private ro: ResizeObserver;
  private mq: MediaQueryList;
  private rq: MediaQueryList;

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: ScaleCallbacks = {},
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.mq = matchMedia('(prefers-color-scheme: dark)');
    this.rq = matchMedia('(prefers-reduced-motion: reduce)');
    this.dark = this.mq.matches;
    this.reduced = this.rq.matches;
    this.mq.addEventListener('change', this.onScheme);
    this.rq.addEventListener('change', this.onMotion);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.mq.removeEventListener('change', this.onScheme);
    this.rq.removeEventListener('change', this.onMotion);
  }

  private onScheme = () => {
    this.dark = this.mq.matches;
    this.wake();
  };
  private onMotion = () => {
    this.reduced = this.rq.matches;
  };

  setDark(dark: boolean | null) {
    this.dark = dark ?? this.mq.matches;
    this.wake();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const W = Math.max(240, rect.width);
    const H = Math.max(200, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = W;
    this.H = H;
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.cx = W / 2;
    this.py = H * 0.15;
    this.R = Math.min(W * 0.34, H * 0.62, 190);
    this.L = H * 0.36;
    this.pw = Math.min(this.R * 0.98, 180);
    this.unit = this.pw / 150;
    this.needleLen = H * 0.5;
    for (const side of [0, 1] as const) {
      this.pans[side].px = this.attach(side, this.theta).x;
      this.pans[side].vx = 0;
    }
    this.relayout(false);
    this.draw();
  }

  // ---------- publieke API ----------

  setObject(obj: ScaleObject | null, drop = true) {
    this.object = obj;
    this.objectImg = null;
    if (obj?.image) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (this.object === obj) {
          this.objectImg = img;
          this.wake();
        }
      };
      img.src = obj.image;
    }
    this.objectAnim = obj && drop && !this.reduced ? { dy: -this.H * 0.9, vy: 0, dx: 0, landed: false, bounces: 0 } : null;
    if (obj && (!drop || this.reduced)) this.cb.onLand?.('object', -1, 0.6);
    this.wake();
  }

  /** Reset voor een nieuwe ronde: leeg, vergrendeld, horizontaal. */
  reset() {
    this.placed = [];
    this.slots = [];
    this.anims.clear();
    this.locked = true;
    this.target = 0;
    this.lockAnim = 1;
    this.settledNotified = true;
    this.relayout(false);
    this.wake();
  }

  addWeight(idx: number, from?: { x: number; y: number }): number {
    const id = this.nextId++;
    this.placed.push({ id, idx });
    this.relayout(true);
    const slot = this.slots.find((s) => s.id === id);
    const a: ItemAnim = { dy: 0, vy: 0, dx: 0, landed: false, bounces: 0 };
    if (!this.reduced && slot) {
      if (from) {
        // laten vallen vanaf de plaats waar de vinger losliet
        const r = this.canvas.getBoundingClientRect();
        const local = this.toPanLocal(1, from.x - r.left, from.y - r.top);
        local.y -= this.L + this.pans[1].b;
        a.dy = Math.min(-12, local.y - slot.y + slot.h / 2);
        a.dx = Math.max(-this.pw, Math.min(this.pw, local.x - slot.x));
      } else {
        a.dy = -Math.max(50, this.H * 0.28);
      }
    } else {
      this.landWeight(idx, 0.4);
      a.landed = true;
    }
    this.anims.set(id, a);
    this.wake();
    return id;
  }

  /** Verwijdert een specifiek gewicht. Geeft de index terug. */
  removeWeight(id: number): number | undefined {
    const i = this.placed.findIndex((p) => p.id === id);
    if (i < 0) return undefined;
    const [p] = this.placed.splice(i, 1);
    this.anims.delete(id);
    this.relayout(true);
    this.pans[1].vb -= 60 * this.unit;
    this.wake();
    return p.idx;
  }

  /** Verwijdert het laatst gelegde gewicht van deze soort. */
  removeOne(idx: number): boolean {
    for (let i = this.placed.length - 1; i >= 0; i--) {
      if (this.placed[i].idx === idx) {
        this.removeWeight(this.placed[i].id);
        return true;
      }
    }
    return false;
  }

  clearWeights() {
    if (!this.placed.length) return;
    this.placed = [];
    this.anims.clear();
    this.relayout(false);
    this.pans[1].vb -= 120 * this.unit;
    this.wake();
  }

  /** Slot open en kantelen naar de gegeven hoek (graden, positief = voorwerp zakt). */
  unlock(tiltDeg: number) {
    this.locked = false;
    this.target = -tiltDeg * DEG;
    this.settledNotified = false;
    this.wake();
  }

  shake() {
    if (this.reduced) return;
    this.shakeT = 0.45;
    this.wake();
  }

  setDropHighlight(on: boolean) {
    this.highlightTarget = on ? 1 : 0;
    this.wake();
  }

  /** Welk gewicht ligt onder dit schermpunt (client-coördinaten)? */
  hitTest(clientX: number, clientY: number): number | null {
    const r = this.canvas.getBoundingClientRect();
    const p = this.toPanLocal(1, clientX - r.left, clientY - r.top);
    p.y -= this.L + this.pans[1].b;
    const pad = 6;
    for (let i = this.hitRects.length - 1; i >= 0; i--) {
      const h = this.hitRects[i];
      if (p.x >= h.x - pad && p.x <= h.x + h.w + pad && p.y >= h.y - pad && p.y <= h.y + h.h + pad) return h.id;
    }
    return null;
  }

  /** Ligt dit punt boven de rechterhelft van de balans? */
  isOverRightSide(clientX: number, clientY: number): boolean {
    const r = this.canvas.getBoundingClientRect();
    return clientX >= r.left + r.width * 0.5 && clientX <= r.right + 20 && clientY >= r.top - 40 && clientY <= r.bottom + 10;
  }

  // ---------- intern ----------

  private toPanLocal(side: 0 | 1, x: number, y: number) {
    const t = this.panXform[side];
    const dx = x - t.x;
    const dy = y - t.y;
    const c = Math.cos(-t.a);
    const s = Math.sin(-t.a);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  }

  private relayout(keepVisual: boolean) {
    const old = new Map(this.slots.map((s) => [s.id, s]));
    const { slots } = layoutStack(this.placed, this.unit * 1.25, this.pw, this.H * 0.42);
    this.slots = slots;
    if (keepVisual) {
      for (const s of slots) {
        const o = old.get(s.id);
        const a = this.anims.get(s.id);
        if (o && a) {
          a.dy += o.y - s.y;
          a.dx += o.x - s.x;
          if (a.dy < -1) a.landed = false;
        }
      }
    }
  }

  private landWeight(idx: number, strength: number) {
    // kleinere gewichten geven een kleiner duwtje
    const mass = 0.35 + (idx / 9) * 0.65;
    this.pans[1].vb += (90 + 160 * mass) * strength * this.unit;
    if (this.locked) this.omega += 0.25 * mass * strength;
    this.cb.onLand?.('weight', idx, strength);
  }

  private wake() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1; // tab was verborgen
    this.acc += dt;
    while (this.acc >= STEP) {
      this.step(STEP);
      this.acc -= STEP;
    }
    this.draw();
    if (this.isSettled()) {
      this.running = false;
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private attach(side: 0 | 1, theta: number) {
    const s = side === 0 ? -1 : 1;
    return { x: this.cx + s * this.R * Math.cos(theta), y: this.py + s * this.R * Math.sin(theta) };
  }

  private step(dt: number) {
    // Balk
    const k = this.locked ? 900 : 26;
    const c = this.locked ? 38 : this.reduced ? 12 : 2.4;
    const alpha = -k * (this.theta - this.target) - c * this.omega;
    this.omega += alpha * dt;
    this.theta += this.omega * dt;

    // Slot
    const lockGoal = this.locked ? 1 : 0;
    this.lockAnim += (lockGoal - this.lockAnim) * Math.min(1, dt * (this.locked ? 14 : 5));

    // Wijzer: eigen veer, aangedreven door de hoekversnelling van de balk
    const kn = 420;
    const cn = this.reduced ? 40 : 7;
    const an = -kn * this.needle - cn * this.needleV - alpha * 0.9;
    this.needleV += an * dt;
    this.needle += this.needleV * dt;

    // Schalen: slinger + verticale veer
    const G = 2200;
    for (const side of [0, 1] as const) {
      const p = this.pans[side];
      const a = this.attach(side, this.theta);
      const vx = (a.x - p.px) / dt;
      const ax = (vx - p.vx) / dt;
      p.px = a.x;
      p.vx = vx;
      // begrens schokken (eerste frame / resize)
      p.ax = Math.max(-6000, Math.min(6000, ax));
      const damp = this.reduced ? 8 : 1.5;
      // φ > 0 = schaal naar links; versnelt het ophangpunt naar rechts, dan blijft de schaal achter.
      const wdot = -(G / this.L) * Math.sin(p.phi) + (p.ax / this.L) * Math.cos(p.phi) - damp * p.w;
      p.w += wdot * dt;
      p.phi += p.w * dt;
      p.phi = Math.max(-0.5, Math.min(0.5, p.phi));
      const bdd = -520 * p.b - (this.reduced ? 50 : 16) * p.vb;
      p.vb += bdd * dt;
      p.b += p.vb * dt;
    }

    // Vallend voorwerp
    const g = 2600;
    if (this.objectAnim && !this.objectAnim.landed) {
      const o = this.objectAnim;
      o.vy += g * dt;
      o.dy += o.vy * dt;
      if (o.dy >= 0) {
        o.dy = 0;
        const impact = Math.min(1, o.vy / 1400);
        if (o.bounces === 0) {
          this.pans[0].vb += 260 * impact * this.unit;
          this.omega -= 0.5 * impact;
          this.cb.onLand?.('object', -1, impact);
        }
        if (o.vy > 260 && o.bounces < 2) {
          o.vy = -o.vy * 0.22;
          o.bounces++;
        } else {
          o.vy = 0;
          o.landed = true;
        }
      }
    }

    // Vallende / verschuivende gewichten
    for (const [id, a] of this.anims) {
      a.dx += -a.dx * Math.min(1, dt * 14);
      if (a.landed) continue;
      if (a.dy > 0) {
        // moet omhoog (er kwam iets onder): snel bijtrekken
        a.dy += -a.dy * Math.min(1, dt * 18);
        if (a.dy < 0.3) {
          a.dy = 0;
          a.landed = true;
        }
        continue;
      }
      a.vy += g * dt;
      a.dy += a.vy * dt;
      if (a.dy >= 0) {
        a.dy = 0;
        const slot = this.slots.find((s) => s.id === id);
        const strength = Math.min(1, a.vy / 1100);
        if (a.bounces === 0 && slot) this.landWeight(slot.idx, Math.max(0.15, strength));
        if (a.vy > 220 && a.bounces < 2) {
          a.vy = -a.vy * 0.25;
          a.bounces++;
        } else {
          a.vy = 0;
          a.landed = true;
        }
      }
    }

    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    this.highlight += (this.highlightTarget - this.highlight) * Math.min(1, dt * 12);

    if (!this.settledNotified && !this.locked && Math.abs(this.theta - this.target) < 0.01 && Math.abs(this.omega) < 0.05) {
      this.settledNotified = true;
      this.cb.onSettled?.();
    }
  }

  private isSettled(): boolean {
    const eps = 1e-3;
    if (Math.abs(this.theta - this.target) > eps || Math.abs(this.omega) > eps) return false;
    if (Math.abs(this.needle) > eps || Math.abs(this.needleV) > eps * 10) return false;
    for (const p of this.pans) if (Math.abs(p.phi) > eps || Math.abs(p.w) > eps * 10 || Math.abs(p.b) > 0.05 || Math.abs(p.vb) > 0.5) return false;
    if (this.objectAnim && !this.objectAnim.landed) return false;
    for (const a of this.anims.values()) if (!a.landed || Math.abs(a.dx) > 0.2) return false;
    if (Math.abs(this.lockAnim - (this.locked ? 1 : 0)) > 0.005) return false;
    if (this.shakeT > 0) return false;
    if (Math.abs(this.highlight - this.highlightTarget) > 0.01) return false;
    return true;
  }

  // ---------- tekenen ----------

  private palette() {
    return this.dark
      ? {
          shadow: 'rgba(0,0,0,0.45)',
          woodA: '#4a2f1d',
          woodB: '#6b4529',
          woodC: '#2f1d12',
          iron: '#18181b',
          ironHi: '#3a3a40',
          dial: '#1f1a12',
          tick: '#d9c48a',
          glow: 'rgba(240,196,90,',
        }
      : {
          shadow: 'rgba(60,40,20,0.18)',
          woodA: '#8a5a33',
          woodB: '#b07a48',
          woodC: '#5e3a1f',
          iron: '#26262a',
          ironHi: '#55555c',
          dial: '#f7efd9',
          tick: '#5a4520',
          glow: 'rgba(214,160,40,',
        };
  }

  private brass(x0: number, y0: number, x1: number, y1: number) {
    const g = this.ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#8c6a1f');
    g.addColorStop(0.35, '#e9cf7e');
    g.addColorStop(0.5, '#fbeec0');
    g.addColorStop(0.7, '#c99a2e');
    g.addColorStop(1, '#7a5a18');
    return g;
  }

  private draw() {
    const ctx = this.ctx;
    const P = this.palette();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);

    let sx = 0;
    if (this.shakeT > 0) sx = Math.sin(this.shakeT * 60) * 6 * (this.shakeT / 0.45);
    ctx.translate(sx, 0);

    const { cx, py, H } = this;
    const baseY = H - 14;
    const baseW = Math.min(this.W * 0.5, 230);

    // schaduw op de "tafel"
    ctx.fillStyle = P.shadow;
    ctx.beginPath();
    ctx.ellipse(cx, baseY + 6, baseW * 0.62, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // houten sokkel
    const sockH = 20;
    const wg = ctx.createLinearGradient(0, baseY - sockH, 0, baseY);
    wg.addColorStop(0, P.woodB);
    wg.addColorStop(0.55, P.woodA);
    wg.addColorStop(1, P.woodC);
    ctx.fillStyle = wg;
    this.roundRect(cx - baseW / 2, baseY - sockH, baseW, sockH, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - baseW / 2 + 8, baseY - sockH + i * 5);
      ctx.bezierCurveTo(cx - 20, baseY - sockH + i * 5 + 2, cx + 30, baseY - sockH + i * 5 - 2, cx + baseW / 2 - 8, baseY - sockH + i * 5);
      ctx.stroke();
    }
    // messing voetplaat
    ctx.fillStyle = this.brass(cx - 34, 0, cx + 34, 0);
    this.roundRect(cx - 34, baseY - sockH - 7, 68, 8, 3);
    ctx.fill();

    // gietijzeren zuil
    const colTop = py + 6;
    const colBot = baseY - sockH - 6;
    const cg = ctx.createLinearGradient(cx - 9, 0, cx + 9, 0);
    cg.addColorStop(0, P.iron);
    cg.addColorStop(0.4, P.ironHi);
    cg.addColorStop(1, P.iron);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(cx - 5, colTop);
    ctx.lineTo(cx + 5, colTop);
    ctx.lineTo(cx + 9, colBot);
    ctx.lineTo(cx - 9, colBot);
    ctx.closePath();
    ctx.fill();

    // wijzerplaat
    const dialR = this.needleLen;
    const dialSpan = 26 * DEG;
    ctx.save();
    ctx.translate(cx, py);
    ctx.beginPath();
    ctx.arc(0, 0, dialR + 8, Math.PI / 2 - dialSpan, Math.PI / 2 + dialSpan);
    ctx.arc(0, 0, dialR - 14, Math.PI / 2 + dialSpan, Math.PI / 2 - dialSpan, true);
    ctx.closePath();
    ctx.fillStyle = P.dial;
    ctx.fill();
    ctx.strokeStyle = this.brass(-40, 0, 40, 0);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = P.tick;
    for (let d = -22; d <= 22; d += 2) {
      const a = Math.PI / 2 + d * DEG;
      const len = d === 0 ? 12 : d % 10 === 0 ? 9 : 5;
      ctx.lineWidth = d === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (dialR + 4), Math.sin(a) * (dialR + 4));
      ctx.lineTo(Math.cos(a) * (dialR + 4 - len), Math.sin(a) * (dialR + 4 - len));
      ctx.stroke();
    }
    ctx.restore();

    // pannen (achter de balk getekend, kettingen hangen eraan)
    const theta = this.theta;
    for (const side of [0, 1] as const) this.drawPan(side, theta);

    // wijzer
    const na = theta + this.needle;
    ctx.save();
    ctx.translate(cx, py);
    ctx.rotate(na);
    ctx.fillStyle = '#1b1b1d';
    ctx.beginPath();
    ctx.moveTo(-2.5, 0);
    ctx.lineTo(2.5, 0);
    ctx.lineTo(0.8, dialR + 2);
    ctx.lineTo(-0.8, dialR + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(-2, dialR - 12);
    ctx.lineTo(2, dialR - 12);
    ctx.lineTo(0, dialR + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // balk
    ctx.save();
    ctx.translate(cx, py);
    ctx.rotate(theta);
    const R = this.R;
    ctx.fillStyle = this.brass(0, -7, 0, 7);
    ctx.beginPath();
    ctx.moveTo(-R, -2.5);
    ctx.quadraticCurveTo(-R * 0.3, -4, 0, -8);
    ctx.quadraticCurveTo(R * 0.3, -4, R, -2.5);
    ctx.lineTo(R, 2.5);
    ctx.quadraticCurveTo(R * 0.3, 4, 0, 7);
    ctx.quadraticCurveTo(-R * 0.3, 4, -R, 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,55,10,0.55)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // eindknoppen
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * R, 0, 5, 0, Math.PI * 2);
      ctx.fillStyle = this.brass(s * R - 5, -5, s * R + 5, 5);
      ctx.fill();
    }
    ctx.restore();

    // spil
    ctx.beginPath();
    ctx.arc(cx, py, 9, 0, Math.PI * 2);
    ctx.fillStyle = this.brass(cx - 9, py - 9, cx + 9, py + 9);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, py, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#3a2a08';
    ctx.fill();

    // slot
    if (this.lockAnim > 0.01) this.drawLock(this.lockAnim);
  }

  private drawPan(side: 0 | 1, theta: number) {
    const ctx = this.ctx;
    const p = this.pans[side];
    const a = this.attach(side, theta);
    const L = this.L + p.b;
    const pw = this.pw;
    this.panXform[side] = { x: a.x, y: a.y, a: p.phi };
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(p.phi);

    // kettingen
    ctx.lineCap = 'round';
    for (const s of [-1, 0, 1]) {
      const ex = s * pw * 0.46;
      const ey = L - 2;
      ctx.strokeStyle = s === 0 ? 'rgba(120,90,30,0.45)' : '#8c6a1f';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([3.2, 2.2]);
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,190,0.7)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // haak
    ctx.strokeStyle = this.brass(-5, 0, 5, 0);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 3, 4, Math.PI * 1.1, Math.PI * 2.9);
    ctx.stroke();

    ctx.translate(0, L);
    // markeer de rechterschaal tijdens slepen
    if (side === 1 && this.highlight > 0.01) {
      ctx.fillStyle = `${this.palette().glow}${0.28 * this.highlight})`;
      ctx.beginPath();
      ctx.ellipse(0, -pw * 0.22, pw * 0.62, pw * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // inhoud
    if (side === 0) this.drawObject();
    else this.drawWeights();

    // schaal (messing kom)
    const dish = 16 * this.unit;
    ctx.beginPath();
    ctx.moveTo(-pw / 2, 0);
    ctx.bezierCurveTo(-pw * 0.42, dish * 1.4, pw * 0.42, dish * 1.4, pw / 2, 0);
    ctx.closePath();
    ctx.fillStyle = this.brass(-pw / 2, 0, pw / 2, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, pw / 2, 3.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#d9b75a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,10,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private drawObject() {
    if (!this.object) return;
    const ctx = this.ctx;
    const size = Math.min(92, this.pw * 0.62);
    const o = this.objectAnim;
    const dy = o ? o.dy : 0;
    // squash bij landing
    let sy = 1;
    if (o && o.landed === false && dy > -4 && o.vy > 0) sy = 0.92;
    const sxs = 1 / sy;
    ctx.save();
    ctx.translate(0, dy - 1);
    ctx.scale(sxs, sy);
    if (this.objectImg) {
      const s = size * 1.15;
      ctx.drawImage(this.objectImg, -s / 2, -s, s, s);
    } else {
      const img = emojiSprite(this.object.emoji, size, this.dpr);
      const s = size * 1.25;
      ctx.drawImage(img, -s / 2, -s + size * 0.12, s, s);
    }
    ctx.restore();
  }

  private drawWeights() {
    const ctx = this.ctx;
    this.hitRects = [];
    for (const s of this.slots) {
      const a = this.anims.get(s.id);
      const x = s.x + (a?.dx ?? 0);
      const y = s.y + (a?.dy ?? 0);
      const zoom = s.w / WEIGHT_SIZE[s.idx][0];
      const sp = weightSprite(s.idx, zoom, this.dpr);
      const k = zoom;
      ctx.drawImage(sp.img, x - sp.ox * k, y - sp.oy * k, sp.img.width * sp.scale * k, sp.img.height * sp.scale * k);
      this.hitRects.push({ id: s.id, x: x - s.w / 2, y: y - s.h * 1.3, w: s.w, h: s.h * 1.3 });
    }
  }

  private drawLock(t: number) {
    const ctx = this.ctx;
    const { cx, py } = this;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 1.4);
    // pin door de balk: beugel vanaf de zuil
    const lift = (1 - t) * 26;
    ctx.translate(cx, py + 22 - lift * 0.3);
    // slotlichaam
    const bw = 22;
    const bh = 17;
    ctx.fillStyle = this.brass(-bw / 2, 0, bw / 2, 0);
    this.roundRect(-bw / 2, 0, bw, bh, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,45,5,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // beugel (gaat open)
    ctx.strokeStyle = '#6d6d75';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const open = (1 - t) * 8;
    ctx.moveTo(-6, 1);
    ctx.lineTo(-6, -6 - open);
    ctx.arc(0, -6 - open, 6, Math.PI, 0);
    ctx.lineTo(6, -6 - open + (t > 0.9 ? 7 - open : 0));
    ctx.stroke();
    // sleutelgat
    ctx.fillStyle = '#3a2a08';
    ctx.beginPath();
    ctx.arc(0, 7, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-1, 7, 2, 5);
    ctx.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
