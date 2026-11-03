// CI: fails if firestore.rules is out of sync with the template and config/admins.json.
import { existsSync, readFileSync } from 'node:fs';
import { render, validateAdmins } from './gen-rules.ts';

const admins: string[] = JSON.parse(readFileSync('config/admins.json', 'utf8')).admins;
if (admins.some((a) => a.includes('<ADMIN_'))) {
  render(['ci@example.com']); // the template must still render
  console.warn('rules sync skipped: config/admins.json still has placeholders (expected before SETUP step 4)');
  process.exit(0);
}
validateAdmins(admins);
if (!existsSync('firestore.rules') || readFileSync('firestore.rules', 'utf8') !== render(admins)) {
  console.error('firestore.rules is out of sync. Run: npm run rules:gen');
  process.exit(1);
}
console.log('firestore.rules in sync');
