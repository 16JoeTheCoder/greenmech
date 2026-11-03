// Inverse-operation undo. Pure: given what we wrote and what the doc looks like now, decide if undo is safe.
export interface UndoEntry {
  label: string;
  /** Fields this action set, with the values it set them to. Conflict if any differ now or someone else wrote since. */
  wrote: Record<string, unknown>;
  targetPath: string | null;
  run: () => Promise<void>;
  at: number;
}
export const UNDO_MS = 10000;

const eq = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object), kb = Object.keys(b as object);
    return ka.length === kb.length && ka.every((k) => eq((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
};

export function undoConflict(entry: UndoEntry, current: Record<string, unknown> | undefined, myUid: string): boolean {
  if (!entry.targetPath) return false;
  if (!current) return true;
  if (current.updatedBy !== undefined && current.updatedBy !== myUid) return true;
  return Object.entries(entry.wrote).some(([k, v]) => !eq(current[k], v));
}
