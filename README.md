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
| Email/password auth | ✅ Working (local) | Salted SHA-256, session in SecureStore |
| Create / edit / delete notes | ✅ Working | iOS-Notes-style minimal editor |
| Share a note with your partner | ⚠️ Simulated | UI + data model done; needs a sync backend |
| **PIN lock** | ✅ Working | One device PIN protects any PIN-locked note |
| **Biometric lock** | ✅ Working | Face ID / Touch ID via `expo-local-authentication` |
| At-rest note **encryption** | 🚧 Placeholder | Lock is a UI+keychain gate today; see the seam in `src/lib/crypto.ts` |

Please read **[What's real vs. placeholder](#-security-model--whats-real-vs-placeholder)**
before trusting anything sensitive to it — the current build stores data on-device only.

---

## 🧱 Tech stack

- **Expo SDK 57** / **React Native 0.86** / **React 19**
- **Expo Router** (file-based routing, `src/app/`)
- **TypeScript** (strict)
- `expo-local-authentication` — biometrics
- `expo-secure-store` — Keychain / Keystore-backed secret storage (PIN, session)
- `expo-crypto` — hashing & secure random
- `@react-native-async-storage/async-storage` — note persistence
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
│   ├── auth-context.tsx      # Sign up / in / out, session restore
│   └── notes-context.tsx     # Notes CRUD, sharing, lock state
├── lib/
│   ├── types.ts              # Note / User domain types
│   ├── storage.ts            # AsyncStorage + SecureStore helpers
│   ├── security.ts           # PIN set/verify + biometric helpers
│   └── crypto.ts             # Hashing + the encrypt/decrypt seam (TODO)
├── constants/theme.ts        # Colors, spacing, fonts
└── hooks/                    # Color scheme / theme hooks
```

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
- Passwords and PINs are **never stored in plaintext** — they're salted and
  SHA-256 hashed (`src/lib/crypto.ts`).
- The session token and PIN hash live in **SecureStore** (iOS Keychain /
  Android Keystore).
- Locked notes are **gated** in the UI: their contents aren't shown until you pass
  a PIN or biometric challenge.

**Placeholders / not yet done (don't oversell these)**
- **No backend.** Accounts and notes are stored **only on the device**. So the
  "Share with partner" feature models the data (`sharedWith`) but the note won't
  actually appear on the other phone until a sync backend is added
  (e.g. Supabase, Firebase, or a small custom API). See `notes-context.tsx`.
- **No at-rest encryption yet.** A locked note's body is gated but still stored in
  the app sandbox in plaintext. `encryptBody` / `decryptBody` in `src/lib/crypto.ts`
  are the seam where **AES-256-GCM with a PIN-derived key** should go.

## 🗺️ Roadmap

1. Real auth + sync backend so both iPhones share the same account and notes.
2. AES-GCM field-level encryption of locked note bodies (key derived from PIN).
3. Real-time collaboration on shared notes.
4. Rich text / images / checklists.

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
