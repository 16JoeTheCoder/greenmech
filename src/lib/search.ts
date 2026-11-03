import type { Connection, Module } from './types';
export interface Hit { kind: 'module' | 'connection'; id: string; slug: string; score: number }

/** Subsequence fuzzy score: 0 means no match; contiguous and prefix matches score higher. */
export function fuzzy(q: string, text: string): number {
  q = q.toLowerCase(); text = text.toLowerCase();
  if (!q) return 0;
  const idx = text.indexOf(q);
  if (idx === 0) return 100 - text.length * 0.1;
  if (idx > 0) return 70 - idx * 0.5;
  let ti = 0, run = 0, score = 0;
  for (const ch of q) {
    const f = text.indexOf(ch, ti);
    if (f < 0) return 0;
    run = f === ti ? run + 1 : 0;
    score += 1 + run;
    ti = f + 1;
  }
  return Math.min(50, score);
}

export function search(q: string, modules: Module[], conns: Connection[], limit = 8): Hit[] {
  q = q.trim();
  if (!q) return [];
  const byId = new Map(modules.map((m) => [m.id, m]));
  const hits: Hit[] = [];
  for (const m of modules) {
    const s = Math.max(
      fuzzy(q, m.slug),
      ...m.purpose.toLowerCase().split(/\s+/).map((w) => fuzzy(q, w) * 0.6),
      m.leaderInitials && m.leaderInitials.toLowerCase() === q.toLowerCase() ? 60 : 0,
    );
    if (s > 0) hits.push({ kind: 'module', id: m.id, slug: m.slug, score: s });
  }
  for (const c of conns) {
    const ends = [byId.get(c.aId)?.slug ?? '', byId.get(c.bId)?.slug ?? ''];
    const s = Math.max(fuzzy(q, c.slug), ...ends.map((e) => fuzzy(q, e) * 0.5));
    if (s > 0) hits.push({ kind: 'connection', id: c.id, slug: c.slug, score: s });
  }
  return hits.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug)).slice(0, limit);
}
