# DuoNotes 🔒💞

A private, **lockable shared-notes and journaling app for two people**, built with
Expo + React Native (TypeScript). It scratches an itch that stock iOS Notes can't:
once you share a note, iOS gives you no way to lock it. DuoNotes lets you share a
note _and_ protect it with a **PIN** or **biometrics** (Face ID / Touch ID).

> **Built on Windows, runs on iPhones.** The whole project is designed so you can
> develop on a Windows PC, test instantly on your iPhones with **Expo Go**, and
> produce a real installable **`.ipa`** with **EAS Build** (Expo's cloud builders —
> no Mac required).

---

## ✨ Features in this scaffold

| Area | Status | Notes |
|------|--------|-------|
| Tab navigation (Expo Router) | ✅ Working | Notes · Shared · Settings |
| Email/password auth | ✅ Working | Supabase Auth, session persists across launches |
| Create / edit / delete notes | ✅ Working | iOS-Notes-style minimal editor, auto-saved |
| Share a note with your partner | ✅ Working | Real-time sync via Supabase (link accounts by email) |
| **PIN lock** | ✅ Working | One device PIN protects any PIN-locked note |
| **Biometric lock** | ✅ Working | Face ID / Touch ID via `expo-local-authentication` |
| At-rest note **encryption** | 🚧 Placeholder | Lock is a UI + keychain gate today; see the seam in `src/lib/crypto.ts` |

