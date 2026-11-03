import type { Connection, Module, Port } from './types';
export type EffState = 'locked' | 'ready' | 'progress' | 'connected';
export const CONN_META: Record<EffState, { word: string; icon: string; rank: number }> = {
  ready: { word: 'Ready', icon: 'player-play', rank: 0 },
  progress: { word: 'In progress', icon: 'loader', rank: 1 },
  locked: { word: 'Locked', icon: 'lock', rank: 2 },
  connected: { word: 'Connected', icon: 'check', rank: 3 },
};
export interface Eff { state: EffState; wasStored: 1 | 2 | 3; waitingFor: Module[]; adapter: boolean }

export function effective(c: Connection, a: Module | undefined, b: Module | undefined): Eff {
  const waitingFor = [a, b].filter((m): m is Module => !!m && m.status !== 3);
  const adapter = !!a && !!b && portsMismatch(a.ports.out, b.ports.in);
  if (!a || !b || waitingFor.length) return { state: 'locked', wasStored: c.state, waitingFor, adapter };
  return { state: c.state === 1 ? 'ready' : c.state === 2 ? 'progress' : 'connected', wasStored: c.state, waitingFor, adapter };
}
export function portsMismatch(out: Port, inn: Port): boolean {
  if (out === 'none' || inn === 'none' || out === 'other' || inn === 'other') return false;
  return out !== inn;
}
export const pairId = (aId: string, bId: string) => `${aId}__${bId}`;
export function lockedText(e: Eff): string {
  if (e.state !== 'locked') return '';
  const was = e.wasStored === 3 ? ' (was connected)' : e.wasStored === 2 ? ' (was in progress)' : '';
  return `Locked${was}`;
}
