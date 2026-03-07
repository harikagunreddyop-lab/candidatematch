#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = __dirname;
const outDir = path.join(root, 'dist');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const entries = [
  { in: 'src/content.ts', out: 'dist/content.js', format: 'iife' },
  { in: 'src/background.ts', out: 'dist/background.js', format: 'esm' },
  { in: 'popup.ts', out: 'dist/popup.js', format: 'iife' },
];

const common = '--bundle --target=chrome120 --log-level=info';

console.log('[CM Build] Building elite extension…\n');
for (const e of entries) {
  try {
    execSync(
      `npx esbuild ${path.join(root, e.in)} --outfile=${path.join(root, e.out)} --format=${e.format} ${common}`,
      { stdio: 'inherit', cwd: root }
    );
  } catch {
    process.exit(1);
  }
}

console.log('\n[CM Build] ✓ Done!\n');
console.log('  1. Open chrome://extensions');
console.log('  2. Enable Developer mode → Load unpacked');
console.log('  3. Select the extension/ folder (NOT dist/)');
console.log('  4. Visit your app at /connect-extension to link your account\n');

