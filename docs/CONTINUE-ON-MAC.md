# Continue DuoNotes work on the MacBook

This doc lets you (and a fresh Claude Code session) pick up exactly where the
Windows session left off. Read top to bottom.

## Current state (as of 2026-07-13)

- **The account-creation bug is fixed.** Sign-up failed with a "can't find
  host" DNS error because there was no `.env` and the config gate was too weak.
- **Live Supabase project is verified working:**
  `https://hfixmxowklytawadhhak.supabase.co` — DNS resolves, `/auth/v1/health`
  returns 200, the publishable key is accepted, email sign-up is enabled with
  auto-confirm on (accounts activate immediately, no confirmation email).
- **OTA update already published** to the `production` channel
  (`eas update --channel production --message "fix supabase url"`), iOS +
  Android. Reopen the app on each phone to apply it.
- **Code hardening** lives on branch `harden-supabase-config` (pushed, PR ready
  at https://github.com/mutammima/my-new-app/pull/new/harden-supabase-config).
  It tightens `isSupabaseConfigured` in `src/lib/supabase.ts` so a
  placeholder/malformed URL shows the "Almost there" screen instead of dying on
  a DNS lookup.

## Set up the repo on the Mac

```bash
git clone https://github.com/mutammima/my-new-app.git duonote
cd duonote
git fetch origin
git checkout harden-supabase-config   # or: git checkout main
npm install
```

## Recreate `.env` (NOT in git — it's gitignored)

Create a file named `.env` in the repo root with these two lines:

```
EXPO_PUBLIC_SUPABASE_URL=https://hfixmxowklytawadhhak.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xkX5LSdxhcn5Z478CfgXZA_YBZXG5oz
```

The anon/publishable key is a **public** client key (safe to ship; access is
governed by Row-Level Security in `supabase/schema.sql`). After editing `.env`,
restart the dev server so Expo picks it up.

## Common commands

```bash
npm start                                  # dev server
npx eas whoami                             # confirm EAS login (was: mutammim)
npm run ota                                # eas update --channel production
bash scripts/build-unsigned-ipa.sh         # rebuild IPA (only if OTA shows "no compatible builds")
```

## Open items / possible next steps

- Merge the `harden-supabase-config` PR once you've confirmed sign-up works.
- If a phone's installed build predates the updates config, the OTA won't apply
  and you'll need to rebuild the IPA on the Mac and re-import it.

## About continuing the *conversation*

Claude Code stores chat history locally per machine, so the Windows session's
transcript does not automatically appear on the Mac. This file is the handoff:
open Claude Code inside this repo on the Mac and point it here — it gives a
fresh session the full context to keep going.
