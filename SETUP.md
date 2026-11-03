# Setting up Greenmech

This guide is for the admin. Each step says where to do it. It takes about an hour. Use the club account `stjbscodingclub@gmail.com` for Firebase.

Before you start: **confirm with the school that students may sign in with personal Google accounts.** The app stores only each person's email (on the team list), first name and chosen initials. It has no analytics and no photos.

## 1. Create the Firebase project

Where: https://console.firebase.google.com, signed in as `stjbscodingclub@gmail.com`.

1. Add project, name it `greenmech`. Turn Google Analytics **off**.
2. Project settings, Users and permissions: add your own Google account as a second **Owner**, so one lost account does not lock the project.

## 2. Turn on Google sign-in and Firestore

Where: Firebase console, your project.

1. Build, Authentication, Get started, Sign-in method: enable **Google**. Set the support email.
2. Build, Firestore Database, Create database: choose **production mode** and a region near Jakarta (for example `asia-southeast2`).
3. Stay on the free **Spark** plan. Do not enable Cloud Storage; the app does not use it.

## 3. Copy the web app config

Where: Firebase console, Project settings, General, Your apps.

1. Add app, Web (`</>`), nickname `greenmech-web`. Do not set up Firebase Hosting.
2. Copy the values into a file named `.env.local` at the repo root (VS Code: New File):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=greenmech.josefyang.com
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
```

`VITE_FIREBASE_AUTH_DOMAIN` is the app's own domain, not `*.firebaseapp.com`: the app proxies sign-in through itself. These values are public by design; security comes from the rules.

## 4. Set the admin emails

Where: VS Code, file `config/admins.json`.

Replace the placeholders with the lowercase admin emails (two recommended):

```json
{ "admins": ["you@gmail.com", "stjbscodingclub@gmail.com"] }
```

Then, in the VS Code terminal at the repo root:

```bash
npm ci
```

```bash
npm run rules:gen
```

Commit `config/admins.json` and the new `firestore.rules`.

## 5. Deploy the security rules

Where: VS Code terminal, repo root.

```bash
npx firebase login
```

```bash
npx firebase use --add
```

Pick your project and give it the alias `default`. Then:

```bash
npx firebase deploy --only firestore:rules,firestore:indexes
```

Run `npm run rules:gen` and this deploy again whenever you change the admin emails.

## 6. Create the Cloudflare Pages project

Where: https://dash.cloudflare.com, Workers and Pages, Create, Pages, Connect to Git.

1. Pick the GitHub repo `greenmech`, branch `main`.
2. Build command `npm ci && npm run build`, output directory `dist`.
3. Environment variables (Production): the five `VITE_FIREBASE_*` values from step 3, `NODE_VERSION` = `22`, and `FIREBASE_PROJECT_ID` = your Firebase project id.
4. Settings, Builds: turn **off** preview deployments. Never sign in on a `*.pages.dev` address.

## 7. Attach the custom domain

Where: Cloudflare, your Pages project, Custom domains.

Add `greenmech.josefyang.com` and follow the DNS prompt.

## 8. Authorise the domain for sign-in

1. Firebase console, Authentication, Settings, Authorized domains: add `greenmech.josefyang.com`.
2. Google Cloud console (https://console.cloud.google.com, same project), APIs and Services, Credentials, the OAuth 2.0 **Web client** created by Firebase: under Authorized redirect URIs add `https://greenmech.josefyang.com/__/auth/handler`. Save.

## 9. First sign-in as admin

Where: a desktop browser.

Open `https://greenmech.josefyang.com`, sign in with an admin email. You land on the Modules page with no modules.

## 10. Import the sample structure (optional)

Where: the app, Manage, Data.

Click "Import sample structure". It adds the 10 sample modules and 9 connections from the brief. Every purpose starts with "Sample:". You can only do this while there are no modules.

## 11. Add the team

Where: the app, Manage, Team.

Add each student as **member** with unique initials (P1, P2...) and each teacher as **coach**. If you also want to lead modules or post, add your own email as a member too. Students who sign in before being added can press "Ask to join"; approve them in Manage, Team.

## 12. Smoke test

- [ ] `https://greenmech.josefyang.com/api/health` shows `{"ok":true}`.
- [ ] `https://greenmech.josefyang.com/version.json` shows the commit you deployed.
- [ ] Sign in on a phone (redirect flow). On an installed iPhone app, the first sign-in may need Safari.
- [ ] Two devices: change a module's status on one; the other updates within seconds.
- [ ] A coach account sees Monitor and no edit controls anywhere.
- [ ] A Google account not on the list sees "Not on the team list".
- [ ] Turn on airplane mode on a phone, change a status, turn it off: the sync label goes from "Offline, 1 change waiting" to "Saved".

Real Google sign-in is only tested here. The automated tests use the Firebase emulators.

## Every month

Manage, Data: export a JSON backup. The app shows a banner when the last backup is more than 30 days old.
