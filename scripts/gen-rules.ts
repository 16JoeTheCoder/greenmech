// Generates firestore.rules from firestore.rules.tpl by substituting admin emails.
// Usage: tsx scripts/gen-rules.ts [--admins a@x.com,b@y.com] [--out path]
import { readFileSync, writeFileSync } from 'node:fs';

export function validateAdmins(list: unknown): string[] {
  if (!Array.isArray(list) || list.length === 0) throw new Error('config/admins.json: "admins" must be a non-empty list');
  for (const e of list) {
    if (typeof e !== 'string') throw new Error('admin email must be a string');
    if (e.includes('<ADMIN_')) throw new Error(`placeholder "${e}" still in config/admins.json. Put the real admin emails there first (see SETUP.md)`);
    if (e !== e.toLowerCase()) throw new Error(`admin email "${e}" must be lowercase`);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error(`"${e}" is not an email`);
  }
  return list as string[];
}

export function render(admins: string[]): string {
  const tpl = readFileSync(new URL('../firestore.rules.tpl', import.meta.url), 'utf8');
  const header = '// GENERATED from firestore.rules.tpl by scripts/gen-rules.ts. Do not edit by hand.\n';
  return header + tpl.replace('__ADMIN_EMAILS__', JSON.stringify(admins).replace(/"/g, "'"));
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (n: string) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const raw = flag('--admins');
  const admins = validateAdmins(raw ? raw.split(',') : JSON.parse(readFileSync('config/admins.json', 'utf8')).admins);
  const out = flag('--out') ?? 'firestore.rules';
  writeFileSync(out, render(admins));
  console.log(`wrote ${out} for ${admins.length} admin(s)`);
}
