# Installing Orion CMOS as a Desktop App

The app is a **Progressive Web App (PWA)**. You can install it on your desktop so it opens in its own window like a native app.

## Requirements

- **Chrome** or **Edge** (recommended), or any browser that supports "Install" for PWAs
- The app must be served over **HTTPS** (e.g. your production URL or `localhost` for dev)

## How to Install

### Chrome / Edge (Windows, Mac, Linux)

1. Open the app in Chrome or Edge (e.g. `https://your-domain.com` or `http://localhost:3000`).
2. Look for the **install** option:
   - **Chrome:** Install icon in the address bar (⊕ or computer icon), or **⋮** menu → **Install Orion CMOS** / **Install app**.
   - **Edge:** **⋯** menu → **Apps** → **Install this site as an app**.
3. Click **Install** and confirm. The app will open in a standalone window and can be pinned to the taskbar/dock.

### After Installing

- Launch **Orion CMOS** from your Start Menu / Applications / desktop shortcut.
- It runs in its own window (no browser tabs or address bar).
- Updates: reopening the app loads the latest version from the server.

## Optional: Better Icons

For sharper icons in the install dialog and on the taskbar, add dedicated icon files:

- `public/icon-192.png` — 192×192 px  
- `public/icon-512.png` — 512×512 px  

Then update `public/manifest.json`: set `"src": "/icon-192.png"` for the 192 icon and `"src": "/icon-512.png"` for the 512 icon. If these are missing, the app uses `logo.png` (browsers will scale it).

## Technical Details

- **Manifest:** `public/manifest.json` (name, icons, start URL, standalone display).
- **Service worker:** `public/sw.js` (minimal; required for install, no offline caching).
- **Registration:** `RegisterSW` component in the root layout registers the service worker on load.
