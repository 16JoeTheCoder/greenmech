import { execSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
let sha = process.env.CF_PAGES_COMMIT_SHA;
if (!sha) { try { sha = execSync('git rev-parse HEAD').toString().trim(); } catch { sha = 'unknown'; } }
const out = process.argv[2] ?? 'dist';
if (existsSync(out)) writeFileSync(`${out}/version.json`, JSON.stringify({ sha, builtAt: new Date().toISOString() }) + '\n');
