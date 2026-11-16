import type { ScaleCallbacks, ScaleLike } from './types';
import { ScaleView } from './ScaleView';

type Ctor = new (canvas: HTMLCanvasElement, cb?: ScaleCallbacks) => ScaleLike;
let mod: Promise<Ctor | null> | null = null;
let icons: Promise<string[] | null> | null = null;

/** De 10 gewichten, één keer in 3D gerenderd als PNG (data-URL's) voor de lade. */
export function weightIcons(): Promise<string[] | null> {
  icons ??= preloadScale().then((C) =>
    C
      ? import('./ScaleView3D').then((m) => {
          try {
            return m.renderWeightIcons();
          } catch {
            return null;
          }
        })
      : null,
  );
  return icons;
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Laadt de 3D-balans (Three.js) apart, zodat de homepagina snel blijft. */
export function preloadScale(): Promise<Ctor | null> {
  mod ??= hasWebGL()
    ? import('./ScaleView3D').then((m) => m.ScaleView3D as Ctor).catch(() => null)
    : Promise.resolve(null);
  return mod;
}

export async function createScale(canvas: HTMLCanvasElement, cb: ScaleCallbacks): Promise<ScaleLike> {
  const C = await preloadScale();
  if (C) {
    try {
      return new C(canvas, cb);
    } catch {
      /* WebGL faalt toch: 2D-fallback */
    }
  }
  return new ScaleView(canvas, cb);
}
