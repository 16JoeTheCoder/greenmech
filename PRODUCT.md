# Greenmech

Source: derived from BUILD_PROMPT.md (the owner's written brief). No separate interview was run; every fact below is stated in that brief.

## Users and job
- Four student builders (members), one or two admins, two teachers (coaches) at St. Johannes Berchmans School, Jakarta.
- Job: plan and track one physical chain-reaction machine built from many independent modules, developed at different times by different people.
- Context: phones in a workshop on flaky school Wi-Fi, laptops at home, teachers checking progress.

## What it makes possible
- One shared picture of the machine: which module is at which step, who leads it, which joins between modules can be worked on now.
- Names, not numbers: modules and connections are known by readable slugs.

## Constraints
- Minors: store the minimum (email on the allowlist, first name, initials). No photos, analytics or trackers.
- Firebase Spark plan, no Cloud Storage. Cloudflare Pages hosting.
- Out of scope: scoring, leaderboards, streaks, per-person comparison, test logs, simulation.

## Platform
web (responsive, installable PWA)

## Stack
Decided by the brief: Vite, TypeScript, Preact, Firebase Auth + Firestore, Cloudflare Pages + Functions.
