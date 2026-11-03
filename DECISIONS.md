# Decisions

Each entry: what was decided, and why. "Unverified" means the official page could not be fetched from the build environment (see Blocked hosts).

## Platform facts

- **Firestore Spark quotas (unverified).** Built against the brief's reference figures: about 50,000 document reads, 20,000 writes and 20,000 deletes per day, 1 GiB stored. Re-check on the Firebase pricing page before launch. The read plan targets under 5,000 reads a day for seven users: three listeners (modules, connections, open flags), one-shot reads elsewhere, the Monitor activity query capped at 30 docs.
- **Rules `get()` limits (unverified, partly evidenced).** Documented limit as understood: 10 `get`/`exists`/`getAfter` calls per single-document request, 20 per batched write or transaction. Every rule path stays at or under 5 distinct document reads (allowlist entry, two end modules, slug registry entry, target doc); the 136 emulator tests exercise the heaviest paths (connection create and advance in a batch) and pass.
- **Cloudflare Pages Functions vs Workers static assets (unverified).** Cloudflare has been steering new projects toward Workers with static assets. The brief names Pages plus Pages Functions and the custom domain flow, so v1 ships on Pages; `functions/` maps one-to-one onto a Worker if the move is needed later. Re-check Cloudflare's guidance before creating the project.
- **Auth redirect best practices (unverified).** Implemented option "proxy auth requests to firebaseapp.com" from Firebase's redirect best-practices page: `authDomain` is the app's own host and `functions/__/auth/[[path]].ts` forwards `/__/auth/*` with `redirect: 'manual'`. Popup on desktop, redirect on touch devices or when the popup is blocked.

## Design

- **Palette: Forest & Flare, not the global brand tokens.** The owner's global setup lists ink, paper and fire tokens, but this project's brief pins Forest & Flare and says it must be followed exactly. A project brief is more specific than a global default, so Forest & Flare wins here.
- **One extra token, `--pale`.** Filtered-out bays need a pale fill that keeps full-contrast text (brief section 4). It lives in `tokens.css` with the others and is covered by the contrast script.
- **Hatching.** The Building bay pattern is an SVG `<pattern>`; the small legend swatch uses `repeating-linear-gradient` as a hatch pattern. It is a pattern, not a decorative gradient.
- **Literal colours outside `tokens.css`.** `index.html` `theme-color`, `manifest.webmanifest` and `public/icon.svg` need literal values that cannot read CSS variables. They repeat token values; stylelint `color-no-hex` covers all CSS.
- **Display face.** Slugs use Geist Mono 500 everywhere, including the headline, as the brief requires. At display size the mono reads lighter than the 600 sans next to it; kept, because consistency was a prototype defect (row 19).
- **Connections view.** Tier floor rules are hidden in the Connections view so the orthogonal lines read clearly; the Modules view keeps them.

## Engineering

- **Admin emails.** `config/admins.json` ships with placeholders, as the brief asks. `gen-rules.ts` refuses placeholders, so `firestore.rules` does not exist until SETUP step 4. `check-rules-sync.ts` therefore skips the sync check (with a warning) while placeholders remain, but still renders the template so a broken template fails CI. Tests generate rules for `admin@test.example`.
- **Admin without an allowlist entry signs activity as `ADM`.** Rules need an initials value for every activity write; an admin with no member entry gets the fixed `ADM`.
- **Undo for deleted ideas, flags and refs** re-creates the same id and content. Rules accept a `createdAt` at or before request time for this. A deleted flag comes back unresolved, because the rules only allow creating open flags.
- **Undo conflict detection** compares the fields the action wrote and `updatedBy`, not just `updatedAt`. This is stricter (any later write by another person blocks undo) and avoids timestamp-equality pitfalls with server timestamps.
- **Leader reassignment** needs each member's uid, which the allowlist does not store (privacy: email and initials only). Manage learns uids from the activity log and current leaders, so a member appears in the leader picker after their first action. Documented in the UI.
- **12 references per module** is enforced in the client only; rules cannot count documents.
- **Client-written audit entries can be forged by a member** (they control their browser). Rules force `actorUid` to equal the caller and `at` to be request time, so a member cannot impersonate another person, but they can write misleading summaries about themselves. The activity log is for coordination, not discipline. This is stated in Manage, Activity.
- **Firebase pinned to v12** because `@firebase/rules-unit-testing@5` needs `firebase@^12`. `@firebase/app` and `@firebase/app-compat` are pinned with `overrides` to fix a duplicate-package install that broke both auth registration and the rules tests.
- **Bundle.** The initial JS is about 216 KB gzip (target 250, cap 320), almost all of it Firebase Auth and Firestore. Module page, Connections, Monitor, Manage and Help are lazy chunks.
- **Firestore connectivity probe.** The Firestore SDK requests `www.google.com/images/cleardot.gif` when probing the connection. It is SDK transport, not an asset; the CSP blocks it as an image in production and Firestore falls back without it. The offline test ignores it.
- **Committed `firestore.rules`.** Not committed yet on purpose: it can only be generated once real admin emails replace the placeholders (SETUP step 4). The sync check enforces it from then on.
- **Admin emails ship in the client bundle** (`config/admins.json`), as the brief designs it. Client admin status only decides which controls render; the rules are the boundary.
- **Google-only sign-in** is enforced in the rules (`sign_in_provider == 'google.com'`) as well as in the console.
- **Undo of a deleted idea, flag or reference** re-creates it with a fresh `createdAt` (rules forbid backdating), so it moves to the top of its list.
- **Shared computers.** Sign-out terminates Firestore and clears its offline cache before returning to the sign-in screen.
- **Accepted (P3):** access requests have no cap (only the admin reads them; Deny removes them); lists of ideas, flags and refs show the newest 50; no rate limit on `/__/auth/*` in code. Add a Cloudflare rate-limiting rule for that path if abuse appears.
- **Ports.** "none" and "other" never trigger "Adapter needed"; only two concrete, different carriers do.

## Blocked hosts during the build

`firebase.google.com`, `developers.cloudflare.com`, `docs.cloud.google.com` (connection refused by the environment's egress proxy). Facts that depend on them are marked unverified above.
