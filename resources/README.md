# App Store Assets

Use these assets for Play Store and App Store submission.

## Icon

1. Create or place **icon.png** (1024×1024 px) in this folder.
2. Use a generator to produce all sizes:
   - [App Icon Generator](https://www.appicon.co/)
   - [MakeAppIcon](https://makeappicon.com/)
3. Replace the default icons in:
   - **Android:** `android/app/src/main/res/mipmap-*/`
   - **iOS:** `ios/App/App/Assets.xcassets/AppIcon.appiconset/`

Or use your existing `public/logo.png` — resize to 1024×1024 for the source.

## Splash Screen

- Background color: `#0f172a` (already configured in `capacitor.config.ts`)
- Optional: Add a centered logo or branded splash image
- Replace in:
  - **Android:** `android/app/src/main/res/drawable*/splash.png`
  - **iOS:** `ios/App/App/Assets.xcassets/Splash.imageset/`
