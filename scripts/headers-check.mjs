// Serves dist with wrangler (Pages runtime) and checks headers, SPA fallback and that /api and /__/auth are not rewritten.
import { spawn } from 'node:child_process';
const w = spawn('npx', ['wrangler', 'pages', 'dev', 'dist', '--port', '8788', '--ip', '127.0.0.1'], { stdio: 'ignore' });
const base = 'http://127.0.0.1:8788';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}`); if (!c) fails++; };
try {
  for (let i = 0; i < 60; i++) { try { await fetch(base); break; } catch { await sleep(500); } }
  const root = await fetch(base + '/');
  ok(root.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"), 'CSP on /');
  ok(root.headers.get('x-content-type-options') === 'nosniff', 'nosniff on /');
  ok(!root.headers.get('cross-origin-opener-policy'), 'no COOP header');
  const deep = await fetch(base + '/m/xyz');
  ok(deep.status === 200 && (await deep.text()).includes('id="app"'), '/m/xyz hard refresh returns the app');
  const h = await fetch(base + '/api/health');
  ok(h.headers.get('content-type') === 'application/json' && h.headers.get('cache-control') === 'no-store' && (await h.json()).ok === true, '/api/health JSON, no-store');
  const a = await fetch(base + '/__/auth/handler', { redirect: 'manual' });
  ok(!(await a.text()).includes('id="app"'), '/__/auth/handler is proxied, not the SPA');
  const v = await fetch(base + '/version.json');
  ok((await v.json().catch(() => ({}))).sha?.length > 6, 'version.json has a commit sha');
} finally { w.kill(); }
process.exit(fails ? 1 : 0);
