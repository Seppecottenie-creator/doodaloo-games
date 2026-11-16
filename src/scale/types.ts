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

/** Gemeenschappelijke interface voor de 3D-balans en de 2D-fallback. */
export interface ScaleLike {
  setObject(obj: ScaleObject | null, drop?: boolean): void;
  reset(): void;
  addWeight(idx: number, from?: { x: number; y: number }): number;
  removeWeight(id: number): number | undefined;
  removeOne(idx: number): boolean;
  clearWeights(): void;
  unlock(tiltDeg: number): void;
  shake(): void;
  setDropHighlight(on: boolean): void;
  hitTest(clientX: number, clientY: number): number | null;
  isOverRightSide(clientX: number, clientY: number): boolean;
  destroy(): void;
}
