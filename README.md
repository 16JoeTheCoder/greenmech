# Greenmech

Planning and tracking dashboard for the Greenmech chain-reaction machine. Preact + Vite + Firebase (Auth, Firestore), hosted on Cloudflare Pages. Admin setup: [SETUP.md](SETUP.md). Design rules: [DESIGN.md](DESIGN.md). Why things are the way they are: [DECISIONS.md](DECISIONS.md).

## Requirements

Node 22 (`.nvmrc`), JDK 21 for the Firestore emulator.

## Commands

| Command | What it does |
|---|---|
| `npm run dev:emu` | App on http://localhost:5173 against local Auth and Firestore emulators. Sign in with the fixture form (for example `admin@test.example`). |
| `npm run dev` | App against the real project in `.env.local`. |
| `npm run test:unit` | Vitest: slug, connection state, markdown sanitizer, SVG/GMM validator, search, undo. |
| `npm run test:rules` | 136 security-rules tests against the Firestore emulator. |
| `npm run test:e2e` | Builds with emulators and runs Playwright at 390 and 1440 px. |
| `npm run gate:a` | Everything: typecheck, lint, format, contrast, rules sync, unit, rules, build, size, e2e. CI runs this. |
| `npm run rules:gen` | Regenerates `firestore.rules` from the template and `config/admins.json`. |
| `npm run contrast` | Asserts token contrast in both themes. |

Emulator data starts empty. E2E tests seed it via `tests/e2e/fixtures.ts`; for manual work, sign in as `admin@test.example`, add the team in Manage and import the sample structure.

## Layout

`src/lib` pure logic (unit-tested), `src/state` Firebase and app state, `src/routes` pages, `src/components` shared UI, `functions/` Cloudflare Pages Functions (auth proxy, health), `tests/{unit,rules,e2e}`.
