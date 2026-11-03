// Asserts WCAG contrast for every token pair the UI uses, in both themes: 4.5:1 text, 3:1 edges and graphics.
import { readFileSync } from 'node:fs';

const css = readFileSync('src/styles/tokens.css', 'utf8');
function block(sel: RegExp) {
  const m = sel.exec(css);
  if (!m) throw new Error(`no block for ${sel}`);
  return Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((x) => [x[1], x[2]]));
}
const light = block(/:root\s*\{([^}]*)\}/);
const dark = { ...light, ...block(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/) };
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const TEXT: [string, string][] = [
  ['text', 'canvas'],
  ['text', 'surface'],
  ['text-2', 'canvas'],
  ['text-2', 'surface'],
  ['text', 'selected'],
  ['text-2', 'selected'],
  ['text', 'pale'],
  ['text-2', 'pale'],
  ['on-brand', 'brand'],
  ['on-brand', 'brand-hover'],
  ['brand', 'canvas'],
  ['brand', 'surface'],
  ['flare-text', 'canvas'],
  ['flare-text', 'surface'],
  ['success', 'surface'],
  ['success', 'canvas'],
  ['warning', 'surface'],
  ['warning', 'canvas'],
  ['error', 'canvas'],
  ['error', 'surface'],
  ['on-band', 'band'],
  ['on-band-2', 'band'],
  ['text', 'surface'],
];
const EDGE: [string, string][] = [
  ['control-edge', 'canvas'],
  ['control-edge', 'surface'],
  ['control-edge', 'pale'],
  ['flare', 'canvas'],
  ['flare', 'surface'],
  ['brand', 'canvas'],
  ['brand', 'surface'],
  ['focus-on-band', 'band'],
  ['on-band-2', 'band'],
];
let fail = 0;
for (const [name, t] of [
  ['light', light],
  ['dark', dark],
] as const) {
  for (const [pairs, min] of [
    [TEXT, 4.5],
    [EDGE, 3],
  ] as const)
    for (const [fg, bg] of pairs) {
      const r = ratio(t[fg], t[bg]);
      if (r < min) {
        fail++;
        console.error(`${name}: --${fg} on --${bg} = ${r.toFixed(2)} (needs ${min})`);
      }
    }
}
if (fail) process.exit(1);
console.log(`contrast OK: ${(TEXT.length + EDGE.length) * 2} pairs in two themes`);
