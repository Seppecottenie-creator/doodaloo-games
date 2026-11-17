import {
  ACESFilmicToneMapping,
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  LatheGeometry,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BalancePhysics, dropSettled, stepDrop, type Drop } from './physics';
import { layoutStack, type Placed, type Slot } from './layout';
import { WEIGHT_SIZE } from './sprites';
import { weightLabel } from '../game/format';
import { WEIGHTS, WEIGHT_SPECS } from '../game/config';
import type { Mood, ScaleCallbacks, ScaleLike, ScaleObject } from './types';

const STEP = 1 / 120;
const DEG = Math.PI / 180;

// Afmetingen (meter)
const PIVOT_Y = 2.25;
const HEAD_Y = PIVOT_Y + 0.42;
/** Zoveel exemplaren van één gewicht tonen we; de rest staat als ×N-label bij de stapel. */
const VISIBLE_PER_KIND = 4;
const R = 1.42;
const L = 1.2;
const PAN_R = 0.64;
const NEEDLE = 1.15;
/** meter per "px" uit WEIGHT_SIZE */
const M = ((PAN_R * 2) / 150) * 1.9;
const GRAVITY = 22;

// ---------- materialen & texturen ----------

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function woodTexture() {
  return canvasTex(512, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#6b4226');
    g.addColorStop(1, '#4a2b17');
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 128);
    let s = 3;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      c.strokeStyle = `rgba(${rnd() > 0.5 ? '30,15,5' : '140,90,50'},${0.12 + rnd() * 0.2})`;
      c.lineWidth = 0.6 + rnd() * 1.6;
      const y = rnd() * 128;
      c.beginPath();
      c.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) c.lineTo(x, y + Math.sin(x / 60 + i) * 3 + (rnd() - 0.5) * 2);
      c.stroke();
    }
  });
}

