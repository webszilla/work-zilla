# Mobile Build And Release

This app is prepared for EAS build + Expo Updates.

Required env:

- `EXPO_PUBLIC_EAS_PROJECT_ID`
- `EXPO_PUBLIC_UPDATE_CHANNEL`
- `EXPO_PUBLIC_API_BASE_URL`
- `ANDROID_VERSION_CODE`
- `IOS_BUILD_NUMBER`

Common commands:

```bash
cd apps/mobile
npm run build:android:preview
npm run build:android:production
npm run build:ios:preview
npm run build:ios:production
npm run update:preview
npm run update:production
```

Notes:

- The npm scripts call `npx eas`, so `eas-cli` does not need to stay in project dependencies.
- Android preview builds use `apk`.
- Android production builds use `aab`.
- iOS production requires Apple signing inside EAS / App Store Connect.
- OTA updates use `runtimeVersion.policy = appVersion`, so JS updates stay aligned to app binary versions.
- Set `EXPO_PUBLIC_API_BASE_URL=https://getworkzilla.com` for installed preview/production builds.
- Do not use `localhost` in installed mobile binaries unless testing against a machine reachable from the device LAN.
