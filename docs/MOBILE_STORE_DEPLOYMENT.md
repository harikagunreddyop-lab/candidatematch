# Deploy Orion CMOS to Play Store and App Store

This guide covers preparing the app for **Google Play Store** (Android) and **Apple App Store** (iOS).

## Architecture

The native apps use **Capacitor** to wrap the web app in a native shell. The app loads your **deployed production URL** (e.g. Vercel) in a WebView. This approach:

- Requires no changes to your Next.js app
- Keeps all API routes and server features working
- Requires network connectivity (no offline bundle)

## Prerequisites

1. **Deploy the web app** to production (Vercel, Amplify, etc.) over HTTPS.
2. **Set `NEXT_PUBLIC_APP_URL`** in your deployment (e.g. `https://your-app.vercel.app`).
3. **Development environment:**
   - **iOS:** macOS with Xcode (latest stable)
   - **Android:** Android Studio (latest stable)
   - **Node.js:** 18+

## 1. Install Dependencies

```bash
npm install
```

## 2. Set Environment Variable

For production builds, the Capacitor app loads from your deployed URL:

```bash
# .env or .env.production
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

Or when running sync/open:

```bash
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app npm run mobile:sync
```

## 3. Prepare and Add Platforms

First-time setup:

```bash
# Create www/ and sync (uses NEXT_PUBLIC_APP_URL if set)
npm run mobile:prepare
npx cap add android
npx cap add ios
npm run mobile:sync
```

Subsequent builds:

```bash
npm run mobile:sync
```

## 4. App Icons and Splash Screens

### Required Icon Sizes

| Platform | Sizes |
|----------|-------|
| Android  | 48, 72, 96, 144, 192 (mdpi → xxxhdpi); 512×512 for Play Store |
| iOS      | 20, 29, 40, 60, 76, 83.5, 1024 (App Store) |

### Generate Icons

1. Create a **1024×1024 px** PNG icon (no transparency for iOS).
2. Use a tool to generate sizes:
   - [App Icon Generator](https://www.appicon.co/)
   - Or `npx @capacitor/assets generate` (if using Capacitor Assets)

3. Replace icons in:
   - **Android:** `android/app/src/main/res/mipmap-*/ic_launcher.png`
   - **iOS:** `ios/App/App/Assets.xcassets/AppIcon.appiconset/`

### Splash Screen

- **Background:** `#0f172a` (matches app theme)
- Replace splash images in:
  - **Android:** `android/app/src/main/res/drawable*/splash.png`
  - **iOS:** `ios/App/App/Assets.xcassets/Splash.imageset/`

## 5. Configure App Identity

### Android (`android/app/build.gradle` or `android/variables.gradle`)

- `applicationId`: `com.orioncmos.app` (matches `capacitor.config.ts` appId)
- `versionCode`: Increment for each Play Store upload
- `versionName`: e.g. `1.0.0`

### iOS (`ios/App/App.xcodeproj` or Info.plist)

- **Bundle Identifier:** `com.orioncmos.app`
- **Version / Build:** e.g. 1.0.0 (1)
- **Display Name:** Orion CMOS

## 6. Google Play Store

### A. Create a Developer Account

- [Google Play Console](https://play.google.com/console/) — one-time $25 fee

### B. Build a Release APK/AAB

```bash
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

### C. Sign the App

1. Create a keystore (one-time):

   ```bash
   keytool -genkey -v -keystore orion-release.keystore -alias orion -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Configure signing in `android/app/build.gradle`:

   ```groovy
   android {
     signingConfigs {
       release {
         storeFile file("orion-release.keystore")
         storePassword System.getenv("KEYSTORE_PASSWORD")
         keyAlias "orion"
         keyPassword System.getenv("KEY_PASSWORD")
       }
     }
     buildTypes {
       release {
         signingConfig signingConfigs.release
         // ...
       }
     }
   }
   ```

### D. Upload to Play Console

1. Create a new app
2. Fill store listing (title, short/long description, screenshots, icon 512×512)
3. Set content rating, target audience, privacy policy
4. Upload the AAB in **Production** → **Create new release**

---

## 7. Apple App Store

### A. Apple Developer Account

- [developer.apple.com](https://developer.apple.com/) — $99/year

### B. Build for Release

```bash
cd ios/App
xcodebuild -scheme App -configuration Release -sdk iphoneos -archivePath build/App.xcarchive archive
xcodebuild -exportArchive -archivePath build/App.xcarchive -exportPath build/export -exportOptionsPlist ExportOptions.plist
```

Or use Xcode: **Product → Archive** → **Distribute App**.

### C. Certificates and Provisioning

1. In Apple Developer Portal:
   - Create an **App ID** (e.g. `com.orioncmos.app`)
   - Create **Distribution Certificate** and **Provisioning Profile**
2. In Xcode: **Signing & Capabilities** → select your team and profile

### D. App Store Connect

1. Create the app at [App Store Connect](https://appstoreconnect.apple.com/)
2. Provide metadata, screenshots (6.5", 5.5"), preview video (optional)
3. Submit for review

---

## 8. Checklist Before Submission

### Both Stores

- [ ] `NEXT_PUBLIC_APP_URL` points to production HTTPS
- [ ] App icons and splash screens updated
- [ ] Version and build numbers set
- [ ] App tested on real devices (multiple screen sizes)
- [ ] Privacy policy URL (required by both stores)
- [ ] Auth flows work (Supabase redirect URLs include app origin if needed)

### Play Store

- [ ] AAB built and signed
- [ ] Content rating questionnaire completed
- [ ] Target audience and data safety form filled

### App Store

- [ ] Archive built with correct provisioning
- [ ] Screenshots for required device sizes
- [ ] App privacy details (data collection, etc.)

---

## 9. Supabase / Auth for Mobile

Ensure your Supabase project allows the app origins:

- **Supabase Dashboard → Authentication → URL Configuration**
- Add redirect URLs if using OAuth (e.g. custom scheme for deep links)
- For Capacitor WebView loading a URL, the origin is your `NEXT_PUBLIC_APP_URL` — same as web

---

## 10. Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run mobile:prepare` | Creates `www/` for Capacitor |
| `npm run mobile:sync` | Prepares + syncs web assets to native projects |
| `npm run mobile:ios` | Sync + open Xcode |
| `npm run mobile:android` | Sync + open Android Studio |

---

## Troubleshooting

- **Blank screen on launch:** Ensure `NEXT_PUBLIC_APP_URL` is set and reachable. Check device network.
- **CORS / auth issues:** Verify Supabase and any API CORS settings allow your production domain.
- **iOS build fails:** Ensure signing is configured and provisioning profile is valid.
- **Android build fails:** Check `sdkVersion` and that `bundleRelease` uses the correct signing config.
