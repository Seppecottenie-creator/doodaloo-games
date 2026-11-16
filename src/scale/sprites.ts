import { WEIGHTS } from '../game/config';
import { weightLabel } from '../game/format';

/** Basisafmeting (CSS px bij een schaal van 150 px breed) per gewicht, van 1 g tot 1000 t. */
export const WEIGHT_SIZE: readonly [number, number][] = [
  [11, 15], // 1 g     messing knopje
  [15, 20], // 10 g
  [21, 27], // 100 g
  [30, 27], // 1 kg    gietijzer met hengsel
  [40, 30], // 10 kg   gietijzeren blok
  [52, 34], // 100 kg  blok met ring
  [62, 38], // 1 t     betonblok met haak
  [78, 38], // 10 t    staal met waarschuwingsstrepen
  [104, 40], // 100 t  zeecontainer
  [130, 50], // 1000 t grote container met kraanhaak
];

/** Extra ruimte boven het lichaam voor hengsels en haken (in fracties van de hoogte). */
const TOP_PAD = 0.45;

type Ctx = CanvasRenderingContext2D;

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hGrad(ctx: Ctx, x: number, w: number, stops: string[]) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

const BRASS = ['#7a5a18', '#c99a2e', '#f6e2a0', '#d4ad48', '#8c6a1f'];
const IRON = ['#232326', '#4b4b52', '#7c7c86', '#4a4a51', '#1e1e21'];
const STEEL = ['#5d6670', '#a9b3bd', '#e5ebf0', '#9aa4ae', '#555e67'];

