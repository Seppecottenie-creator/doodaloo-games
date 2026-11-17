/**
 * Het zwevende blokbeeld van Shady. Draait vanzelf, laat zich slepen, en kan naar een as draaien
 * om te tonen vanwaar de echte schaduw kwam.
 */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  Euler,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Cube } from './logic';

const AXIS_VIEW: Quaternion[] = [
  new Quaternion().setFromEuler(new Euler(0, -Math.PI / 2, 0)), // langs x
  new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0)), // langs y
  new Quaternion(), // langs z
];

export class SculptureView {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(32, 1, 0.1, 100);
  private pivot = new Group();
  private holder = new Group();
  private geo = new RoundedBoxGeometry(0.96, 0.96, 0.96, 3, 0.1);
  private mat: MeshPhysicalMaterial;
  private raf = 0;
  private last = performance.now();
  private spin = new Quaternion();
  private dragging = false;
  private lastPt = { x: 0, y: 0 };
  private resumeAt = 0;
  private target: Quaternion | null = null;
  private pop = 1;
  private ro: ResizeObserver;
  private dist = 9;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const pm = new PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    this.mat = new MeshPhysicalMaterial({
      color: 0x8f6dff,
      metalness: 0.55,
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      iridescence: 0.9,
      iridescenceIOR: 1.6,
      iridescenceThicknessRange: [200, 700],
    });
    this.scene.add(new AmbientLight(0xffffff, 0.35));
    const key = new DirectionalLight(0xffffff, 2.4);
    key.position.set(4, 6, 8);
    const rim = new DirectionalLight(0x7ee8e2, 1.6);
    rim.position.set(-6, -2, -4);
    const pink = new DirectionalLight(0xe25cf1, 1.1);
    pink.position.set(6, -4, 2);
    this.scene.add(key, rim, pink);
    this.pivot.add(this.holder);
    this.scene.add(this.pivot);
    this.pivot.quaternion.setFromEuler(new Euler(0.5, 0.7, 0));
    this.camera.position.set(0, 0, this.dist);

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.loop();
  }

  setSculpture(cubes: Cube[], size: number) {
    this.holder.clear();
    const c = new Vector3();
    for (const [x, y, z] of cubes) c.add(new Vector3(x, y, z));
    c.divideScalar(cubes.length);
    for (const [x, y, z] of cubes) {
      const m = new Mesh(this.geo, this.mat);
      m.position.set(x - c.x, y - c.y, z - c.z);
      this.holder.add(m);
    }
    this.dist = size >= 4 ? 11 : 9;
    this.target = null;
    this.pop = 0;
    // nieuwe willekeurige startstand, nooit recht op een as
    this.pivot.quaternion.setFromEuler(new Euler(0.35 + Math.random() * 0.5, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.4));
  }

  /** Draai zodat we langs een as kijken: dat is precies de echte schaduw. */
  showAxis(axis: number) {
    this.target = AXIS_VIEW[axis].clone();
  }

  private onDown = (e: PointerEvent) => {
    this.dragging = true;
    this.target = null;
    this.lastPt = { x: e.clientX, y: e.clientY };
    this.canvas.setPointerCapture?.(e.pointerId);
  };
  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPt.x;
    const dy = e.clientY - this.lastPt.y;
    this.lastPt = { x: e.clientX, y: e.clientY };
    const q = new Quaternion().setFromEuler(new Euler(dy * 0.01, dx * 0.01, 0));
    this.pivot.quaternion.premultiply(q);
  };
  private onUp = () => {
    if (!this.dragging) return;
    this.dragging = false;
    this.resumeAt = performance.now() + 1600;
  };

  private resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.target) {
      this.pivot.quaternion.slerp(this.target, 1 - Math.pow(0.0005, dt));
    } else if (!this.dragging && now > this.resumeAt) {
      this.spin.setFromEuler(new Euler(0, dt * 0.55, 0));
      this.pivot.quaternion.premultiply(this.spin);
    }
    // inzoomen met een veertje bij een nieuw beeld
    this.pop = Math.min(1, this.pop + dt * 3.2);
    const p = this.pop;
    const s = 1 - Math.pow(1 - p, 3) * (1 - p * 2.2 * (1 - p));
    this.holder.scale.setScalar(Math.max(0.01, s));
    this.holder.position.y = Math.sin(now / 900) * 0.08;
    const portrait = this.camera.aspect < 0.9;
    this.camera.position.z += ((portrait ? this.dist * 1.15 : this.dist) - this.camera.position.z) * 0.1;
    this.renderer.render(this.scene, this.camera);
  };

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.geo.dispose();
    this.mat.dispose();
    this.renderer.dispose();
  }
}
