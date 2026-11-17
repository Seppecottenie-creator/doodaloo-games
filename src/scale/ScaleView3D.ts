import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  LatheGeometry,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Raycaster,
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
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BalancePhysics, dropSettled, stepDrop, type Drop } from './physics';
import { layoutStack, type Placed, type Slot } from './layout';
import { WEIGHT_SIZE } from './sprites';
import { weightLabel } from '../game/format';
import { WEIGHTS, WEIGHT_SPECS } from '../game/config';
import type { Mood, ScaleCallbacks, ScaleLike, ScaleObject } from './types';

const STEP = 1 / 120;
const DEG = Math.PI / 180;

// Afmetingen (meter)
const PIVOT_Y = 2.2;
const DIAL_R = 0.46;
/** Zoveel exemplaren van één gewicht tonen we; de rest staat als ×N-label bij de stapel. */
const VISIBLE_PER_KIND = 4;
const R = 1.42;
const L = 1.16;
const PAN_R = 0.62;
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

/** Diepe achtergrond: zwart met paarse en aqua gloed. */
function backTexture() {
  return canvasTex(512, 288, (c) => {
    c.fillStyle = '#050507';
    c.fillRect(0, 0, 512, 288);
    const g = c.createRadialGradient(256, 150, 10, 256, 150, 260);
    g.addColorStop(0, 'rgba(110,70,210,0.55)');
    g.addColorStop(0.45, 'rgba(60,30,120,0.25)');
    g.addColorStop(1, 'rgba(5,5,7,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 288);
    const g2 = c.createRadialGradient(90, 40, 4, 90, 40, 160);
    g2.addColorStop(0, 'rgba(126,232,226,0.18)');
    g2.addColorStop(1, 'rgba(126,232,226,0)');
    c.fillStyle = g2;
    c.fillRect(0, 0, 512, 288);
  });
}

/** Lichtgloed achter het voorwerp op de schaal. */
function haloTexture() {
  return canvasTex(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 6, 128, 128, 128);
    g.addColorStop(0, 'rgba(220,210,255,0.42)');
    g.addColorStop(0.45, 'rgba(183,156,255,0.16)');
    g.addColorStop(1, 'rgba(183,156,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  });
}

/** Paarse vloergloed zoals in de render. */
function floorTexture() {
  return canvasTex(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 4, 128, 128, 128);
    g.addColorStop(0, 'rgba(150,120,220,0.55)');
    g.addColorStop(0.45, 'rgba(110,80,190,0.22)');
    g.addColorStop(1, 'rgba(60,40,120,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  });
}

/** Hologramkaart voor alles zonder foto (bv. bekende fictieve figuren): geen beschermde afbeeldingen nodig. */
function hologramTexture(title: string, sub: string, glyph: string) {
  return canvasTex(512, 640, (c) => {
    const r = 46;
    const path = () => {
      c.beginPath();
      if (c.roundRect) c.roundRect(10, 10, 492, 620, r);
      else c.rect(10, 10, 492, 620);
    };
    // glazen kaart
    const bg = c.createLinearGradient(0, 0, 0, 640);
    bg.addColorStop(0, 'rgba(40,36,70,0.92)');
    bg.addColorStop(1, 'rgba(14,12,26,0.95)');
    c.fillStyle = bg;
    path();
    c.fill();
    // iriserende rand
    const edge = c.createLinearGradient(0, 0, 512, 640);
    edge.addColorStop(0, '#7EE8E2');
    edge.addColorStop(0.5, '#B79CFF');
    edge.addColorStop(1, '#E25CF1');
    c.lineWidth = 8;
    c.strokeStyle = edge;
    path();
    c.stroke();
    // raster
    c.save();
    path();
    c.clip();
    c.strokeStyle = 'rgba(183,156,255,0.12)';
    c.lineWidth = 2;
    for (let x = 10; x < 512; x += 40) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 640);
      c.stroke();
    }
    for (let y = 10; y < 640; y += 40) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(512, y);
      c.stroke();
    }
    const glow = c.createRadialGradient(256, 280, 10, 256, 280, 220);
    glow.addColorStop(0, 'rgba(183,156,255,0.45)');
    glow.addColorStop(1, 'rgba(183,156,255,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, 512, 640);
    c.restore();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#7EE8E2';
    c.font = '700 30px "JetBrains Mono", monospace';
    c.fillText(sub.toUpperCase(), 256, 70);
    // monogram in kleurverloop, geen emoji
    const words = title.replace(/[()’'.]/g, '').split(/\s+/).filter((w) => /^[A-Za-zÀ-ÿ0-9]/.test(w));
    const mono = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
    void glyph;
    c.font = '900 210px Inter, system-ui, sans-serif';
    const mg = c.createLinearGradient(80, 180, 430, 400);
    mg.addColorStop(0, '#ffffff');
    mg.addColorStop(0.55, '#B79CFF');
    mg.addColorStop(1, '#7EE8E2');
    c.fillStyle = mg;
    c.fillText(mono, 256, 300);
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(60, 430);
    c.lineTo(452, 430);
    c.stroke();
    c.font = '700 22px "JetBrains Mono", monospace';
    c.fillStyle = 'rgba(169,164,192,0.8)';
    c.fillText('SPECIMEN · OFFICIAL WEIGHT ON FILE', 256, 465);
    c.font = '800 64px Inter, system-ui, sans-serif';
    let size = 64;
    while (c.measureText(title).width > 440 && size > 28) {
      size -= 4;
      c.font = `800 ${size}px Inter, system-ui, sans-serif`;
    }
    c.fillText(title, 256, 540);
  });
}

class Mats {
  chrome = new MeshStandardMaterial({ color: 0xeef0f6, metalness: 1, roughness: 0.06 });
  titanium = new MeshStandardMaterial({ color: 0x1a1b21, metalness: 0.85, roughness: 0.38 });
  irid = new MeshPhysicalMaterial({ color: 0xbff5f0, metalness: 1, roughness: 0.12, iridescence: 1, iridescenceIOR: 1.9, iridescenceThicknessRange: [200, 900] });
  glass = new MeshPhysicalMaterial({ color: 0x0b0a12, metalness: 0.5, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.85, side: DoubleSide, envMapIntensity: 0.3 });
  glassRight = new MeshPhysicalMaterial({ color: 0x0b0a12, metalness: 0.5, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.85, side: DoubleSide, envMapIntensity: 0.3, emissive: 0xb79cff, emissiveIntensity: 0 });
  aqua = new MeshBasicMaterial({ color: 0x7ee8e2, toneMapped: false });
  pink = new MeshBasicMaterial({ color: 0xff5fd8, toneMapped: false });
  tick = new MeshBasicMaterial({ color: 0xd8d2ff, toneMapped: false, transparent: true, opacity: 0.75 });
  // gewichten: klassiek messing, gietijzer, beton en een groene brandkast
  brass = new MeshStandardMaterial({ color: 0xd9ad4a, metalness: 1, roughness: 0.22 });
  iron = new MeshStandardMaterial({ color: 0x2d2e33, metalness: 0.65, roughness: 0.5 });
  ironDark = new MeshStandardMaterial({ color: 0x1a1b1f, metalness: 0.6, roughness: 0.55 });
  steel = new MeshStandardMaterial({ color: 0xb8c0c8, metalness: 1, roughness: 0.3 });
  concrete = new MeshStandardMaterial({ color: 0xa3a29b, metalness: 0, roughness: 0.95 });
  safe = new MeshStandardMaterial({ color: 0x2f5a3e, metalness: 0.5, roughness: 0.4 });
  rubber = new MeshStandardMaterial({ color: 0x131317, metalness: 0.1, roughness: 0.7 });
  lockBody = new MeshStandardMaterial({ color: 0xeef0f6, metalness: 1, roughness: 0.1, transparent: true });
  lockShackle = new MeshStandardMaterial({ color: 0x7ee8e2, metalness: 0.6, roughness: 0.2, transparent: true });
  blob = new MeshBasicMaterial({ map: shadowBlobTexture(), transparent: true, depthWrite: false });
  floor = new MeshBasicMaterial({ map: floorTexture(), transparent: true, depthWrite: false });
  halo = new MeshBasicMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
  black = new MeshPhysicalMaterial({ color: 0x050507, roughness: 0.08, metalness: 0, clearcoat: 1 });
  white = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
  lime = new MeshBasicMaterial({ color: 0xd7ff4a, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
}
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

  private beam = new Group();
  private panGroups: [Group, Group] = [new Group(), new Group()];
  private panInner: [Group, Group] = [new Group(), new Group()];
  private cables: [Group, Group] = [new Group(), new Group()];
  private needle = new Group();
  private lock = new Group();
  private shackle!: Mesh;
  private stack = new Group();
  private tags = new Group();
  private objectHolder = new Group();
  private objectMesh: Mesh | null = null;
  private objectDrop: Drop | null = null;
  private objectToken = 0;
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private flashLight = new PointLight(0xb79cff, 0, 9, 1.6);
  private flash = 0;
  private flashColor = new Color(0x7ee8e2);
  private baseAqua = new Color(0x7ee8e2);
  private dolly = 0;
  private dollyV = 0;
  private dollyT = 0;
  private par = new Vector2();
  private parT = new Vector2();
  private shift = 0;
  private onPointer = (e: PointerEvent) => {
    this.parT.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    this.wake();
  };
  private puffs: Puff[] = [];
  private puffMat: SpriteMaterial;
  private blinkTimer = 0;
  private hopTimers: number[] = [];
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
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    pmrem.dispose();
    this.scene.environmentIntensity = 1.0;

    this.puffMat = new SpriteMaterial({ map: puffTexture(), transparent: true, depthWrite: false });
    this.buildScene();
    // gloed op alles wat licht geeft (neon, lichtranden, chroom-glinsteringen)
    this.renderer.setClearColor(0x050507, 1);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.5, 0.35, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    if (matchMedia('(pointer: fine)').matches && !this.reduced) window.addEventListener('pointermove', this.onPointer);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.blinkTimer);
    this.hopTimers.forEach(clearTimeout);
    window.removeEventListener('pointermove', this.onPointer);
    this.composer.dispose();
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

    scene.add(new HemisphereLight(0xe8e0ff, 0x120c22, 0.5));
    const key = new DirectionalLight(0xffffff, 2.4);
    key.position.set(-3, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -3.5, right: 3.5, top: 4, bottom: -1, near: 1, far: 14 });
    key.shadow.bias = -0.0004;
    key.shadow.radius = 5;
    scene.add(key);
    const rimL = new DirectionalLight(0xb79cff, 2.2);
    rimL.position.set(-5, 2.5, -3);
    const rimR = new DirectionalLight(0x7ee8e2, 1.6);
    rimR.position.set(5, 2, -2);
    scene.add(rimL, rimR);

    // paarse vloergloed + contactschaduw
    const floor = new Mesh(new PlaneGeometry(8, 4.5), mats.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.001;
    const shadow = new Mesh(new PlaneGeometry(3.4, 1.6), mats.blob);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    scene.add(floor, shadow);

    // sokkel: zwart titanium met aqua lichtrand
    const pw = 2.7;
    const pd = 1.0;
    const ph = 0.16;
    const plinth = this.shadowed(new Mesh(new RoundedBoxGeometry(pw, ph, pd, 4, 0.03), mats.titanium));
    plinth.position.y = ph / 2;
    scene.add(plinth);
    const edge = 0.012;
    const inset = 0.035;
    for (const [w, d, x, z] of [
      [pw - 2 * inset, edge, 0, pd / 2 - inset],
      [pw - 2 * inset, edge, 0, -pd / 2 + inset],
      [edge, pd - 2 * inset, pw / 2 - inset, 0],
      [edge, pd - 2 * inset, -pw / 2 + inset, 0],
    ]) {
      const line = new Mesh(new BoxGeometry(w, 0.004, d), mats.aqua);
      line.position.set(x, ph + 0.002, z);
      scene.add(line);
    }
    const front = new Mesh(new BoxGeometry(pw - 0.1, 0.006, 0.004), mats.aqua);
    front.position.set(0, ph - 0.012, pd / 2 + 0.001);
    scene.add(front);

    // kolom: chroom met kraag en stelknop
    const colH = PIVOT_Y - ph - 0.08;
    const col = this.shadowed(new Mesh(new CylinderGeometry(0.038, 0.042, colH, 32), mats.chrome));
    col.position.y = ph + colH / 2;
    const foot = this.shadowed(new Mesh(new CylinderGeometry(0.1, 0.12, 0.03, 40), mats.chrome));
    foot.position.y = ph + 0.015;
    const collar = this.shadowed(new Mesh(new CylinderGeometry(0.06, 0.06, 0.05, 32), mats.chrome));
    collar.position.y = PIVOT_Y - 0.2;
    const rod = this.shadowed(new Mesh(new CylinderGeometry(0.012, 0.012, 0.28, 12), mats.chrome));
    rod.rotation.z = Math.PI / 2;
    rod.position.y = PIVOT_Y - 0.2;
    scene.add(col, foot, collar, rod);
    for (const sx of [-1, 1]) {
      const knob = this.shadowed(new Mesh(new CylinderGeometry(0.026, 0.026, 0.035, 20), mats.titanium));
      knob.rotation.z = Math.PI / 2;
      knob.position.set(sx * 0.15, PIVOT_Y - 0.2, 0);
      scene.add(knob);
    }
    const fork = this.shadowed(new Mesh(new BoxGeometry(0.1, 0.12, 0.08), mats.chrome));
    fork.position.y = PIVOT_Y - 0.08;
    scene.add(fork);

    // neon-wijzerplaat boven het draaipunt (kleurverloop aqua → lila → roze)
    const arc = new TorusGeometry(DIAL_R, 0.011, 10, 96, Math.PI);
    const ap = arc.attributes.position;
    const ac = new Float32Array(ap.count * 3);
    const cA = new Color(0x7ee8e2);
    const cB = new Color(0xb79cff);
    const cC = new Color(0xff5fd8);
    const tc = new Color();
    for (let i = 0; i < ap.count; i++) {
      const t = (1 - ap.getX(i) / DIAL_R) / 2; // links aqua → rechts roze
      if (t < 0.5) tc.copy(cA).lerp(cB, t * 2);
      else tc.copy(cB).lerp(cC, (t - 0.5) * 2);
      ac.set([tc.r, tc.g, tc.b], i * 3);
    }
    arc.setAttribute('color', new BufferAttribute(ac, 3));
    const dial = new Mesh(arc, new MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    dial.position.set(0, PIVOT_Y, 0.05);
    const halo = new Mesh(new TorusGeometry(DIAL_R, 0.04, 8, 96, Math.PI), new MeshBasicMaterial({ color: 0xb79cff, transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.position.copy(dial.position);
    scene.add(dial, halo);
    for (let d = 0; d <= 36; d++) {
      const a = Math.PI * (d / 36);
      const long = d % 6 === 0;
      const len = long ? 0.06 : 0.032;
      const t = new Mesh(new BoxGeometry(0.006, len, 0.004), mats.tick);
      const rr = DIAL_R - 0.03 - len / 2;
      t.position.set(Math.cos(a) * rr, PIVOT_Y + Math.sin(a) * rr, 0.05);
      t.rotation.z = a - Math.PI / 2;
      scene.add(t);
    }
    const nBody = new Mesh(new BoxGeometry(0.012, DIAL_R - 0.06, 0.008), mats.pink);
    nBody.position.y = (DIAL_R - 0.06) / 2;
    this.needle.add(nBody);
    this.needle.position.set(0, PIVOT_Y, 0.075);
    scene.add(this.needle);

    // balk: dun, spiegelend chroom, iriserende parels
    for (const s of [-1, 1]) {
      const half = this.shadowed(new Mesh(new CylinderGeometry(0.012, 0.032, R, 24), mats.chrome));
      half.rotation.z = (s * Math.PI) / 2;
      half.position.x = (s * R) / 2;
      this.beam.add(half);
      const cap = this.shadowed(new Mesh(new SphereGeometry(0.05, 28, 20), mats.irid));
      cap.position.x = s * R;
      this.beam.add(cap);
    }
    const pivot = this.shadowed(new Mesh(new CylinderGeometry(0.1, 0.1, 0.05, 48), mats.irid));
    pivot.rotation.x = Math.PI / 2;
    pivot.position.z = 0.03;
    const pivotRing = new Mesh(new TorusGeometry(0.1, 0.012, 10, 48), mats.chrome);
    pivotRing.position.z = 0.056;
    this.beam.add(pivot, pivotRing);
    this.beam.position.y = PIVOT_Y;
    scene.add(this.beam);

    // schalen: rookglas met chromen rand, drie dunne kabels
    const profile = [
      [0, -0.055], [0.25, -0.05], [0.42, -0.035], [0.54, -0.012], [PAN_R, 0.008], [PAN_R - 0.01, 0.012], [0.53, -0.006], [0.41, -0.028], [0.25, -0.042], [0, -0.047],
    ].map(([x, y]) => new Vector2(x, y));
    for (const side of [0, 1] as const) {
      const dish = this.shadowed(new Mesh(new LatheGeometry(profile, 64), side === 1 ? mats.glassRight : mats.glass));
      const rim = this.shadowed(new Mesh(new TorusGeometry(PAN_R, 0.011, 10, 64), mats.chrome));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.008;
      const glint = new Mesh(new TorusGeometry(PAN_R * 0.62, 0.004, 6, 48, Math.PI * 0.5), mats.aqua);
      glint.rotation.x = Math.PI / 2;
      glint.rotation.z = 0.3;
      glint.position.y = -0.04;
      this.panInner[side].add(dish, rim, glint);
      const top = new Vector3(0, L, 0);
      for (const a of [0, 180, 270]) {
        const p = new Vector3(Math.cos(a * DEG) * (PAN_R - 0.02), 0.01, Math.sin(a * DEG) * (PAN_R - 0.02));
        const dir = new Vector3().subVectors(top, p);
        const len = dir.length();
        const cab = new Mesh(new CylinderGeometry(0.0035, 0.0035, len, 6), mats.chrome);
        cab.position.copy(p).addScaledVector(dir, 0.5);
        cab.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
        this.cables[side].add(cab);
      }
      const hook = new Mesh(new SphereGeometry(0.018, 12, 10), mats.chrome);
      hook.position.y = L;
      this.cables[side].add(hook);
      this.panInner[side].add(this.cables[side]);
      this.panGroups[side].add(this.panInner[side]);
      scene.add(this.panGroups[side]);
    }
    this.stack.position.y = -0.04;
    this.stack.add(this.tags);
    this.panInner[1].add(this.stack);
    this.objectHolder.position.y = -0.04;
    this.panInner[0].add(this.objectHolder);

    // slot (verdwijnt bij het wegen)
    const body = new Mesh(new RoundedBoxGeometry(0.14, 0.11, 0.05, 3, 0.02), mats.lockBody);
    this.shackle = new Mesh(new TorusGeometry(0.04, 0.011, 10, 24, Math.PI), mats.lockShackle);
    this.shackle.position.y = 0.055;
    const hole = new Mesh(new CylinderGeometry(0.011, 0.011, 0.01, 12), mats.ironDark);
    hole.rotation.x = Math.PI / 2;
    hole.position.set(0, -0.005, 0.026);
    this.lock.add(body, this.shackle, hole);
    this.lock.position.set(0, PIVOT_Y - 0.32, 0.1);
    scene.add(this.lock);

    // achtergrond: diepe paarse gloed achter de balans
    const back = new Mesh(new PlaneGeometry(26, 14), new MeshBasicMaterial({ map: backTexture(), toneMapped: false, depthWrite: false }));
    back.position.set(0, 2.4, -5);
    scene.add(back);
    this.flashLight.position.set(0, 1.9, 1.6);
    scene.add(this.flashLight);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(200, r.width);
    const h = Math.max(160, r.height);
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.bloom?.resolution.set(w / 2, h / 2);
    this.shift = parseFloat(getComputedStyle(this.canvas).getPropertyValue('--scene-shift')) || 0;
    const aspect = (w - this.shift) / h;
    this.camera.aspect = aspect;
    const vfov = this.camera.fov * DEG;
    const needH = 2.95;
    const needW = 4.45;
    const distH = needH / 2 / Math.tan(vfov / 2);
    const distW = needW / 2 / (Math.tan(vfov / 2) * aspect);
    const dist = Math.max(distH, distW) + 0.2;
    this.lookAtPt.set(0.08, 1.38, 0);
    this.camBase.set(0.08, 1.38 + dist * 0.16, dist);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.lookAtPt);
    if (this.shift > 0) {
      // toon de scène gecentreerd in het linkerdeel (w - shift) van het canvas
      this.camera.aspect = (w + this.shift) / h;
      this.camera.setViewOffset(w + this.shift, h, this.shift, 0, w, h);
    } else this.camera.clearViewOffset();
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
    const place = (tex: Texture, aspect: number, card: boolean) => {
      if (token !== this.objectToken) return tex.dispose();
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = 4;
      // groot genoeg om duidelijk te zien; brede dingen mogen iets over de rand
      let hh = card ? 1.05 : 1.2;
      let ww = hh * aspect;
      if (ww > 1.45) {
        ww = 1.45;
        hh = ww / aspect;
      }
      const geo = new PlaneGeometry(ww, hh);
      geo.translate(0, hh / 2, 0);
      const mesh = new Mesh(geo, new MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.02, toneMapped: false, side: DoubleSide }));
      mesh.castShadow = !card;
      mesh.rotation.x = -Math.atan2(this.camBase.y - PIVOT_Y + L, this.camBase.z) * 0.6;
      // zachte gloed achter het voorwerp: maakt het los van de donkere achtergrond
      const halo = new Mesh(new PlaneGeometry(ww * 1.5, hh * 1.4), this.mats.halo);
      halo.position.set(0, hh * 0.5, -0.08);
      halo.renderOrder = -1;
      mesh.add(halo); // draait mee met de foto, blijft er altijd achter
      const blob = new Mesh(new PlaneGeometry(Math.min(ww * 0.9, PAN_R * 1.6), Math.min(ww * 0.5, 0.5)), this.mats.blob);
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.006;
      this.objectHolder.add(blob, mesh);
      this.objectMesh = mesh;
      this.objectDrop = drop && !this.reduced ? { dy: 3.4, vy: 0, dx: 0, landed: false, bounces: 0 } : null;
      if (!this.objectDrop) this.cb.onLand?.('object', -1, 0.5);
      this.glance(new Vector3(-R, PIVOT_Y - L + 0.6, 0), 1400);
      this.sync();
      this.wake();
    };
    const card = () => place(hologramTexture(obj.title ?? '???', obj.sub ?? 'Mystery', obj.emoji), 512 / 640, true);
    if (obj.image) {
      this.loader.load(obj.image, (tex) => place(tex, (tex.image as HTMLImageElement).width / (tex.image as HTMLImageElement).height, false), undefined, card);
    } else card();
  }

  reset() {
    this.dollyT = 0;
    this.flash = 0;
    for (const it of this.items) this.stack.remove(it.obj);
    this.items = [];
    this.slots = [];
    this.tags.clear();
    this.phys.locked = true;
    this.phys.target = 0;
    this.settledNotified = true;
    this.hopTimers.forEach(clearTimeout);
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
    } else this.land(idx, slot ? 0.4 : 0.3);
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
    this.wake();
  }

  unlock(tiltDeg: number) {
    this.phys.locked = false;
    // positieve tilt = voorwerp (links) zakt → theta < 0
    this.phys.target = -tiltDeg * DEG;
    this.settledNotified = false;
    if (!this.reduced) {
      this.dollyT = 1;
      this.hopTimers.push(window.setTimeout(() => ((this.dollyT = 0), this.wake()), 2600));
    }
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

  /** Geen mascotte meer: de stemming wordt een lichtflits in de kleur van de score. */
  setMood(m: Mood) {
    const col = { cool: 0xd7ff4a, happy: 0xd7ff4a, smug: 0x7ee8e2, meh: 0xb79cff, angry: 0xff6a3d, dead: 0xff3d3d } as Record<string, number>;
    if (!(m in col)) return;
    this.flashColor.setHex(col[m]);
    this.flash = 1;
    this.flashLight.color.setHex(col[m]);
    this.wake();
  }

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
        const idx = (h.object as Sprite).userData.idx as number;
        const last = [...this.items].reverse().find((x) => x.idx === idx);
        if (last) return last.id;
      }
    }
    return null;
  }

  poke(clientX: number, clientY: number): 'head' | 'object' | null {
    this.setRay(clientX, clientY);
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

  /** Schermpositie (client-px) boven de wijzerplaat: daar komt het verdict. */
  headScreenPos(): { x: number; y: number } {
    this.camera.updateMatrixWorld();
    const p = new Vector3(0.55, PIVOT_Y + DIAL_R * 0.55, 0).project(this.camera);
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
    if (!this.reduced && heft > 0.45) {
      this.kickV -= heft * strength * 1.4;
      this.puff(1, heft * strength);
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
        if (s > 0.5 && !this.reduced) this.puff(0, s * 0.6);
        this.cb.onLand?.('object', -1, s);
      }
    }
    for (const it of this.items) {
      const s = stepDrop(it.drop, dt, GRAVITY, 5);
      if (s !== null) this.land(it.idx, Math.max(0.15, s));
    }
    // camera: muis-parallax en dramatische dolly bij het wegen
    this.par.lerp(this.parT, Math.min(1, dt * 4));
    this.dollyV += (-60 * (this.dolly - this.dollyT) - 11 * this.dollyV) * dt;
    this.dolly += this.dollyV * dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 0.7);
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
      (p.sprite.material as SpriteMaterial).opacity = Math.max(0, p.life / 0.7) * 0.6;
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
    if (this.puffs.length || this.flash > 0) return false;
    if (this.par.distanceTo(this.parT) > 1e-3 || Math.abs(this.dolly - this.dollyT) > 1e-3 || Math.abs(this.dollyV) > 1e-3) return false;
    if (this.lookTarget && performance.now() < this.lookUntil + 400) return false;
    return this.shakeT === 0 && Math.abs(this.kick) < 1e-3 && Math.abs(this.highlight - this.highlightTarget) < 0.01;
  }

  private sync() {
    const p = this.phys;
    const th = -p.theta;
    this.beam.rotation.z = th;
    for (const side of [0, 1] as const) {
      const s = side === 0 ? -1 : 1;
      const g = this.panGroups[side];
      g.position.set(s * R * Math.cos(th), PIVOT_Y + s * R * Math.sin(th), 0);
      g.rotation.z = p.pans[side].phi;
      const stretch = L + p.pans[side].b * 0.6;
      this.panInner[side].position.y = -stretch;
      this.cables[side].scale.y = stretch / L;
    }
    // naald staat rechtop en slaat uit met de balk
    this.needle.rotation.z = (th - p.needle) * 2.2;
    const la = p.lockAnim;
    this.lock.visible = la > 0.02;
    this.lock.position.y = PIVOT_Y - 0.32 - (1 - la) * 0.35;
    this.shackle.position.y = 0.055 + (1 - Math.min(1, la * 1.5)) * 0.04;
    this.mats.lockBody.opacity = this.mats.lockShackle.opacity = Math.min(1, la * 1.3);
    for (const it of this.items) {
      const sl = this.slots.find((x) => x.id === it.id);
      if (!sl) continue;
      it.obj.scale.setScalar(sl.w / it.baseW);
      it.obj.position.set(sl.x + it.drop.dx, sl.y + it.drop.dy, (((it.id * 7919) % 5) - 2) * 0.012);
    }
    if (this.objectMesh) {
      const d = this.objectDrop;
      this.objectHolder.position.y = -0.04 + (d ? d.dy : 0);
      const squash = d && !d.landed && d.dy < 0.03 && d.vy > 1 ? 0.88 : 1;
      this.objectMesh.scale.set(1 / squash, squash, 1);
    }
    // lichtflits: lichtranden en een puntlicht in de scorekleur
    this.mats.aqua.color.copy(this.baseAqua).lerp(this.flashColor, this.flash);
    this.flashLight.intensity = this.flash * 26;
    this.bloom.strength = 0.5 + this.flash * 0.7;    this.mats.glassRight.emissiveIntensity = this.highlight * 0.5;
    this.camera.position.copy(this.camBase).lerp(this.lookAtPt, this.dolly * 0.22);
    this.camera.position.x += this.par.x * 0.35;
    this.camera.position.y += -this.par.y * 0.18 - this.dolly * 0.25;
    this.camera.position.y += this.kick * 0.15;
    this.camera.position.z += this.kick * 0.25;
    if (this.shakeT > 0) this.camera.position.x += Math.sin(this.shakeT * 70) * 0.08 * (this.shakeT / 0.45);
    this.camera.lookAt(this.lookAtPt);
  }

  private render() {
    this.composer.render();
  }
}

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