function label(ctx: Ctx, text: string, cx: number, cy: number, size: number, color: string, shadow?: string) {
  ctx.font = `700 ${size}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (shadow) {
    ctx.fillStyle = shadow;
    ctx.fillText(text, cx, cy + 0.8);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy);
}

/** Tekent één gewicht met de onderkant in het midden op (0, 0). */
export function drawWeight(ctx: Ctx, idx: number, w: number, h: number) {
  const x = -w / 2;
  const text = weightLabel(WEIGHTS[idx]);
  ctx.save();
  if (idx <= 2) {
    // Messing knopgewicht: cilinder, hals en bolletje.
    const bh = h * 0.62;
    ctx.fillStyle = hGrad(ctx, x, w, BRASS);
    rrect(ctx, x, -bh, w, bh, w * 0.12);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,190,0.55)';
    ctx.fillRect(x + w * 0.08, -bh + 1, w * 0.84, Math.max(1, h * 0.05));
    const nw = w * 0.34;
    ctx.fillStyle = hGrad(ctx, -nw / 2, nw, BRASS);
    ctx.fillRect(-nw / 2, -h * 0.78, nw, h * 0.18);
    const kr = w * 0.27;
    ctx.beginPath();
    ctx.arc(0, -h + kr, kr, 0, Math.PI * 2);
    const rg = ctx.createRadialGradient(-kr * 0.4, -h + kr * 0.6, kr * 0.1, 0, -h + kr, kr);
    rg.addColorStop(0, '#fff4c8');
    rg.addColorStop(0.5, '#d4ad48');
    rg.addColorStop(1, '#7a5a18');
    ctx.fillStyle = rg;
    ctx.fill();
    if (w >= 20) label(ctx, text.replace(' ', ''), 0, -bh / 2, Math.max(6, w * 0.3), '#5b4310', 'rgba(255,240,190,0.6)');
  } else if (idx === 3) {
    // 1 kg: klokvormig gietijzer met hengsel.
    ctx.strokeStyle = '#2e2e33';
    ctx.lineWidth = Math.max(2, w * 0.1);
    ctx.beginPath();
    ctx.arc(0, -h * 0.72, w * 0.24, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = hGrad(ctx, x, w, IRON);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + w * 0.16, -h * 0.72);
    ctx.lineTo(x + w * 0.84, -h * 0.72);
    ctx.lineTo(x + w, 0);
    ctx.closePath();
    ctx.fill();
    label(ctx, '1kg', 0, -h * 0.34, w * 0.26, '#a9a9b3', 'rgba(0,0,0,0.6)');
  } else if (idx === 4 || idx === 5) {
    // 10 kg / 100 kg: gietijzeren blok met hengsel of ring.
    const bh = h * 0.74;
    if (idx === 4) {
      ctx.fillStyle = '#2b2b30';
      ctx.fillRect(-w * 0.28, -h, w * 0.08, h - bh + 2);
      ctx.fillRect(w * 0.2, -h, w * 0.08, h - bh + 2);
      ctx.fillStyle = hGrad(ctx, -w * 0.3, w * 0.6, IRON);
      rrect(ctx, -w * 0.3, -h, w * 0.6, h * 0.1, 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#3a3a40';
      ctx.lineWidth = w * 0.06;
      ctx.beginPath();
      ctx.arc(0, -bh - h * 0.12, h * 0.14, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = hGrad(ctx, x, w, IRON);
    rrect(ctx, x, -bh, w, bh, w * 0.08);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 2, -bh + 2, w - 4, 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    rrect(ctx, x + w * 0.1, -bh + bh * 0.2, w * 0.8, bh * 0.6, 3);
    ctx.stroke();
    label(ctx, text.replace(' ', ''), 0, -bh / 2, Math.min(bh * 0.42, w * 0.24), '#b3b3bd', 'rgba(0,0,0,0.6)');
  } else if (idx === 6) {
    // 1 t: betonblok met hijsoog.
    const bh = h * 0.78;
    ctx.strokeStyle = STEEL[1];
    ctx.lineWidth = Math.max(2, w * 0.05);
    ctx.beginPath();
    ctx.arc(0, -bh - h * 0.1, h * 0.12, Math.PI * 0.95, Math.PI * 2.05);
    ctx.stroke();
    ctx.fillStyle = hGrad(ctx, x, w, ['#7d7c76', '#b3b2aa', '#c9c8c0', '#a3a29a', '#74736d']);
    rrect(ctx, x, -bh, w, bh, 3);
    ctx.fill();
    // spikkels
    let s = 7;
    ctx.fillStyle = 'rgba(60,60,55,0.35)';
    for (let i = 0; i < 26; i++) {
      s = (s * 9301 + 49297) % 233280;
      const px = x + 3 + (s / 233280) * (w - 6);
      s = (s * 9301 + 49297) % 233280;
      const py = -bh + 3 + (s / 233280) * (bh - 6);
      ctx.fillRect(px, py, 1.4, 1.4);
    }
    label(ctx, '1 t', 0, -bh / 2, bh * 0.42, '#4b4a45', 'rgba(255,255,255,0.4)');
  } else if (idx === 7) {
    // 10 t: geverfd staal met waarschuwingsstrepen.
    const bh = h * 0.8;
    ctx.fillStyle = '#3c4249';
    ctx.fillRect(-w * 0.3, -h, w * 0.1, h - bh + 1);
    ctx.fillRect(w * 0.2, -h, w * 0.1, h - bh + 1);
    ctx.fillStyle = hGrad(ctx, x, w, ['#2f4f5c', '#4f7a8a', '#6e98a6', '#4a7382', '#2b4853']);
    rrect(ctx, x, -bh, w, bh, 3);
    ctx.fill();
    ctx.save();
    rrect(ctx, x, -bh * 0.32, w, bh * 0.32, 3);
    ctx.clip();
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(x, -bh * 0.32, w, bh * 0.32);
    ctx.fillStyle = '#1d1d1d';
    for (let i = -2; i < w / 8 + 2; i++) {
      ctx.beginPath();
      const sx = x + i * 10;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx + 5, 0);
      ctx.lineTo(sx + 5 + bh * 0.32, -bh * 0.32);
      ctx.lineTo(sx + bh * 0.32, -bh * 0.32);
      ctx.fill();
    }
    ctx.restore();
    label(ctx, '10 t', 0, -bh * 0.64, bh * 0.38, '#f3f6f8', 'rgba(0,0,0,0.5)');
  } else {
    // 100 t / 1000 t: zeecontainer (1000 t met kraanhaak).
    const big = idx === 9;
    const bh = big ? h * 0.8 : h;
    if (big) {
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.2, -bh);
      ctx.lineTo(0, -h + 4);
      ctx.lineTo(x + w * 0.8, -bh);
      ctx.stroke();
      ctx.strokeStyle = '#d9a91c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -h + 6, 4, Math.PI * 1.1, Math.PI * 2.4);
      ctx.stroke();
    }
    const col = big
      ? ['#173b4f', '#2c6681', '#3e7d99', '#2a627c', '#163647']
      : ['#7e2416', '#b5432f', '#cf5a42', '#ad3f2b', '#76200f'];
    ctx.fillStyle = hGrad(ctx, x, w, col);
    ctx.fillRect(x, -bh, w, bh);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    const ribs = Math.round(w / 6);
    for (let i = 1; i < ribs; i++) ctx.fillRect(x + (i * w) / ribs - 0.6, -bh + 3, 1.2, bh - 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, -bh + 1, w - 2, bh - 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rrect(ctx, -w * 0.24, -bh * 0.68, w * 0.48, bh * 0.36, 2);
    ctx.fill();
    label(ctx, text, 0, -bh * 0.5, bh * 0.3, '#ffffff');
  }
  ctx.restore();
}

/** Offscreen sprites zodat we per frame alleen drawImage doen. */
const cache = new Map<string, HTMLCanvasElement>();

export function weightSprite(idx: number, unit: number, dpr: number): { img: HTMLCanvasElement; ox: number; oy: number; scale: number } {
  const [bw, bh] = WEIGHT_SIZE[idx];
  const res = Math.min(3, dpr * Math.max(unit, 0.6));
  const key = `${idx}@${res.toFixed(2)}`;
  const pad = bh * TOP_PAD;
  let img = cache.get(key);
  if (!img) {
    img = document.createElement('canvas');
    img.width = Math.ceil((bw + 4) * res);
    img.height = Math.ceil((bh + pad + 4) * res);
    const c = img.getContext('2d')!;
    c.scale(res, res);
    c.translate((bw + 4) / 2, bh + pad + 2);
    drawWeight(c, idx, bw, bh);
    cache.set(key, img);
  }
  return { img, ox: (bw + 4) / 2, oy: bh + pad + 2, scale: 1 / res };
}

/** Teken een gewicht op een klein canvas (voor de lade en de sleep-ghost). */
export function paintWeightIcon(canvas: HTMLCanvasElement, idx: number, cssW: number, cssH: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const c = canvas.getContext('2d')!;
  const [bw, bh] = WEIGHT_SIZE[idx];
  const totalH = bh * (1 + TOP_PAD);
  const k = Math.min((cssW - 6) / bw, (cssH - 6) / totalH, 1.6);
  c.scale(dpr, dpr);
  c.translate(cssW / 2, cssH / 2 + (totalH * k) / 2 - bh * TOP_PAD * k * 0.15);
  c.scale(k, k);
  drawWeight(c, idx, bw, bh);
}

const emojiCache = new Map<string, HTMLCanvasElement>();

/** Emoji als sprite (fillText met emoji is traag op Android). */
export function emojiSprite(emoji: string, size: number, dpr: number): HTMLCanvasElement {
  const key = `${emoji}@${size}@${dpr}`;
  let img = emojiCache.get(key);
  if (!img) {
    img = document.createElement('canvas');
    const px = Math.ceil(size * 1.25 * dpr);
    img.width = px;
    img.height = px;
    const c = img.getContext('2d')!;
    c.scale(dpr, dpr);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    c.fillText(emoji, (size * 1.25) / 2, (size * 1.25) / 2 + size * 0.06);
    emojiCache.set(key, img);
  }
  return img;
}
