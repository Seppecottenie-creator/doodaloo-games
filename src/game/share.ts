import { CONFIG } from './config';
import { maxTotal, scoreSquare } from './score';
import type { GameObject, RoundResult } from './types';
import { t } from '../i18n';

export function shareText(number: number | null, results: RoundResult[], objects: GameObject[]): string {
  const total = results.reduce((s, r) => s + r.score, 0);
  const byId = new Map(objects.map((o) => [o.id, o]));
  return [
    t.end.shareHeader(number, total, maxTotal()),
    results.map((r) => scoreSquare(r.score)).join(''),
    results.map((r) => byId.get(r.objectId)?.emoji ?? '❔').join(' '),
    CONFIG.shareUrl,
  ].join('\n');
}

/** navigator.share waar het kan, anders het klembord. Geeft terug wat er gebeurde. */
export async function shareResult(text: string): Promise<'shared' | 'copied' | 'failed'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const isTouch = matchMedia('(pointer: coarse)').matches;
  if (nav.share && isTouch) {
    try {
      await nav.share({ text });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'failed';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    // laatste redmiddel
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok ? 'copied' : 'failed';
  }
}
