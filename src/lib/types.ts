import type { Timestamp } from 'firebase/firestore';
export type Port = 'none' | 'ball' | 'spin' | 'push' | 'water' | 'other';
export type Status = 0 | 1 | 2 | 3;
export type Role = 'admin' | 'member' | 'coach' | 'none';
export type TS = Timestamp | null;
export interface Module {
  id: string;
  slug: string;
  status: Status;
  tier: number;
  order: number;
  purpose: string;
  hasModel: boolean;
  ports: { in: Port; out: Port };
  leaderUid: string | null;
  leaderInitials: string | null;
  createdAt: TS;
  createdBy: string;
  updatedAt: TS;
  updatedBy: string;
  deletedAt: TS;
}
export interface Connection {
  id: string;
  slug: string;
  aId: string;
  bId: string;
  state: 1 | 2 | 3;
  createdAt: TS;
  createdBy: string;
  updatedAt: TS;
  updatedBy: string;
  deletedAt: TS;
}
export interface Idea {
  id: string;
  moduleId: string;
  text: string;
  authorUid: string;
  authorInitials: string;
  createdAt: TS;
}
export interface Flag {
  id: string;
  moduleId: string;
  text: string;
  authorUid: string;
  authorInitials: string;
  resolved: boolean;
  resolvedBy: string | null;
  createdAt: TS;
  resolvedAt: TS;
}
export interface Ref {
  id: string;
  moduleId: string;
  kind: 'link' | 'vector';
  title: string;
  url: string | null;
  data: string | null;
  authorUid: string;
  createdAt: TS;
}
export interface Activity {
  id: string;
  at: TS;
  actorUid: string;
  actorInitials: string;
  type: string;
  targetKind: 'module' | 'connection' | 'team' | 'data';
  targetId: string;
  targetSlug: string | null;
  summary: string;
}
export const PORTS: Port[] = ['none', 'ball', 'spin', 'push', 'water', 'other'];
