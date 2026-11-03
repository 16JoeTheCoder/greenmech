import type { TS } from './types';
export function ago(t: TS | undefined, now = Date.now()): string {
  if (!t) return 'just now';
  const s = Math.max(0, (now - t.toMillis()) / 1000);
  if (s < 60) return 'just now';
  const m = s / 60, h = m / 60, d = h / 24;
  if (m < 60) return `${Math.floor(m)} min ago`;
  if (h < 24) return `${Math.floor(h)} h ago`;
  if (d < 2) return 'yesterday';
  return `${Math.floor(d)} days ago`;
}
export const daysSince = (t: TS | undefined, now = Date.now()) => (t ? (now - t.toMillis()) / 86400000 : 0);
