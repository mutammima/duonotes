# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Never touch `package.json` "scripts" before publishing an OTA

`runtimeVersion.policy` is `fingerprint`, and `packageJson:scripts` is one of the
fingerprint's inputs. Editing *any* script line — even one that cannot affect the
built app, like the `ota` script itself — changes the runtime version. The update
then publishes under a runtime no installed binary has, and Expo Updates silently
declines to apply it. Nothing errors; the fix just never arrives.

This has already cost one lost fix: a `npx --yes eas-cli@latest` workaround for
`eas: command not found` moved the fingerprint from `91cc32d7` to `5ce88fc2`, and
the egress fix sat unapplied on both phones for three days.

- Run one-off CLI workarounds from the shell, never by editing a script line.
- After `eas update`, check the printed **Runtime version** against the installed
  build's: `unzip -p "<app>.ipa" 'Payload/*.app/EXUpdates.bundle/fingerprint'`.
  Different values mean the update will not land, and you need a rebuild + resideload.
- `npx expo-updates fingerprint:generate --platform ios` prints the current tree's
  hash plus every input, which is how you find what moved it.
  `npx eas-cli fingerprint:compare <installed hash>` diffs against a fingerprint EAS
  already has, which works even when the old `node_modules` is gone.
- The iOS build writes `ExpoModulesJSI.xcframework` into
  `node_modules/expo-modules-jsi/apple/Products/`. Before `.fingerprintignore`
  excluded it, a fresh `npm ci` deleted it and moved the fingerprint
  (`91cc32d7` → `3b084960`), so binaries built before October 2026 can't take OTAs
  from a clean install. The October 2026 rebuild is `4286e582` and is stable either way.
- Xcode 27 fails the Release build on pods whose deployment target is below 15.0;
  `plugins/with-pod-deployment-target.js` raises them to the app's 16.4.
