let on = true;
export function setHapticsEnabled(v: boolean) {
  on = v;
}
export function buzz(pattern: number | number[]) {
  if (!on) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* niet ondersteund */
  }
}
