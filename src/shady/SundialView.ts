/**
 * De 3D-scène van Shady: zwevende scherven boven een lichte vloer, en een zon die je over de hemel sleept.
 * De schaduw is een echte shadow map van een DirectionalLight: precies dezelfde parallelle projectie als de score.
 */
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  BoxGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, cellX, clampEl, GROUND, kOf, SLAB, sunDir, type Puzzle, type Sun } from './logic';

const SUN_R = 8.5;
const TEX = 1024;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,250,220,1)');
  grd.addColorStop(0.25, 'rgba(255,214,120,0.75)');
  grd.addColorStop(1, 'rgba(255,160,60,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export class SundialView {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(36, 1, 0.1, 200);
  private light = new DirectionalLight(0xfff1d6, 3);
  private sculpture = new Group();
  private sunMesh: Mesh;
  private glow: Sprite;
  private orbit: LineLoop;
  private ray: Line;
  private overlayCanvas = document.createElement('canvas');
  private overlayTex: CanvasTexture;
  private mat: MeshPhysicalMaterial;
  private ground: Mesh;
  private env: Texture;
  private raf = 0;
  private ro: ResizeObserver;
  private dragging = false;
  private lastPt = { x: 0, y: 0 };
  private anim: { from: Sun; to: Sun; t0: number; ms: number } | null = null;
  sun: Sun = { az: 0, el: 1 };
  locked = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private onSun: (s: Sun) => void,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.85;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    const pm = new PMREMGenerator(this.renderer);
    // reflecties alleen op het beeld: de vloer blijft donker in de schaduw
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();

    // vloer: licht pleister, zodat de schaduw er diep op afsteekt
    this.ground = new Mesh(new CircleGeometry(GROUND, 96), new MeshStandardMaterial({ color: 0xcbc0f2, roughness: 0.95, metalness: 0, envMapIntensity: 0 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    // rand van de vloer
    const rimPts: number[] = [];
    for (let i = 0; i < 128; i++) rimPts.push(Math.cos((i / 128) * Math.PI * 2) * GROUND, 0.01, Math.sin((i / 128) * Math.PI * 2) * GROUND);
    const rimGeo = new BufferGeometry();
    rimGeo.setAttribute('position', new Float32BufferAttribute(rimPts, 3));
    this.scene.add(new LineLoop(rimGeo, new LineBasicMaterial({ color: 0x8b72e0, transparent: true, opacity: 0.6 })));

    // doelvorm: een doorzichtige laag net boven de vloer
    this.overlayCanvas.width = this.overlayCanvas.height = TEX;
    this.overlayTex = new CanvasTexture(this.overlayCanvas);
    this.overlayTex.colorSpace = SRGBColorSpace;
    this.overlayTex.anisotropy = 4;
    const overlay = new Mesh(
      new CircleGeometry(GROUND, 96),
      new MeshBasicMaterial({ map: this.overlayTex, transparent: true, depthWrite: false, toneMapped: false }),
    );
    overlay.rotation.x = -Math.PI / 2;
    overlay.position.y = 0.006;
    overlay.renderOrder = 1;
    this.scene.add(overlay);

    this.mat = new MeshPhysicalMaterial({
      color: 0x8f6dff,
      metalness: 0.5,
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      iridescence: 0.8,
      iridescenceIOR: 1.6,
      iridescenceThicknessRange: [200, 700],
      envMap: this.env,
    });
    this.scene.add(this.sculpture);

    this.scene.add(new HemisphereLight(0x8d86d8, 0x1a1430, 0.45));
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    const sc = this.light.shadow.camera;
    sc.left = sc.bottom = -GROUND - 1;
    sc.right = sc.top = GROUND + 1;
    sc.near = 1;
    sc.far = 60;
    sc.updateProjectionMatrix();
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.02;
    this.light.shadow.radius = 3;
    this.scene.add(this.light, this.light.target);

    // de zon zelf, met gloed, baan en lichtstraal
    this.sunMesh = new Mesh(new SphereGeometry(0.42, 32, 16), new MeshBasicMaterial({ color: 0xfff3c4, toneMapped: false }));
    this.glow = new Sprite(new SpriteMaterial({ map: glowTexture(), blending: AdditiveBlending, transparent: true, depthWrite: false }));
    this.glow.scale.setScalar(3.6);
    this.scene.add(this.sunMesh, this.glow);
    const orbitPts: number[] = [];
    for (let i = 0; i < 128; i++) orbitPts.push(Math.cos((i / 128) * Math.PI * 2), 0, Math.sin((i / 128) * Math.PI * 2));
    const og = new BufferGeometry();
    og.setAttribute('position', new Float32BufferAttribute(orbitPts, 3));
    this.orbit = new LineLoop(og, new LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.35 }));
    this.scene.add(this.orbit);
    const rg = new BufferGeometry();
    rg.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    this.ray = new Line(rg, new LineBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.5 }));
    this.scene.add(this.ray);

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.loop();
  }

  private mats: MeshPhysicalMaterial[] = [];

  /** Bouw de scherven: elk stuk is een dunne plaat op zijn eigen hoogte, opgetild langs de straal van de geheime zon. */
  setPuzzle(pz: Puzzle) {
    this.sculpture.children.forEach((m) => (m as Mesh).geometry.dispose());
    this.sculpture.clear();
    this.mats.forEach((m) => m.dispose());
    this.mats = [];
    const [kx, kz] = kOf(pz.target);
    const hues = [0.72, 0.5, 0.83, 0.78, 0.55, 0.9];
    pz.pieces.forEach((p, n) => {
      // per rij: aaneengesloten cellen worden één balkje
      const rows = new Map<number, number[]>();
      for (const [i, j] of p.cells) (rows.get(j) ?? rows.set(j, []).get(j)!).push(i);
      const boxes: BufferGeometry[] = [];
      for (const [j, is] of rows) {
        is.sort((a, b) => a - b);
        let start = is[0];
        let prev = is[0];
        const flush = () => {
          const len = prev - start + 1;
          const g = new BoxGeometry(len * CELL, SLAB, CELL);
          g.translate((cellX(start) + cellX(prev)) / 2, 0, cellX(j));
          boxes.push(g);
        };
        for (const i of is.slice(1)) {
          if (i === prev + 1) prev = i;
          else {
            flush();
            start = prev = i;
          }
        }
        flush();
      }
      const geo = mergeGeometries(boxes);
      boxes.forEach((g) => g.dispose());
      const mat = this.mat.clone();
      mat.color = new Color().setHSL(hues[n % hues.length], 0.75, 0.62);
      mat.emissive = mat.color.clone();
      mat.emissiveIntensity = 0;
      mat.transparent = true;
      mat.opacity = 0.82;
      this.mats.push(mat);
      const m = new Mesh(geo, mat);
      const y = p.h + SLAB / 2;
      m.position.set(kx * y, y, kz * y);
      m.castShadow = true;
      this.sculpture.add(m);
    });
    this.drawFloor();
    this.setHeat(0);
    this.locked = false;
    this.anim = null;
    this.setSun(pz.start);
  }

  /** Hoe dichter bij de vorm, hoe meer de scherven gloeien. */
  setHeat(h: number) {
    for (const m of this.mats) m.emissiveIntensity = h * 0.55;
  }

  private drawFloor() {
    const g = this.overlayCanvas.getContext('2d')!;
    const S = TEX;
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgba(80,60,150,0.13)';
    g.lineWidth = 1;
    for (let i = 0; i <= 24; i++) {
      const q = (i / 24) * S;
      g.beginPath();
      g.moveTo(q, 0);
      g.lineTo(q, S);
      g.moveTo(0, q);
      g.lineTo(S, q);
      g.stroke();
    }
    this.overlayTex.needsUpdate = true;
  }

  setSun(s: Sun) {
    this.sun = { az: ((s.az % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), el: clampEl(s.el) };
    const d = new Vector3(...sunDir(this.sun));
    this.light.position.copy(d).multiplyScalar(25);
    this.light.target.position.set(0, 0, 0);
    const sp = d.clone().multiplyScalar(SUN_R);
    this.sunMesh.position.copy(sp);
    this.glow.position.copy(sp);
    // zonsondergang: lager = warmer en zachter licht
    const low = 1 - (this.sun.el - 0.3) / 1.1;
    this.light.color.setRGB(1, 0.93 - low * 0.18, 0.82 - low * 0.35);
    (this.sunMesh.material as MeshBasicMaterial).color.setRGB(1, 0.95 - low * 0.25, 0.75 - low * 0.4);
    const r = Math.cos(this.sun.el) * SUN_R;
    this.orbit.scale.set(r, 1, r);
    this.orbit.position.y = Math.sin(this.sun.el) * SUN_R;
    const pos = this.ray.geometry.getAttribute('position') as Float32BufferAttribute;
    pos.setXYZ(0, sp.x, sp.y, sp.z);
    pos.setXYZ(1, 0, 0, 0);
    pos.needsUpdate = true;
    this.canvas.parentElement?.style.setProperty('--dusk', low.toFixed(3));
    this.onSun(this.sun);
  }

  /** Zon vloeiend naar een stand brengen (bv. de echte zon na het vastzetten). */
  animateTo(to: Sun, ms = 1100) {
    let dAz = to.az - this.sun.az;
    dAz = ((dAz + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.anim = { from: { ...this.sun }, to: { az: this.sun.az + dAz, el: to.el }, t0: performance.now(), ms };
  }

  nudge(dAz: number, dEl: number) {
    if (this.locked) return;
    this.setSun({ az: this.sun.az + dAz, el: this.sun.el + dEl });
  }

  private onDown = (e: PointerEvent) => {
    if (this.locked) return;
    this.dragging = true;
    this.lastPt = { x: e.clientX, y: e.clientY };
    this.canvas.setPointerCapture?.(e.pointerId);
  };
  private onMove = (e: PointerEvent) => {
    if (!this.dragging || this.locked) return;
    const dx = e.clientX - this.lastPt.x;
    const dy = e.clientY - this.lastPt.y;
    this.lastPt = { x: e.clientX, y: e.clientY };
    // horizontaal slepen = zon rond, verticaal = zon hoger of lager
    this.setSun({ az: this.sun.az + dx * 0.0085, el: this.sun.el - dy * 0.0065 });
  };
  private onUp = () => {
    this.dragging = false;
  };

  private resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // gsm (staand): verder weg zodat de hele vloer en de zon in beeld blijven
    const far = w / h < 0.9 ? 1.6 : w / h < 1.3 ? 1.45 : 1.3;
    this.camera.position.set(0, 14 * far, 8.5 * far);
    // staand scherm: vloer iets lager, zon en hemel krijgen de ruimte erboven
    this.camera.lookAt(0, w / h < 0.9 ? 1.4 : 0.4, 0);
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    if (this.anim) {
      const t = Math.min(1, (performance.now() - this.anim.t0) / this.anim.ms);
      const e = 1 - Math.pow(1 - t, 3);
      const { from, to } = this.anim;
      this.setSun({ az: from.az + (to.az - from.az) * e, el: from.el + (to.el - from.el) * e });
      if (t >= 1) this.anim = null;
    }
    const pulse = 1 + Math.sin(performance.now() / 400) * 0.06;
    this.glow.scale.setScalar(3.6 * pulse);
    this.renderer.render(this.scene, this.camera);
  };

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.renderer.dispose();
  }
}
