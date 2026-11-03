import type { Status } from './types';
export const STATUS: { word: string; icon: string; key: string }[] = [
  { word: 'Idea', icon: 'bulb', key: 'idea' },
  { word: 'Planning', icon: 'pencil', key: 'planning' },
  { word: 'Building', icon: 'hammer', key: 'building' },
  { word: 'Done', icon: 'check', key: 'done' },
];
export const statusWord = (s: Status) => STATUS[s].word;
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