> **You must set up the Supabase backend once** (5 minutes, free) before notes will
> sync — see **[Backend setup](#-backend-setup-supabase)**. Please also read
> **[What's real vs. placeholder](#-security-model--whats-real-vs-placeholder)**.

---

## 🧱 Tech stack

- **Expo SDK 57** / **React Native 0.86** / **React 19**
- **Expo Router** (file-based routing, `src/app/`)
- **TypeScript** (strict)
- **Supabase** — Postgres + Auth + Realtime (accounts, notes, live sharing)
- `expo-local-authentication` — biometrics
- `expo-secure-store` — Keychain / Keystore-backed secret storage (PIN)
- `expo-crypto` — PIN hashing & secure random
- `@react-native-async-storage/async-storage` — Supabase session storage
- **EAS Build** — cloud iOS/Android builds → `.ipa` / `.aab`

---

## 📁 Project structure

```
src/
├── app/                      # Expo Router routes (file = screen)
│   ├── _layout.tsx           # Root: providers + auth-gated Stack (Stack.Protected)
│   ├── auth.tsx              # Login / sign-up screen
│   ├── (tabs)/               # Tab group (only visible when signed in)
│   │   ├── _layout.tsx       # Tab bar (Notes · Shared · Settings)
│   │   ├── index.tsx         # Home — "My Notes" list + compose button
│   │   ├── shared.tsx        # Notes shared between the two of you
│   │   └── settings.tsx      # Account, set/change PIN, biometric status
│   └── note/
│       └── [id].tsx          # Note editor + "Lock Note" flow (PIN / biometric)
├── components/
│   ├── note-list.tsx         # Reusable notes list + row
│   ├── pin-modal.tsx         # Numeric PIN pad (set + verify modes)
│   ├── themed-text.tsx       # Light/dark aware primitives (from template)
│   └── themed-view.tsx
├── context/
│   ├── auth-context.tsx      # Supabase auth: sign up/in/out, partner linking
│   └── notes-context.tsx     # Notes CRUD + realtime sync via Supabase
├── lib/
│   ├── supabase.ts           # Supabase client + env config
│   ├── types.ts              # Note / User domain types
│   ├── storage.ts            # SecureStore helpers (PIN)
│   ├── security.ts           # PIN set/verify + biometric helpers
│   └── crypto.ts             # PIN hashing + the encrypt/decrypt seam (TODO)
├── constants/theme.ts        # Colors, spacing, fonts
└── hooks/                    # Color scheme / theme hooks

supabase/
└── schema.sql                # Tables + Row-Level Security — run once in Supabase
```

---

## 🗄️ Backend setup (Supabase)

Do this **once**. It's free and takes about five minutes. Until it's done, the app
shows a friendly "Almost there" screen instead of the notes UI.

DuoNotes puts its tables in the `public` schema but prefixes them all with
**`duonotes_`** (`duonotes_notes`, `duonotes_profiles`), so you can safely reuse a
Supabase project that already hosts another app — nothing here collides with your
other tables or touches `auth.users`.

1. **Create (or reuse) a project** at [supabase.com](https://supabase.com). The
   free tier is plenty for two people.
2. **Create the database.** In the dashboard: **SQL Editor → New query**, paste the
   entire contents of [`supabase/schema.sql`](./supabase/schema.sql), and click
   **Run**. This creates the prefixed tables, security rules, and realtime setup.
3. **Turn off email confirmation** (optional but easiest for two people):
   **Authentication → Sign In / Providers → Email → turn *Confirm email* off**.
   Otherwise each of you must click a confirmation link before first sign-in.
4. **Get your keys:** **Project Settings → API keys** — copy the **Publishable**
   key (`sb_publishable_…`; the legacy **anon** key also works).
5. **Add them to the app.** Copy `.env.example` to `.env` and fill in:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
   ```
   (This is a public client key — safe to ship. Security is enforced by the
   Row-Level Security policies, not by hiding the key. Never ship the **secret**
   / service_role key.)
6. **Restart** the dev server so Expo reloads `.env`.

> **Sharing a project with another app?** A Supabase project has one shared
> `auth.users`, so both apps share the same login pool. DuoNotes avoids
> interfering by creating its profile rows from the app (no `auth.users` trigger)
> and prefixing every table with `duonotes_`.

### Linking the two of you

1. You both **sign up** in the app (each on your own phone).
2. One of you opens **Settings → Partner → Link your partner** and enters the
   other's email. That's it — you're connected both ways.
3. Open a note, tap the **people** icon to **Share** it, and it appears on the
   other phone in real time. Locked notes stay locked on both devices.

---

## 🚀 Getting started (test in seconds with Expo Go)

### Prerequisites (Windows)

1. **Node.js LTS** — https://nodejs.org (verify with `node --version`).
2. **Expo Go** app on both iPhones — from the App Store.
3. Your PC and iPhones on the **same Wi-Fi network**.

### Run it

```bash
npm install      # first time only
npm start        # starts the Metro dev server + shows a QR code
```

Then on your iPhone:

- Open the **Camera** app and point it at the QR code in the terminal, **or**
- Open **Expo Go** → it will list the running project.

The app reloads instantly as you edit files. This is the fastest loop and needs
**no Mac and no build** — perfect for day-to-day development.

> Tip: press `i` (needs a Mac/simulator), `a` (Android emulator), or `w` (web) in
> the terminal. For two iPhones, both just scan the same QR code.

---

## 📦 Producing an installable `.ipa` with EAS Build (from Windows)

Expo Go is great for testing, but to install DuoNotes as a **standalone app** on
your iPhones you need an `.ipa`. **EAS Build compiles iOS apps in the cloud, so you
do _not_ need a Mac.** `eas.json` in this repo is already configured.

### 1. Install the EAS CLI and log in

```bash
npm install -g eas-cli
eas login            # create a free Expo account if you don't have one
```

### 2. Link the project to EAS (one time)

```bash
eas init             # creates/links an EAS project + writes the projectId
```

### 3. Apple credentials

Building a **device** `.ipa` requires an Apple account so the app can be signed.

- A **free Apple ID** works for personal sideloading (apps expire after 7 days and
  must be re-installed).
- A **paid Apple Developer account** ($99/yr) gives ad-hoc/TestFlight distribution
  and longer-lived installs.

EAS will prompt you interactively and manage the certificates/profiles for you —
just answer the questions the first time you build.

### 4. Build the `.ipa`

This repo defines a **`preview`** profile for internal distribution (an ad-hoc
`.ipa` you can install on registered devices):

```bash
# Register the iPhones that are allowed to run the build (ad-hoc):
eas device:create

# Build the .ipa in the cloud:
eas build --platform ios --profile preview
```

When the build finishes, EAS prints a URL. Download the `.ipa` from there (or the
**expo.dev** dashboard → your project → Builds).

### 5. Install the `.ipa` on the iPhones (Windows-friendly options)

- **AltStore** (https://altstore.io) or **Sideloadly** (https://sideloadly.io):
  install AltServer on Windows, plug in the iPhone, and drag/select the `.ipa`.
  These re-sign with a free Apple ID (7-day expiry) — great for two personal phones.
- **Apple Configurator** or **TestFlight** (needs the paid developer account) if
  you'd rather push builds over the air.

> The `production` profile (`eas build --platform ios --profile production`) is for
> App Store / TestFlight distribution when you're ready.

---

## 🔐 Security model & what's real vs. placeholder

Being honest here matters more than sounding impressive:

**Implemented today**
- **Real accounts + sync.** Auth and notes run on **Supabase**; shared notes sync
  between both phones in real time.
- **Row-Level Security.** Postgres RLS policies (`supabase/schema.sql`) mean you can
  only ever read your own notes and the ones your partner explicitly shares —
  enforced by the database, not just the UI.
- Passwords are handled by **Supabase Auth** (bcrypt-hashed server-side); the PIN is
  salted + SHA-256 hashed on-device (`src/lib/crypto.ts`).
- The PIN hash lives in **SecureStore** (iOS Keychain / Android Keystore); the auth
  session in app storage.
- Locked notes are **gated**: contents aren't shown until you pass a PIN or biometric
  challenge, on each device.

**Placeholder / not yet done (don't oversell this)**
- **No at-rest encryption yet.** A locked note's body is gated in the UI but stored
  as plaintext in the database (protected by RLS + your Supabase account, not by
  encryption). `encryptBody` / `decryptBody` in `src/lib/crypto.ts` are the seam
  where **AES-256-GCM with a PIN-derived key** (true end-to-end encryption) should go.

## 🗺️ Roadmap

1. AES-GCM field-level **end-to-end encryption** of locked note bodies (key derived
   from PIN, so not even the server can read them).
2. Conflict-aware collaborative editing on shared notes (currently last-write-wins).
3. Rich text / images / checklists.
4. Push notifications when your partner shares or edits a note.

---

## 🧰 Useful scripts

```bash
npm start            # Metro dev server (Expo Go)
npm run ios          # open in iOS simulator (needs a Mac)
npm run android      # open in Android emulator
npm run web          # run in the browser
npm run lint         # Expo lint
npx tsc --noEmit     # type-check
```

---

Made with ❤️ for two.
