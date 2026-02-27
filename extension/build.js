#!/usr/bin/env node
// build.js — Build script for CandidateMatch Autofill Extension
// Usage: node extension/build.js [--watch]
//
// Requires: npx is available (ships with npm).
// No package.json needed — uses esbuild via npx.

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = __dirname;
const srcDir = path.join(root, 'src');
const outDir = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

// Ensure dist/ exists
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const entries = [
    {
        in: path.join(srcDir, 'content.ts'),
        out: path.join(outDir, 'content.js'),
        format: 'iife',  // content scripts CANNOT be ES modules in Chrome
    },
    {
        in: path.join(srcDir, 'background.ts'),
        out: path.join(outDir, 'background.js'),
        format: 'esm',   // MV3 service workers support ES modules (manifest has type:module)
    },
];

const commonArgs = [
    '--bundle',
    '--target=chrome120',
    '--log-level=info',
    ...(watch ? ['--watch'] : []),
];

console.log(`[CM Build] ${watch ? 'Watching' : 'Building'} extension…`);

for (const entry of entries) {
    const args = [
        'esbuild',
        entry.in,
        `--outfile=${entry.out}`,
        ...commonArgs,
    ].join(' ');

    if (watch) {
        // Detached child processes for watch mode
        const child = spawn('npx', [
            'esbuild', entry.in,
            `--outfile=${entry.out}`,
            `--format=${entry.format}`,
            ...commonArgs
        ], {
            stdio: 'inherit',
            shell: true,
            cwd: root,
        });
        child.on('error', (e) => console.error('[CM Build] Error:', e.message));
    } else {
        try {
            execSync(`npx esbuild ${entry.in} --outfile=${entry.out} --format=${entry.format} ${commonArgs.filter(a => !a.includes('watch')).join(' ')}`, { stdio: 'inherit', cwd: root });
        } catch {
            process.exit(1);
        }
    }
}

if (!watch) {
    console.log('\n[CM Build] ✓ Done! Load extension/dist in Chrome:');
    console.log('  1. Open chrome://extensions');
    console.log('  2. Enable Developer mode');
    console.log('  3. Click "Load unpacked" → select the extension/ folder (NOT dist/)');
    console.log('  4. Visit your CandidateMatch app at /connect-extension to connect.\n');
}
