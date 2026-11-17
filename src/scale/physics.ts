/**
 * Veer-dempersimulatie van een balans, los van de rendering. Eenheden: meter, seconde, radialen.
 * Conventie: theta > 0 = rechterkant (gewichten) zakt; phi > 0 = schaal zwaait naar rechts.
 */
export interface PanState {
  phi: number;
  w: number;
  /** verticale veer van de schaal, positief = lager */
  b: number;
  vb: number;
  px: number;
  vx: number;
}

export interface Drop {
  /** hoogte boven de rustpositie (positief = hoger) */
  dy: number;
  vy: number;
  dx: number;
  landed: boolean;
  bounces: number;
}

export class BalancePhysics {
  theta = 0;
  omega = 0;
  target = 0;
  locked = true;
  lockAnim = 1;
  needle = 0;
  needleV = 0;
  pans: [PanState, PanState] = [
    { phi: 0, w: 0, b: 0, vb: 0, px: 0, vx: 0 },
    { phi: 0, w: 0, b: 0, vb: 0, px: 0, vx: 0 },
  ];
  reduced = false;
  lastAlpha = 0;

  constructor(
    public R: number,
    public L: number,
  ) {
    this.pans[0].px = -R;
    this.pans[1].px = R;
  }

  attachX(side: 0 | 1, theta = this.theta) {
    return (side === 0 ? -1 : 1) * this.R * Math.cos(theta);
  }

  /** Eén vaste tijdstap. */
  step(dt: number) {
    const k = this.locked ? 900 : 26;
    const c = this.locked ? 38 : this.reduced ? 12 : 2.4;
    const alpha = -k * (this.theta - this.target) - c * this.omega;
    this.lastAlpha = alpha;
    this.omega += alpha * dt;
    this.theta += this.omega * dt;

    const lockGoal = this.locked ? 1 : 0;
    this.lockAnim += (lockGoal - this.lockAnim) * Math.min(1, dt * (this.locked ? 14 : 5));

    const an = -420 * this.needle - (this.reduced ? 40 : 7) * this.needleV - alpha * 0.9;
    this.needleV += an * dt;
    this.needle += this.needleV * dt;

    const g = 18 * this.L; // eigenfrequentie ±0,7 Hz, ongeacht de schaal
    for (const side of [0, 1] as const) {
      const p = this.pans[side];
      const x = this.attachX(side);
      const vx = (x - p.px) / dt;
      const ax = Math.max(-50 * this.L, Math.min(50 * this.L, (vx - p.vx) / dt));
      p.px = x;
      p.vx = vx;
      // het ophangpunt versnelt naar rechts → de schaal blijft achter (zwaait naar links)
      const wdot = -(g / this.L) * Math.sin(p.phi) - (ax / this.L) * Math.cos(p.phi) - (this.reduced ? 8 : 1.5) * p.w;
      p.w += wdot * dt;
      p.phi = Math.max(-0.5, Math.min(0.5, p.phi + p.w * dt));
      const bdd = -520 * p.b - (this.reduced ? 50 : 16) * p.vb;
      p.vb += bdd * dt;
      p.b += p.vb * dt;
    }
  }

  /** Iets landt op een schaal. `mass` 0–1, `strength` 0–1. */
  impact(side: 0 | 1, mass: number, strength: number) {
    this.pans[side].vb += (0.25 + 0.55 * mass) * strength * this.L;
    if (this.locked) this.omega += (side === 1 ? 1 : -1) * 0.25 * mass * strength;
  }

  settled(eps = 1e-3): boolean {
    if (Math.abs(this.theta - this.target) > eps || Math.abs(this.omega) > eps) return false;
    if (Math.abs(this.needle) > eps || Math.abs(this.needleV) > eps * 10) return false;
    for (const p of this.pans) if (Math.abs(p.phi) > eps || Math.abs(p.w) > eps * 10 || Math.abs(p.b) > 2e-4 || Math.abs(p.vb) > 2e-3) return false;
    return Math.abs(this.lockAnim - (this.locked ? 1 : 0)) < 0.005;
  }
}

/** Laat een voorwerp vallen met stuiters. Geeft de impactsterkte (0–1) terug bij de eerste landing. */
export function stepDrop(d: Drop, dt: number, gravity: number, refSpeed: number): number | null {
  d.dx -= d.dx * Math.min(1, dt * 14);
  if (Math.abs(d.dx) < 1e-4) d.dx = 0;
  if (d.landed) return null;
  if (d.dy < 0) {
    // ligt te laag (er kwam iets onder): snel omhoog bijtrekken
    d.dy -= d.dy * Math.min(1, dt * 18);
    if (d.dy > -1e-3) {
      d.dy = 0;
      d.vy = 0;
      d.landed = true;
    }
    return null;
  }
  d.vy += gravity * dt;
  d.dy -= d.vy * dt;
  if (d.dy > 0) return null;
  d.dy = 0;
  const strength = Math.min(1, d.vy / refSpeed);
  const first = d.bounces === 0;
  if (d.vy > refSpeed * 0.2 && d.bounces < 2) {
    d.vy = -d.vy * 0.24;
    d.bounces++;
  } else {
    d.vy = 0;
    d.landed = true;
  }
  return first ? strength : null;
}

export function dropSettled(d: Drop) {
  return d.landed && d.dx === 0;
}
