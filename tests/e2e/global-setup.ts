import { readFileSync } from 'node:fs';
export default async function () {
  const rules = readFileSync('tests/rules/.test.rules', 'utf8');
  const r = await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-greenmech:securityRules', {
    method: 'PUT',
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }),
  });
  if (!r.ok) throw new Error(`rules load failed: ${r.status} ${await r.text()}`);
}
