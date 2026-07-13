# Building the `.ipa` for SideStore / LiveContainer

This is the **no-cost** path: build an **unsigned** `.ipa` on a Mac and let
**SideStore** re-sign it on-device (free Apple ID, auto-refreshing) or run it in
**LiveContainer**. No `$99` Apple Developer account and no EAS cloud needed.

> Why a Mac? Turning a React Native / Expo project into an iOS app has to be
> compiled by Xcode. You can't do that step on Windows. Once the `.ipa` exists,
> everything else (installing, refreshing) happens on your iPhone.

---

## 1. One-time setup on the Mac

Install:
- **Xcode** (from the Mac App Store) + open it once to install components.
- **Xcode Command Line Tools:** `xcode-select --install`
- **Node.js LTS:** https://nodejs.org
- **CocoaPods:** `brew install cocoapods` (or `sudo gem install cocoapods`)

Then get the project:
```bash
git clone https://github.com/mutammima/my-new-app.git
cd my-new-app
npm install
```

Create the `.env` (same values you use on Windows — they get baked into the build):
```bash
cp .env.example .env
# then edit .env and paste your EXPO_PUBLIC_SUPABASE_URL and
# EXPO_PUBLIC_SUPABASE_ANON_KEY (the sb_publishable_… key)
```

---

## 2. Build the `.ipa`

```bash
bash scripts/build-unsigned-ipa.sh
```

This runs `expo prebuild`, compiles a Release build with code-signing disabled,
and packages `DuoNotes-unsigned.ipa` into the project root. First build takes a
while (CocoaPods + native compile); later builds are faster.

<details>
<summary>What the script does (if you'd rather run it by hand)</summary>

```bash
npx expo prebuild --platform ios --clean
xcodebuild -workspace ios/DuoNotes.xcworkspace -scheme DuoNotes \
  -configuration Release -sdk iphoneos -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=""
mkdir Payload
cp -R build/Build/Products/Release-iphoneos/DuoNotes.app Payload/
zip -qr DuoNotes-unsigned.ipa Payload
rm -rf Payload
```
</details>

---

## 3. Install on the iPhones

Get `DuoNotes-unsigned.ipa` onto each phone (AirDrop, iCloud Drive, or the
SideStore "Files" import), then:

**Option A — SideStore** (installs as a normal app, auto-refreshes):
1. Open **SideStore → My Apps → “+”**.
2. Pick `DuoNotes-unsigned.ipa`. SideStore signs it with your free Apple ID.
3. It appears on the Home Screen. SideStore refreshes it in the background so it
   doesn't expire after 7 days (keep SideStore's pairing/refresh set up).

**Option B — LiveContainer** (runs it as a guest app):
1. Open **LiveContainer → Apps → “+” / Import** and choose the `.ipa`.
2. Launch it from inside LiveContainer.

Do this on **both** iPhones. Then in the app: each of you signs up, one of you
links the other in **Settings → Partner** (by email), and shared notes sync live.

---

## Updating later

The app is configured for **EAS Update**, so most changes ship over the air —
no Mac, no rebuild, no re-import. The rule depends on *what* changed:

| What you changed | How it ships |
| --- | --- |
| JS, styles, components, most features | `eas update` (over the air) |
| A native module / SDK version / native `app.json` config | New `.ipa` (rebuild + re-import) |

The `runtimeVersion` policy is `fingerprint`, so this is enforced automatically:
an OTA update only applies to a build whose native layer matches. If you try to
publish JS that needs native code the installed build lacks, EAS reports "no
compatible builds" instead of shipping something broken.

### Over-the-air update (JS-only changes) — from any machine, incl. Windows

```bash
# from a clone that has your .env (the EXPO_PUBLIC_SUPABASE_* keys are inlined
# into the JS bundle at publish time)
eas update --channel production --message "what changed"
```

Each phone applies it on next launch (`updates.checkAutomatically: ON_LOAD`).
The channel is baked into the binary via `updates.requestHeaders`
(`expo-channel-name: production`) in `app.json`, which is why a locally-built
`.ipa` receives updates even though it wasn't made with `eas build`.

### Native change (or first install of EAS Update) — rebuild on the Mac

Re-run `bash scripts/build-unsigned-ipa.sh` after pulling changes, then re-import
the new `.ipa` in SideStore/LiveContainer. The build embeds `expo-updates`, so
from then on JS-only changes flow over the air as above.

## Alternative: paid Apple Developer + EAS (no Mac)

If you ever want a build without a Mac, `eas.json` is already set up. With a paid
Apple Developer account: `eas login`, `eas init`, then
`eas build --platform ios --profile preview` builds a signed `.ipa` in the cloud
and gives you an install link that lasts ~1 year. (EAS Build's env vars must be
set too — `eas env:create` for `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` — since `.env` isn't committed.)
