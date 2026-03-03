/**
 * Creates a minimal webDir for Capacitor when using server.url (remote URL) mode.
 * The native app loads from the deployed URL; this placeholder satisfies cap sync.
 */
const fs = require('fs');
const path = require('path');

const webDir = path.join(__dirname, '..', 'www');
if (!fs.existsSync(webDir)) {
  fs.mkdirSync(webDir, { recursive: true });
}

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Orion CMOS</title>
  <style>
    body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; 
      background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; text-align: center; padding: 1rem; }
    .loader { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.2); border-top-color: #14b8a6; 
      border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { font-size: 14px; opacity: 0.8; }
  </style>
</head>
<body>
  <div>
    <div class="loader"></div>
    <p>Loading Orion CMOS…</p>
    <p style="font-size: 12px; margin-top: 0.5rem;">If this persists, check your connection.</p>
  </div>
  <script>
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      var url = '${process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.vercel.app'}';
      if (url && !url.includes('your-app')) window.location.href = url;
    }
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(webDir, 'index.html'), indexHtml);
console.log('[mobile] Prepared www/ for Capacitor');