function labelTexture(text: string, bg: string | null, fg: string, w = 256, h = 128, opts: { stripes?: boolean; ribs?: boolean } = {}) {
  return canvasTex(w, h, (c) => {
    if (bg) {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
    }
    if (opts.ribs) {
      for (let x = 0; x < w; x += 10) {
        c.fillStyle = 'rgba(0,0,0,0.22)';
        c.fillRect(x, 6, 3, h - 12);
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.fillRect(x + 4, 6, 2, h - 12);
      }
      c.strokeStyle = 'rgba(0,0,0,0.45)';
      c.lineWidth = 8;
      c.strokeRect(0, 0, w, h);
    }
    if (opts.stripes) {
      const bh = h * 0.3;
      c.fillStyle = '#f2c230';
      c.fillRect(0, h - bh, w, bh);
      c.fillStyle = '#151515';
      for (let x = -bh; x < w + bh; x += 28) {
        c.beginPath();
        c.moveTo(x, h);
        c.lineTo(x + 14, h);
        c.lineTo(x + 14 + bh, h - bh);
        c.lineTo(x + bh, h - bh);
        c.fill();
      }
    }
    c.font = `800 ${Math.round(h * 0.34)}px Inter, system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillText(text, w / 2, (opts.stripes ? h * 0.38 : h / 2) + 2);
    c.fillStyle = fg;
    c.fillText(text, w / 2, opts.stripes ? h * 0.38 : h / 2);
  });
}

function shadowBlobTexture() {
  return canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
}

/** Emoji als goudkleurig beeldje: één consistente stijl voor alles zonder foto (o.a. verzonnen personages). */
function emojiTexture(emoji: string) {
  return canvasTex(512, 512, (c) => {
    const shape = document.createElement('canvas');
    shape.width = shape.height = 512;
    const s = shape.getContext('2d')!;
    s.font = '380px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    s.textAlign = 'center';
    s.textBaseline = 'middle';
    s.fillText(emoji, 256, 280);
    // lichtheid van de emoji bewaren als reliëf, kleur vervangen door messing
    const img = s.getImageData(0, 0, 512, 512);
    const d = img.data;
    for (let k = 0; k < d.length; k += 4) {
      if (!d[k + 3]) continue;
      const l = (0.3 * d[k] + 0.59 * d[k + 1] + 0.11 * d[k + 2]) / 255;
      const t = 0.25 + l * 0.85;
      d[k] = Math.min(255, 70 + 200 * t);
      d[k + 1] = Math.min(255, 45 + 150 * t);
      d[k + 2] = Math.min(255, 10 + 60 * t);
    }
    s.putImageData(img, 0, 0);
    // glans van boven
    s.globalCompositeOperation = 'source-atop';
    const g = s.createLinearGradient(0, 60, 0, 470);
    g.addColorStop(0, 'rgba(255,245,200,0.55)');
    g.addColorStop(0.45, 'rgba(255,220,120,0)');
    g.addColorStop(1, 'rgba(40,20,0,0.45)');
    s.fillStyle = g;
    s.fillRect(0, 0, 512, 512);
    c.shadowColor = 'rgba(255,190,70,0.35)';
    c.shadowBlur = 18;
    c.drawImage(shape, 0, 0);
  });
}

class Mats {
  brass = new MeshStandardMaterial({ color: 0xd9ad4a, metalness: 1, roughness: 0.22 });
  brassRight = new MeshStandardMaterial({ color: 0xd9ad4a, metalness: 1, roughness: 0.22, emissive: 0xffb43a, emissiveIntensity: 0 });
  darkBrass = new MeshStandardMaterial({ color: 0x9c7424, metalness: 1, roughness: 0.35 });
  iron = new MeshStandardMaterial({ color: 0x2d2e33, metalness: 0.65, roughness: 0.5 });
  ironDark = new MeshStandardMaterial({ color: 0x1a1b1f, metalness: 0.6, roughness: 0.55 });
  steel = new MeshStandardMaterial({ color: 0xb8c0c8, metalness: 1, roughness: 0.3 });
  concrete = new MeshStandardMaterial({ color: 0xa3a29b, metalness: 0, roughness: 0.95 });
  wood = new MeshStandardMaterial({ map: woodTexture(), roughness: 0.55, metalness: 0 });
  dial = new MeshStandardMaterial({ color: 0xf2ead6, roughness: 0.6, metalness: 0, side: DoubleSide });
  tick = new MeshStandardMaterial({ color: 0x3a2e1a, roughness: 0.6 });
  red = new MeshStandardMaterial({ color: 0xd2382b, roughness: 0.4 });
  lockBrass = new MeshStandardMaterial({ color: 0xd9ad4a, metalness: 1, roughness: 0.25, transparent: true });
  lockSteel = new MeshStandardMaterial({ color: 0xb8c0c8, metalness: 1, roughness: 0.3, transparent: true });
  blob = new MeshBasicMaterial({ map: shadowBlobTexture(), transparent: true, depthWrite: false });
  white = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0 });
  black = new MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.2, metalness: 0 });
  mouth = new MeshStandardMaterial({ color: 0x2a0d08, roughness: 0.6 });
  cheek = new MeshBasicMaterial({ color: 0xff6b5a, transparent: true, opacity: 0 });
  safe = new MeshStandardMaterial({ color: 0x2f5a3e, metalness: 0.5, roughness: 0.4 });
  rubber = new MeshStandardMaterial({ color: 0x1c1c20, metalness: 0.1, roughness: 0.75 });
}

// ---------- gewichtmodellen ----------

function buildWeight(idx: number, mats: Mats): { group: Group; w: number; h: number } {
  const [pw, ph] = WEIGHT_SIZE[idx];
  const w = pw * M;
  const h = ph * M;
  const g = new Group();
  const add = (m: Mesh) => {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const label = (text: string, fg: string, fw: number, fh: number, y: number, z: number) => {
    const mat = new MeshStandardMaterial({ map: labelTexture(text, null, fg, 256, 128), transparent: true, roughness: 0.6, metalness: 0 });
    const m = new Mesh(new PlaneGeometry(fw, fh), mat);
    m.position.set(0, y, z);
    g.add(m);
  };
  const text = weightLabel(WEIGHTS[idx]);
  const compact = text.replace(' ', '');
  switch (WEIGHT_SPECS[idx].style) {
    case 'brass': {
      const bh = h * 0.62;
      add(new Mesh(new CylinderGeometry(w / 2, w / 2, bh, 28), mats.brass)).position.y = bh / 2;
      add(new Mesh(new CylinderGeometry(w * 0.17, w * 0.2, h * 0.16, 16), mats.brass)).position.y = bh + h * 0.08;
      const kr = w * 0.27;
      add(new Mesh(new SphereGeometry(kr, 20, 14), mats.brass)).position.y = h - kr;
      break;
    }
    case 'bell': {
      const bh = h * 0.72;
      add(new Mesh(new CylinderGeometry(w * 0.33, w / 2, bh, 28), mats.iron)).position.y = bh / 2;
      add(new Mesh(new TorusGeometry(w * 0.22, w * 0.055, 10, 24, Math.PI), mats.ironDark)).position.y = bh;
      label(compact, '#c9c9d2', w * 0.6, w * 0.3, bh * 0.45, w * 0.43);
      break;
    }
    case 'kettle': {
      // kettlebell: bol met een dikke greep
      const r = w / 2;
      const ball = add(new Mesh(new SphereGeometry(r, 28, 20), mats.iron));
      ball.position.y = r * 0.92;
      ball.scale.y = 0.92;
      const grip = add(new Mesh(new TorusGeometry(r * 0.55, r * 0.14, 12, 28, Math.PI), mats.ironDark));
      grip.position.y = r * 1.55;
      grip.scale.y = 1.2;
      label(compact, '#d0d0d8', w * 0.62, w * 0.3, r * 0.8, r * 0.98);
      break;
    }
    case 'block':
    case 'ring': {
      const bh = h * 0.74;
      const d = w * 0.58;
      add(new Mesh(new RoundedBoxGeometry(w, bh, d, 3, w * 0.07), mats.iron)).position.y = bh / 2;
      if (WEIGHT_SPECS[idx].style === 'block') {
        for (const sx of [-1, 1]) add(new Mesh(new BoxGeometry(w * 0.07, h - bh, w * 0.12), mats.ironDark)).position.set(sx * w * 0.24, bh + (h - bh) / 2, 0);
        const bar = add(new Mesh(new CylinderGeometry(w * 0.05, w * 0.05, w * 0.62, 12), mats.ironDark));
        bar.rotation.z = Math.PI / 2;
        bar.position.y = h - w * 0.04;
      } else {
        add(new Mesh(new TorusGeometry(h * 0.13, w * 0.03, 10, 24), mats.ironDark)).position.y = bh + h * 0.11;
      }
      label(compact, '#c9c9d2', w * 0.75, w * 0.32, bh * 0.5, d / 2 + 0.002);
      break;
    }
    case 'plate': {
      // halterschijf, plat neergelegd
      const disc = add(new Mesh(new CylinderGeometry(w / 2, w / 2, h * 0.8, 40), mats.rubber));
      disc.position.y = h * 0.4;
      const rim = add(new Mesh(new TorusGeometry(w / 2 - h * 0.1, h * 0.1, 8, 40), mats.ironDark));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = h * 0.8;
      const hub = add(new Mesh(new CylinderGeometry(w * 0.12, w * 0.12, h * 0.9, 24), mats.steel));
      hub.position.y = h * 0.45;
      const lab = new Mesh(new PlaneGeometry(w * 0.5, w * 0.2), new MeshStandardMaterial({ map: labelTexture(compact, null, '#f5c451', 256, 96), transparent: true }));
      lab.rotation.x = -Math.PI / 2;
      lab.position.set(0, h * 0.81, w * 0.3);
      g.add(lab);
      break;
    }
    case 'anvil': {
      // aambeeld: voet, taille, werkvlak met hoorn
      const foot = add(new Mesh(new BoxGeometry(w * 0.6, h * 0.25, w * 0.36), mats.ironDark));
      foot.position.y = h * 0.125;
      const waist = add(new Mesh(new BoxGeometry(w * 0.32, h * 0.35, w * 0.24), mats.iron));
      waist.position.y = h * 0.42;
      const top = add(new Mesh(new BoxGeometry(w * 0.7, h * 0.32, w * 0.34), mats.iron));
      top.position.set(w * 0.08, h * 0.76, 0);
      const horn = add(new Mesh(new CylinderGeometry(0.001, h * 0.16, w * 0.32, 20), mats.iron));
      horn.rotation.z = Math.PI / 2;
      horn.position.set(-w * 0.42, h * 0.8, 0);
      label(compact, '#c9c9d2', w * 0.42, w * 0.16, h * 0.76, w * 0.171);
      break;
    }
    case 'concrete': {
      const bh = h * 0.8;
      const d = w * 0.7;
      add(new Mesh(new RoundedBoxGeometry(w, bh, d, 2, w * 0.03), mats.concrete)).position.y = bh / 2;
      add(new Mesh(new TorusGeometry(h * 0.12, w * 0.03, 10, 24), mats.steel)).position.y = bh + h * 0.08;
      label(text, '#3f3e3a', w * 0.6, w * 0.3, bh * 0.5, d / 2 + 0.002);
      break;
    }
    case 'safe': {
      // cartoon-brandkast met draaischijf
      const d = w * 0.8;
      add(new Mesh(new RoundedBoxGeometry(w, h, d, 3, w * 0.05), mats.safe)).position.y = h / 2;
      const door = add(new Mesh(new BoxGeometry(w * 0.78, h * 0.78, 0.01), mats.ironDark));
      door.position.set(0, h / 2, d / 2 + 0.003);
      const dial = add(new Mesh(new CylinderGeometry(w * 0.13, w * 0.13, 0.03, 24), mats.brass));
      dial.rotation.x = Math.PI / 2;
      dial.position.set(-w * 0.1, h * 0.55, d / 2 + 0.02);
      const handle = add(new Mesh(new BoxGeometry(w * 0.05, h * 0.25, 0.03), mats.brass));
      handle.position.set(w * 0.22, h * 0.5, d / 2 + 0.02);
      label(text, '#f5c451', w * 0.5, w * 0.2, h * 0.2, d / 2 + 0.012);
      break;
    }
    case 'steel': {
      const bh = h * 0.82;
      const d = w * 0.6;
      const front = new MeshStandardMaterial({ map: labelTexture(text, '#3f6f80', '#f4f6f8', 256, 128, { stripes: true }), metalness: 0.4, roughness: 0.45 });
      const side = new MeshStandardMaterial({ color: 0x3f6f80, metalness: 0.4, roughness: 0.45 });
      add(new Mesh(new BoxGeometry(w, bh, d), [side, side, side, side, front, side])).position.y = bh / 2;
      for (const sx of [-1, 1]) add(new Mesh(new TorusGeometry(h * 0.1, w * 0.02, 8, 16, Math.PI), mats.steel)).position.set(sx * w * 0.3, bh, 0);
      break;
    }
    case 'container':
    case 'mega': {
      const big = WEIGHT_SPECS[idx].style === 'mega';
      const bh = big ? h * 0.82 : h;
      const d = w * 0.42;
      const color = big ? '#245d78' : '#b5432f';
      const front = new MeshStandardMaterial({ map: labelTexture(text, color, '#ffffff', 512, 192, { ribs: true }), metalness: 0.35, roughness: 0.5 });
      const side = new MeshStandardMaterial({ map: labelTexture('', color, '#fff', 256, 192, { ribs: true }), metalness: 0.35, roughness: 0.5 });
      const top = new MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.55 });
      add(new Mesh(new BoxGeometry(w, bh, d), [side, side, top, top, front, side])).position.y = bh / 2;
      if (big) {
        add(new Mesh(new TorusGeometry(h * 0.07, w * 0.012, 8, 20, Math.PI * 1.4), mats.brass)).position.y = h - h * 0.05;
        for (const sx of [-1, 1]) {
          const len = Math.hypot(w * 0.3, h - bh);
          const cable = add(new Mesh(new CylinderGeometry(w * 0.004, w * 0.004, len, 6), mats.ironDark));
          cable.position.set(sx * w * 0.15, bh + (h - bh) / 2 - h * 0.02, 0);
          cable.rotation.z = sx * Math.atan2(w * 0.3, h - bh);
        }
      }
      break;
    }
  }
  return { group: g, w, h };
}

function countTexture(n: number) {
  return canvasTex(160, 96, (c) => {
    c.fillStyle = '#f5c451';
    c.beginPath();
    if (c.roundRect) c.roundRect(4, 8, 152, 80, 40);
    else c.rect(4, 8, 152, 80);
    c.fill();
    c.font = '800 56px Inter, system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#141006';
    c.fillText(`×${n}`, 80, 50);
  });
}

function puffTexture() {
  return canvasTex(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(230,215,190,0.9)');
    g.addColorStop(1, 'rgba(230,215,190,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
}

interface Item {
  id: number;
  idx: number;
  obj: Group;
  drop: Drop;
  baseW: number;
}

interface Puff {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
}

/** Het gezicht van de balans: googly eyes, wenkbrauwen en een mond. */
class Face {
  group = new Group();
  private eyes: Group[] = [];
  private pupils: Mesh[] = [];
  private crosses: Group[] = [];
  private brows: Mesh[] = [];
  private mouths: Record<string, Mesh> = {};
  private cheeks: Mesh[] = [];
  pupil = new Vector2();
  pupilV = new Vector2();
  look = new Vector2();
  blinkT = 0;
  bob = 0;
  bobV = 0;
  wob = 0;
  wobV = 0;
  mood: Mood = 'idle';

  constructor(mats: Mats) {
    const g = this.group;
    const head = new Mesh(new SphereGeometry(0.27, 40, 28), mats.brass);
    head.scale.set(1.08, 0.94, 0.9);
    head.castShadow = true;
    g.add(head);
    for (const sx of [-1, 1]) {
      const eye = new Group();
      eye.position.set(sx * 0.105, 0.04, 0.2);
      const white = new Mesh(new SphereGeometry(0.088, 24, 18), mats.white);
      white.scale.z = 0.6;
      const pupil = new Mesh(new SphereGeometry(0.042, 16, 12), mats.black);
      pupil.position.z = 0.045;
      const cross = new Group();
      for (const a of [1, -1]) {
        const bar = new Mesh(new BoxGeometry(0.11, 0.022, 0.01), mats.black);
        bar.rotation.z = (a * Math.PI) / 4;
        cross.add(bar);
      }
      cross.position.z = 0.055;
      cross.visible = false;
      eye.add(white, pupil, cross);
      g.add(eye);
      this.eyes.push(eye);
      this.pupils.push(pupil);
      this.crosses.push(cross);
      const brow = new Mesh(new BoxGeometry(0.1, 0.022, 0.02), mats.ironDark);
      brow.position.set(sx * 0.105, 0.155, 0.215);
      g.add(brow);
      this.brows.push(brow);
      const cheek = new Mesh(new SphereGeometry(0.035, 12, 8), mats.cheek);
      cheek.scale.z = 0.3;
      cheek.position.set(sx * 0.19, -0.07, 0.2);
      g.add(cheek);
      this.cheeks.push(cheek);
    }
    const smile = new Mesh(new TorusGeometry(0.075, 0.016, 8, 24, Math.PI), mats.mouth);
    smile.rotation.z = Math.PI;
    const grin = new Mesh(new TorusGeometry(0.1, 0.024, 8, 24, Math.PI), mats.mouth);
    grin.rotation.z = Math.PI;
    const frown = new Mesh(new TorusGeometry(0.07, 0.016, 8, 24, Math.PI), mats.mouth);
    frown.position.y = -0.04;
    const o = new Mesh(new TorusGeometry(0.035, 0.016, 8, 20), mats.mouth);
    const flat = new Mesh(new BoxGeometry(0.11, 0.02, 0.02), mats.mouth);
    for (const [k, m] of Object.entries({ smile, grin, frown, o, flat })) {
      m.position.set(0, (m.position.y || 0) - 0.08, 0.235);
      g.add(m);
      this.mouths[k] = m;
    }
    this.apply();
  }

  setMood(m: Mood) {
    this.mood = m;
    this.apply();
  }

  private apply() {
    const m = this.mood;
    const mouth = { idle: 'smile', focus: 'flat', strain: 'frown', surprised: 'o', happy: 'grin', meh: 'flat', angry: 'frown', dead: 'o', smug: 'smile' }[m];
    for (const [k, mesh] of Object.entries(this.mouths)) mesh.visible = k === mouth;
    const dead = m === 'dead';
    this.pupils.forEach((p) => (p.visible = !dead));
    this.crosses.forEach((c) => (c.visible = dead));
    const browTilt = { angry: 0.45, strain: -0.3, surprised: 0, happy: -0.15, focus: 0.2, meh: 0.1, idle: 0, dead: 0, smug: 0.25 }[m];
    const browY = { surprised: 0.19, happy: 0.17, angry: 0.14, strain: 0.165, focus: 0.145, meh: 0.15, idle: 0.155, dead: 0.17, smug: 0.15 }[m];
    this.brows.forEach((b, i) => {
      const sx = i === 0 ? -1 : 1;
      b.rotation.z = -sx * browTilt;
      b.position.y = browY;
    });
    const blush = m === 'happy' || m === 'strain' || m === 'smug' ? 0.55 : 0;
    this.cheeks.forEach((c) => ((c.material as MeshBasicMaterial).opacity = blush));
  }

  /** Eén tijdstap: pupillen op een veer, hoofd dat stuitert. */
  step(dt: number) {
    const k = 260;
    const c = 9;
    const ax = -k * (this.pupil.x - this.look.x) - c * this.pupilV.x;
    const ay = -k * (this.pupil.y - this.look.y) - c * this.pupilV.y;
    this.pupilV.x += ax * dt;
    this.pupilV.y += ay * dt;
    this.pupil.x += this.pupilV.x * dt;
    this.pupil.y += this.pupilV.y * dt;
    const len = this.pupil.length();
    if (len > 1) this.pupil.multiplyScalar(1 / len);
    this.bobV += (-420 * this.bob - 11 * this.bobV) * dt;
    this.bob += this.bobV * dt;
    this.wobV += (-160 * this.wob - 6 * this.wobV) * dt;
    this.wob += this.wobV * dt;
    if (this.blinkT > 0) this.blinkT = Math.max(0, this.blinkT - dt);
  }

  jolt(strength: number) {
    this.bobV -= 4 * strength;
    this.wobV += (Math.random() - 0.5) * 6 * strength;
    this.pupilV.x += (Math.random() - 0.5) * 30 * strength;
    this.pupilV.y += 20 * strength;
  }

  sync() {
    this.pupils.forEach((p, i) => {
      p.position.x = this.pupil.x * 0.042 + (i === 0 ? 0.004 : -0.004);
      p.position.y = this.pupil.y * 0.042;
    });
    const blink = this.blinkT > 0 ? Math.abs(Math.sin((this.blinkT / 0.14) * Math.PI)) : 0;
    this.eyes.forEach((e) => (e.scale.y = 1 - blink * 0.9));
    this.group.scale.set(1 - this.bob * 0.6, 1 + this.bob, 1 - this.bob * 0.6);
    this.group.rotation.z = this.wob * 0.25;
  }

  settled() {
    return Math.abs(this.bob) < 1e-3 && Math.abs(this.bobV) < 1e-2 && Math.abs(this.wob) < 1e-3 && Math.abs(this.wobV) < 1e-2 && this.pupilV.length() < 1e-2 && this.pupil.distanceTo(this.look) < 1e-3 && this.blinkT === 0;
  }
}

export class ScaleView3D implements ScaleLike {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(26, 1, 0.1, 100);
  private mats = new Mats();
  private phys = new BalancePhysics(R, L);
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  private settledNotified = true;
  private reduced: boolean;
  private shakeT = 0;
  private kick = 0;
  private kickV = 0;
  private highlight = 0;
  private highlightTarget = 0;
  private camBase = new Vector3();
  private lookAtPt = new Vector3(0, 1.4, 0);

  // scene-onderdelen
  private beam = new Group();
  private panGroups: [Group, Group] = [new Group(), new Group()];
  private panInner: [Group, Group] = [new Group(), new Group()];
  private chains: [Group, Group] = [new Group(), new Group()];
  private needle = new Group();
  private lock = new Group();
  private shackle!: Mesh;
  private stack = new Group();
  private tags = new Group();
  private objectHolder = new Group();
  private objectMesh: Mesh | null = null;
  private objectDrop: Drop | null = null;
  private objectToken = 0;
  private face: Face;
  private puffs: Puff[] = [];
  private puffMat: SpriteMaterial;
  private blinkTimer = 0;
  private lookTarget: Vector3 | null = null;
  private lookUntil = 0;

  private items: Item[] = [];
  private slots: Slot[] = [];
  private nextId = 1;
  private templates = new Map<number, { group: Group; w: number; h: number }>();
  private countTex = new Map<number, CanvasTexture>();
  private ro: ResizeObserver;
  private raycaster = new Raycaster();
  private loader = new TextureLoader();

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: ScaleCallbacks = {},
  ) {
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.phys.reduced = this.reduced;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environmentIntensity = 0.9;

    this.face = new Face(this.mats);
    this.puffMat = new SpriteMaterial({ map: puffTexture(), transparent: true, depthWrite: false });
    this.buildScene();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    // af en toe knipperen
    const blink = () => {
      this.blinkTimer = window.setTimeout(blink, 2200 + Math.random() * 3500);
      if (this.face.mood === 'dead') return;
      this.face.blinkT = 0.14;
      this.wake();
    };
    this.blinkTimer = window.setTimeout(blink, 1800);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.blinkTimer);
    this.ro.disconnect();
    this.scene.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as Material | Material[] | undefined;
      if (mat)
        (Array.isArray(mat) ? mat : [mat]).forEach((x) => {
          const map = (x as MeshStandardMaterial).map;
          if (map) map.dispose();
          x.dispose();
        });
    });
    this.renderer.dispose();
  }

  // ---------- opbouw ----------

  private shadowed<T extends Mesh>(m: T, cast = true, receive = true): T {
    m.castShadow = cast;
    m.receiveShadow = receive;
    return m;
  }

  private buildScene() {
    const { mats, scene } = this;

    scene.add(new HemisphereLight(0xfff3dc, 0x1a140c, 0.6));
    const key = new DirectionalLight(0xfff1d6, 2.2);
    key.position.set(2.5, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -3.5, right: 3.5, top: 4, bottom: -1, near: 1, far: 14 });
    key.shadow.bias = -0.0004;
    key.shadow.radius = 4;
    scene.add(key);
    const rim = new DirectionalLight(0xffd59a, 1.1);
    rim.position.set(-4, 3, -3);
    scene.add(rim);

    const ground = new Mesh(new PlaneGeometry(3.6, 1.8), mats.blob);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.002;
    scene.add(ground);

    // sokkel
    const base = this.shadowed(new Mesh(new RoundedBoxGeometry(2.3, 0.24, 0.95, 4, 0.06), mats.wood));
    base.position.y = 0.12;
    scene.add(base);
    const foot = this.shadowed(new Mesh(new CylinderGeometry(0.3, 0.34, 0.07, 40), mats.brass));
    foot.position.y = 0.275;
    const foot2 = this.shadowed(new Mesh(new CylinderGeometry(0.16, 0.22, 0.08, 32), mats.brass));
    foot2.position.y = 0.345;
    scene.add(foot, foot2);

    // zuil
    const colH = PIVOT_Y - 0.38;
    const col = this.shadowed(new Mesh(new CylinderGeometry(0.055, 0.085, colH, 24), mats.iron));
    col.position.y = 0.38 + colH / 2;
    scene.add(col);
    for (const y of [0.55, PIVOT_Y - 0.22]) {
      const ring = this.shadowed(new Mesh(new TorusGeometry(0.075, 0.018, 10, 32), mats.brass));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      scene.add(ring);
    }
    const fork = this.shadowed(new Mesh(new BoxGeometry(0.2, 0.16, 0.16), mats.darkBrass));
    fork.position.y = PIVOT_Y - 0.08;
    scene.add(fork);

    // wijzerplaat
    const span = 26 * DEG;
    const dial = new Mesh(new RingGeometry(NEEDLE - 0.2, NEEDLE + 0.06, 48, 1, -Math.PI / 2 - span, span * 2), mats.dial);
    dial.position.set(0, PIVOT_Y, 0.13);
    scene.add(dial);
    const rimRing = new Mesh(new RingGeometry(NEEDLE + 0.06, NEEDLE + 0.085, 48, 1, -Math.PI / 2 - span, span * 2), mats.brass);
    rimRing.position.copy(dial.position);
    scene.add(rimRing);
    const ticks = new InstancedMesh(new BoxGeometry(0.008, 1, 0.004), mats.tick, 23);
    const mtx = new Matrix4();
    let n = 0;
    for (let d = -22; d <= 22; d += 2) {
      const a = -Math.PI / 2 + d * DEG;
      const len = d === 0 ? 0.13 : d % 10 === 0 ? 0.09 : 0.05;
      const r = NEEDLE + 0.03 - len / 2;
      mtx.compose(
        new Vector3(Math.cos(a) * r, PIVOT_Y + Math.sin(a) * r, 0.135),
        new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), a + Math.PI / 2),
        new Vector3(d === 0 ? 2.2 : 1, len, 1),
      );
      ticks.setMatrixAt(n++, mtx);
    }
    scene.add(ticks);

    // wijzer
    const nBody = new Mesh(new BoxGeometry(0.018, NEEDLE, 0.012), mats.ironDark);
    nBody.position.y = -NEEDLE / 2;
    const nTip = new Mesh(new CylinderGeometry(0, 0.022, 0.14, 4), mats.red);
    nTip.rotation.z = Math.PI;
    nTip.position.y = -NEEDLE + 0.02;
    this.needle.add(nBody, nTip);
    this.needle.position.set(0, PIVOT_Y, 0.16);
    scene.add(this.needle);

    // balk
    for (const s of [-1, 1]) {
      const half = this.shadowed(new Mesh(new CylinderGeometry(0.028, 0.06, R, 24), mats.brass));
      half.rotation.z = (s * Math.PI) / 2;
      half.position.x = (s * R) / 2;
      this.beam.add(half);
      const cap = this.shadowed(new Mesh(new SphereGeometry(0.055, 20, 14), mats.brass));
      cap.position.x = s * R;
      this.beam.add(cap);
      const hang = this.shadowed(new Mesh(new TorusGeometry(0.035, 0.01, 8, 16), mats.darkBrass));
      hang.position.set(s * R, -0.06, 0);
      this.beam.add(hang);
    }
    const boss = this.shadowed(new Mesh(new CylinderGeometry(0.13, 0.13, 0.12, 36), mats.brass));
    boss.rotation.x = Math.PI / 2;
    const pin = new Mesh(new CylinderGeometry(0.04, 0.04, 0.2, 16), mats.ironDark);
    pin.rotation.x = Math.PI / 2;
    this.beam.add(boss, pin);
    this.beam.position.y = PIVOT_Y;
    scene.add(this.beam);

    // hoofd op een korte nek
    const neck = this.shadowed(new Mesh(new CylinderGeometry(0.05, 0.07, 0.2, 16), mats.darkBrass));
    neck.position.y = PIVOT_Y + 0.12;
    scene.add(neck);
    this.face.group.position.set(0, HEAD_Y, 0.02);
    scene.add(this.face.group);

    // schalen
    const profile = [
      [0, -0.07], [0.3, -0.065], [0.48, -0.045], [0.58, -0.015], [PAN_R, 0.012], [PAN_R + 0.012, 0.02],
      [PAN_R - 0.004, 0.022], [0.57, -0.006], [0.47, -0.035], [0.3, -0.053], [0, -0.058],
    ].map(([x, y]) => new Vector2(x, y));
    const linkGeo = new TorusGeometry(0.022, 0.0055, 6, 12);
    for (const side of [0, 1] as const) {
      const dish = this.shadowed(new Mesh(new LatheGeometry(profile, 56), side === 1 ? mats.brassRight : mats.brass));
      this.panInner[side].add(dish);
      const anchors = [0, 180, 270].map((a) => new Vector3(Math.cos(a * DEG) * (PAN_R - 0.02), 0, Math.sin(a * DEG) * (PAN_R - 0.02)));
      const top = new Vector3(0, L, 0);
      const perChain = Math.ceil(top.distanceTo(anchors[0]) / 0.036);
      const links = new InstancedMesh(linkGeo, mats.brass, perChain * 3);
      links.castShadow = true;
      let li = 0;
      for (const a of anchors) {
        const dir = new Vector3().subVectors(top, a);
        const len = dir.length();
        dir.normalize();
        const q0 = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
        for (let k = 0; k < perChain; k++) {
          const p = a.clone().addScaledVector(dir, ((k + 0.5) / perChain) * len);
          const q = q0.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), ((k % 2) * Math.PI) / 2));
          mtx.compose(p, q, new Vector3(0.75, 1.3, 1));
          links.setMatrixAt(li++, mtx);
        }
      }
      this.chains[side].add(links);
      this.panInner[side].add(this.chains[side]);
      this.panGroups[side].add(this.panInner[side]);
      scene.add(this.panGroups[side]);
    }
    this.stack.position.y = -0.05;
    this.stack.add(this.tags);
    this.panInner[1].add(this.stack);
    this.objectHolder.position.y = -0.05;
    this.panInner[0].add(this.objectHolder);

    // slot
    const body = new Mesh(new RoundedBoxGeometry(0.17, 0.14, 0.07, 3, 0.025), mats.lockBrass);
    this.shackle = new Mesh(new TorusGeometry(0.05, 0.014, 10, 24, Math.PI), mats.lockSteel);
    this.shackle.position.y = 0.07;
    const hole = new Mesh(new CylinderGeometry(0.014, 0.014, 0.01, 12), mats.ironDark);
    hole.rotation.x = Math.PI / 2;
    hole.position.set(0, -0.005, 0.036);
    this.lock.add(body, this.shackle, hole);
    this.lock.position.set(0, PIVOT_Y - 0.2, 0.2);
    scene.add(this.lock);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(200, r.width);
    const h = Math.max(160, r.height);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // kader: breedte ±2,15 m, hoogte 0–3 m (hoofd inbegrepen)
    const vfov = this.camera.fov * DEG;
    const needH = 2.95;
    const needW = 4.3;
    const distH = needH / 2 / Math.tan(vfov / 2);
    const distW = needW / 2 / (Math.tan(vfov / 2) * aspect);
    const dist = Math.max(distH, distW) + 0.25;
    this.lookAtPt.set(0, 1.45, 0);
    this.camBase.set(0, 1.45 + dist * 0.2, dist);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.lookAtPt);
    this.camera.updateProjectionMatrix();
    this.relayout(false);
    this.sync();
    this.render();
  }

  // ---------- publieke API ----------

  setObject(obj: ScaleObject | null, drop = true) {
    const token = ++this.objectToken;
    if (this.objectMesh) {
      this.objectMesh.geometry.dispose();
      const m = this.objectMesh.material as MeshBasicMaterial;
      m.map?.dispose();
      m.dispose();
      this.objectMesh = null;
    }
    this.objectHolder.clear();
    if (!obj) return this.wake();
    const place = (tex: Texture, aspect: number) => {
      if (token !== this.objectToken) return tex.dispose();
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = 4;
      let hh = 1.0;
      let ww = hh * aspect;
      if (ww > 1.35) {
        ww = 1.35;
        hh = ww / aspect;
      }
      const geo = new PlaneGeometry(ww, hh);
      geo.translate(0, hh / 2, 0);
      const mesh = new Mesh(geo, new MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.02, toneMapped: false }));
      mesh.castShadow = true;
      mesh.rotation.x = -Math.atan2(this.camBase.y - PIVOT_Y + L, this.camBase.z) * 0.6;
      const blob = new Mesh(new PlaneGeometry(Math.min(ww * 0.9, PAN_R * 1.6), Math.min(ww * 0.5, 0.5)), this.mats.blob);
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.006;
      this.objectHolder.add(blob, mesh);
      this.objectMesh = mesh;
      this.objectDrop = drop && !this.reduced ? { dy: 3.4, vy: 0, dx: 0, landed: false, bounces: 0 } : null;
      if (!this.objectDrop) this.cb.onLand?.('object', -1, 0.5);
      // de balans kijkt naar wat er binnenvalt
      this.glance(new Vector3(-R, PIVOT_Y - L + 0.6, 0), 1400);
      this.sync();
      this.wake();
    };
    if (obj.image) {
      this.loader.load(
        obj.image,
        (tex) => place(tex, (tex.image as HTMLImageElement).width / (tex.image as HTMLImageElement).height),
        undefined,
        () => place(emojiTexture(obj.emoji), 1),
      );
    } else {
      place(emojiTexture(obj.emoji), 1);
    }
  }

  reset() {
    for (const it of this.items) this.stack.remove(it.obj);
    this.items = [];
    this.slots = [];
    this.tags.clear();
    this.phys.locked = true;
    this.phys.target = 0;
    this.settledNotified = true;
    this.setMood('idle');
    this.wake();
  }

  addWeight(idx: number, from?: { x: number; y: number }): number {
    const id = this.nextId++;
    const t = this.template(idx);
    const obj = t.group.clone();
    this.stack.add(obj);
    const it: Item = { id, idx, obj, baseW: t.w, drop: { dy: 0, vy: 0, dx: 0, landed: true, bounces: 0 } };
    this.items.push(it);
    this.relayout(true);
    const slot = this.slots.find((s) => s.id === id);
    if (!this.reduced && slot) {
      it.drop.landed = false;
      if (from) {
        const p = this.pointToPanLocal(from.x, from.y);
        it.drop.dy = Math.max(0.15, p ? p.y - (slot.y + slot.h / 2) : 0.8);
        it.drop.dx = p ? Math.max(-1, Math.min(1, p.x - slot.x)) : 0;
      } else it.drop.dy = 0.85 + WEIGHT_SPECS[idx].heft * 0.6;
    } else if (!slot) {
      // verborgen in een stapel: enkel het ×N-label verandert
      this.land(idx, 0.3);
    } else this.land(idx, 0.4);
    this.glance(new Vector3(R, PIVOT_Y - L + 0.3, 0), 900);
    this.wake();
    return id;
  }

  removeWeight(id: number): number | undefined {
    const i = this.items.findIndex((x) => x.id === id);
    if (i < 0) return undefined;
    const [it] = this.items.splice(i, 1);
    this.stack.remove(it.obj);
    this.relayout(true);
    this.phys.pans[1].vb -= 0.12 * L;
    this.wake();
    return it.idx;
  }

  removeOne(idx: number): boolean {
    for (let i = this.items.length - 1; i >= 0; i--) if (this.items[i].idx === idx) return this.removeWeight(this.items[i].id) !== undefined;
    return false;
  }

  clearWeights() {
    if (!this.items.length) return;
    for (const it of this.items) this.stack.remove(it.obj);
    this.items = [];
    this.slots = [];
    this.tags.clear();
    this.phys.pans[1].vb -= 0.25 * L;
    this.face.jolt(0.6);
    this.wake();
  }

  unlock(tiltDeg: number) {
    this.phys.locked = false;
    // positieve tilt = voorwerp (links) zakt → theta < 0
    this.phys.target = -tiltDeg * DEG;
    this.settledNotified = false;
    this.setMood('surprised');
    this.face.jolt(0.8);
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

  setMood(m: Mood) {
    this.face.setMood(m);
    this.wake();
  }

  /** Ogen volgen een punt op het scherm (bv. je vinger tijdens het slepen). */
  lookAtScreen(clientX: number, clientY: number) {
    this.setRay(clientX, clientY);
    const p = new Vector3();
    if (this.raycaster.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), -0.4), p)) this.glance(p, 1200);
  }

  hitTest(clientX: number, clientY: number): number | null {
    this.setRay(clientX, clientY);
    const hits = this.raycaster.intersectObjects(this.stack.children, true);
    for (const h of hits) {
      let o: Object3D | null = h.object;
      while (o && o.parent !== this.stack) o = o.parent;
      const it = this.items.find((x) => x.obj === o);
      if (it) return it.id;
      if (o === this.tags) {
        // ×N-label: haal een exemplaar van die soort weg
        const idx = (h.object as Sprite).userData.idx as number;
        const last = [...this.items].reverse().find((x) => x.idx === idx);
        if (last) return last.id;
      }
    }
    return null;
  }

  /** Tik op het hoofd of het voorwerp: geeft terug wat er geraakt werd. */
  poke(clientX: number, clientY: number): 'head' | 'object' | null {
    this.setRay(clientX, clientY);
    if (this.raycaster.intersectObject(this.face.group, true).length) {
      this.face.jolt(1.2);
      this.face.blinkT = 0.14;
      this.wake();
      return 'head';
    }
    if (this.objectMesh && this.raycaster.intersectObject(this.objectHolder, true).length && (!this.objectDrop || this.objectDrop.landed)) {
      this.objectDrop = { dy: 0.0001, vy: -4.2, dx: 0, landed: false, bounces: 1 };
      this.phys.impact(0, 0.4, 0.5);
      this.glance(new Vector3(-R, PIVOT_Y - L + 0.8, 0), 1000);
      this.wake();
      return 'object';
    }
    return null;
  }

  isOverRightSide(clientX: number, clientY: number): boolean {
    const r = this.canvas.getBoundingClientRect();
    return clientX >= r.left + r.width * 0.5 && clientX <= r.right + 20 && clientY >= r.top - 40 && clientY <= r.bottom + 10;
  }

  /** Schermpositie (client-px) van de mond, voor een tekstballon. */
  headScreenPos(): { x: number; y: number } {
    const p = new Vector3(0, HEAD_Y + 0.27, 0).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  // ---------- intern ----------

  private glance(world: Vector3, ms: number) {
    this.lookTarget = world.clone();
    this.lookUntil = performance.now() + ms;
    this.wake();
  }

  private template(idx: number) {
    let t = this.templates.get(idx);
    if (!t) {
      t = buildWeight(idx, this.mats);
      this.templates.set(idx, t);
    }
    return t;
  }

  private setRay(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  private pointToPanLocal(clientX: number, clientY: number) {
    this.setRay(clientX, clientY);
    const p = new Vector3();
    if (!this.raycaster.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), 0), p)) return null;
    this.scene.updateMatrixWorld();
    return this.stack.worldToLocal(p);
  }

  /** Stapels: per soort maximaal VISIBLE_PER_KIND zichtbaar, de rest als ×N-label. Past altijd op de schaal. */
  private relayout(keep: boolean) {
    const old = new Map(this.slots.map((s) => [s.id, s]));
    const perKind = new Map<number, Item[]>();
    for (const it of this.items) {
      const l = perKind.get(it.idx) ?? [];
      l.push(it);
      perKind.set(it.idx, l);
    }
    const visible: Placed[] = [];
    for (const [idx, list] of perKind) {
      list.forEach((it, k) => {
        const show = k < VISIBLE_PER_KIND;
        it.obj.visible = show;
        if (show) visible.push({ id: it.id, idx });
      });
    }
    this.slots = layoutStack(visible, M, PAN_R * 2 * 0.95, 1.05).slots.map((s) => ({ ...s, y: -s.y }));
    if (keep) {
      for (const s of this.slots) {
        const o = old.get(s.id);
        const it = this.items.find((x) => x.id === s.id);
        if (o && it) {
          it.drop.dy += o.y - s.y;
          it.drop.dx += o.x - s.x;
          if (Math.abs(it.drop.dy) > 1e-3) it.drop.landed = false;
        }
      }
    }
    // ×N-labels naast elke volle stapel
    this.tags.clear();
    for (const [idx, list] of perKind) {
      if (list.length <= VISIBLE_PER_KIND) continue;
      const ids = new Set(list.slice(0, VISIBLE_PER_KIND).map((x) => x.id));
      const mine = this.slots.filter((s) => ids.has(s.id));
      if (!mine.length) continue;
      const topSlot = mine.reduce((a, b) => (b.y > a.y ? b : a));
      let tex = this.countTex.get(list.length);
      if (!tex) {
        tex = countTexture(list.length);
        this.countTex.set(list.length, tex);
      }
      const sp = new Sprite(new SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sp.scale.set(0.24, 0.145, 1);
      sp.position.set(Math.min(PAN_R * 0.75, topSlot.x + topSlot.w / 2 + 0.06), topSlot.y + topSlot.h * 0.8 + 0.05, 0.3);
      sp.userData.idx = idx;
      sp.renderOrder = 10;
      this.tags.add(sp);
    }
  }

  private land(idx: number, strength: number) {
    const heft = WEIGHT_SPECS[idx].heft;
    this.phys.impact(1, 0.35 + heft * 0.65, strength);
    this.face.jolt(0.25 + heft * strength);
    if (!this.reduced && heft > 0.45) {
      this.kickV -= heft * strength * 1.5;
      this.puff(1, heft * strength);
    }
    if (heft > 0.6 && this.face.mood === 'idle') {
      this.face.setMood('strain');
      window.setTimeout(() => this.face.mood === 'strain' && this.phys.locked && this.setMood('idle'), 1200);
    }
    this.cb.onLand?.('weight', idx, strength);
  }

  private puff(side: 0 | 1, amount: number) {
    this.scene.updateMatrixWorld();
    const base = this.panInner[side].localToWorld(new Vector3(0, 0, 0.2));
    const n = Math.round(4 + amount * 6);
    for (let i = 0; i < n; i++) {
      const sp = new Sprite(this.puffMat.clone());
      const dir = i % 2 ? 1 : -1;
      sp.position.copy(base).add(new Vector3(dir * (0.2 + Math.random() * 0.35), 0.02, Math.random() * 0.1));
      sp.scale.setScalar(0.12);
      this.scene.add(sp);
      this.puffs.push({ sprite: sp, vx: dir * (0.6 + Math.random()), vy: 0.3 + Math.random() * 0.5, life: 0.7 });
    }
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
    if (dt > 0.1) dt = 0.1;
    this.acc += dt;
    while (this.acc >= STEP) {
      this.step(STEP);
      this.acc -= STEP;
    }
    this.sync();
    this.render();
    if (this.isSettled()) {
      this.running = false;
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private step(dt: number) {
    this.phys.step(dt);
    if (this.objectDrop) {
      const s = stepDrop(this.objectDrop, dt, GRAVITY, 7);
      if (s !== null) {
        this.phys.impact(0, 0.8, s);
        this.face.jolt(0.6 * s);
        if (s > 0.5 && !this.reduced) this.puff(0, s * 0.6);
        this.cb.onLand?.('object', -1, s);
      }
    }
    for (const it of this.items) {
      const s = stepDrop(it.drop, dt, GRAVITY, 5);
      if (s !== null) this.land(it.idx, Math.max(0.15, s));
    }
    // waar kijken de ogen naar?
    let look = new Vector2(0, -0.15); // naar de speler
    if (this.lookTarget && performance.now() < this.lookUntil) {
      const d = this.lookTarget.clone().sub(new Vector3(0, HEAD_Y, 0));
      look = new Vector2(d.x, d.y).normalize().multiplyScalar(Math.min(1, d.length() / 0.8));
    } else if (!this.phys.locked) {
      // na het wegen: kijk naar de kant die zakt
      look = new Vector2(Math.sign(this.phys.target) * 0.8, -0.6);
    }
    this.face.look.copy(look);
    this.face.step(dt);
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    this.kickV += (-300 * this.kick - 18 * this.kickV) * dt;
    this.kick += this.kickV * dt;
    this.highlight += (this.highlightTarget - this.highlight) * Math.min(1, dt * 12);
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.vx *= 1 - 2.5 * dt;
      const k = 1 - p.life / 0.7;
      p.sprite.scale.setScalar(0.12 + k * 0.35);
      (p.sprite.material as SpriteMaterial).opacity = Math.max(0, p.life / 0.7) * 0.8;
      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        (p.sprite.material as SpriteMaterial).dispose();
        this.puffs.splice(i, 1);
      }
    }
    const p = this.phys;
    if (!this.settledNotified && !p.locked && Math.abs(p.theta - p.target) < 0.01 && Math.abs(p.omega) < 0.05) {
      this.settledNotified = true;
      this.cb.onSettled?.();
    }
  }

  private isSettled() {
    if (!this.phys.settled()) return false;
    if (this.objectDrop && !dropSettled(this.objectDrop)) return false;
    for (const it of this.items) if (!dropSettled(it.drop)) return false;
    if (!this.face.settled() || this.puffs.length) return false;
    if (this.lookTarget && performance.now() < this.lookUntil + 400) return false;
    return this.shakeT === 0 && Math.abs(this.kick) < 1e-3 && Math.abs(this.highlight - this.highlightTarget) < 0.01;
  }

  /** Physics-toestand → scene graph. */
  private sync() {
    const p = this.phys;
    const th = -p.theta;
    this.beam.rotation.z = th;
    for (const side of [0, 1] as const) {
      const s = side === 0 ? -1 : 1;
      const g = this.panGroups[side];
      g.position.set(s * R * Math.cos(th), PIVOT_Y - 0.06 + s * R * Math.sin(th), 0);
      g.rotation.z = p.pans[side].phi;
      const stretch = L + p.pans[side].b * 0.6;
      this.panInner[side].position.y = -stretch;
      this.chains[side].scale.y = stretch / L;
    }
    this.needle.rotation.z = th - p.needle;
    const la = p.lockAnim;
    this.lock.visible = la > 0.02;
    this.lock.position.y = PIVOT_Y - 0.2 - (1 - la) * 0.35;
    this.shackle.position.y = 0.07 + (1 - Math.min(1, la * 1.5)) * 0.05;
    this.mats.lockBrass.opacity = this.mats.lockSteel.opacity = Math.min(1, la * 1.3);
    for (const it of this.items) {
      const s = this.slots.find((x) => x.id === it.id);
      if (!s) continue;
      it.obj.scale.setScalar(s.w / it.baseW);
      it.obj.position.set(s.x + it.drop.dx, s.y + it.drop.dy, (((it.id * 7919) % 5) - 2) * 0.012);
    }
    if (this.objectMesh) {
      const d = this.objectDrop;
      this.objectHolder.position.y = -0.05 + (d ? d.dy : 0);
      const squash = d && !d.landed && d.dy < 0.03 && d.vy > 1 ? 0.88 : 1;
      this.objectMesh.scale.set(1 / squash, squash, 1);
    }
    // het hoofd leunt een beetje tegen de kanteling in
    this.face.sync();
    this.face.group.rotation.z += -th * 0.35;
    this.mats.brassRight.emissiveIntensity = this.highlight * 0.35;
    this.camera.position.copy(this.camBase);
    this.camera.position.y += this.kick * 0.15;
    this.camera.position.z += this.kick * 0.25;
    if (this.shakeT > 0) this.camera.position.x += Math.sin(this.shakeT * 70) * 0.08 * (this.shakeT / 0.45);
    this.camera.lookAt(this.lookAtPt);
  }

  private render() {
    this.renderer.render(this.scene, this.camera);
  }
}

/** Rendert elk gewicht apart (zelfde materialen en licht) naar een PNG-data-URL. */
export function renderWeightIcons(w = 184, h = 136): string[] {
  const canvas = document.createElement('canvas');
  const r = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(w, h, false);
  r.outputColorSpace = SRGBColorSpace;
  r.toneMapping = ACESFilmicToneMapping;
  const scene = new Scene();
  const pm = new PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  scene.add(new HemisphereLight(0xfff3dc, 0x1a140c, 0.6));
  const key = new DirectionalLight(0xfff1d6, 2.2);
  key.position.set(2.5, 6, 4);
  scene.add(key);
  const mats = new Mats();
  const cam = new PerspectiveCamera(22, w / h, 0.01, 50);
  const out: string[] = [];
  for (let i = 0; i < WEIGHTS.length; i++) {
    const { group, w: ww, h: hh } = buildWeight(i, mats);
    const tall = WEIGHT_SPECS[i].style === 'plate' ? hh * 2.6 : hh;
    const size = Math.max(ww * 0.75, tall * 1.25);
    const dist = (size / (2 * Math.tan((22 * DEG) / 2))) * 1.05;
    const elev = WEIGHT_SPECS[i].style === 'plate' ? 0.9 : 0.35;
    cam.position.set(0, hh / 2 + dist * elev, dist);
    cam.lookAt(0, hh * 0.48, 0);
    cam.updateProjectionMatrix();
    scene.add(group);
    r.render(scene, cam);
    out.push(canvas.toDataURL('image/png'));
    scene.remove(group);
    group.traverse((o) => (o as Mesh).geometry?.dispose());
  }
  r.dispose();
  r.forceContextLoss();
  return out;
}
