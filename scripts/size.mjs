// Initial JS budget: entry chunk + its static imports, gzip. Target 250 KB, hard cap 320 KB.
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const html = readFileSync('dist/index.html', 'utf8');
const entry = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const seen = new Set();
const walk = (f) => { if (seen.has(f)) return; seen.add(f); const s = readFileSync(`dist/${f}`, 'utf8'); for (const m of s.matchAll(/(?:^|[;\s])import\s*(?:[\w{},*\s$]+from\s*)?["']\.\/([^"']+\.js)["']/g)) walk(`assets/${m[1]}`); };
entry.forEach(walk);
const kb = [...seen].reduce((a, f) => a + gzipSync(readFileSync(`dist/${f}`)).length, 0) / 1024;
const all = readdirSync('dist/assets').filter((f) => f.endsWith('.js')).reduce((a, f) => a + gzipSync(readFileSync(`dist/assets/${f}`)).length, 0) / 1024;
console.log(`initial JS ${kb.toFixed(1)} KB gzip (${seen.size} files); all JS ${all.toFixed(1)} KB gzip`);
if (kb > 320) { console.error('over the 320 KB cap'); process.exit(1); }
if (kb > 250) console.warn('over the 250 KB target: justify in DECISIONS.md');
