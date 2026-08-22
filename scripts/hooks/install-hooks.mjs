#!/usr/bin/env node
/**
 * Installs the repo's git hooks into .git/hooks (git hooks are not versioned).
 * Currently installs: pre-push → runs the CI checks locally before each push.
 * Re-run after cloning: npm run hooks:install
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const gitDir = path.join(root, '.git');
if (!fs.existsSync(gitDir)) {
  console.log('No .git directory found — skipping hook installation.');
  process.exit(0);
}
const hooksDir = path.join(gitDir, 'hooks');
fs.mkdirSync(hooksDir, { recursive: true });

// sh wrapper so the hook works on Windows (Git for Windows runs hooks via sh)
// and Unix alike, delegating to the tracked Node implementation.
const prePush = [
  '#!/bin/sh',
  'exec node "scripts/hooks/pre-push.mjs"',
  '',
].join('\n');

const target = path.join(hooksDir, 'pre-push');
fs.writeFileSync(target, prePush);
try {
  fs.chmodSync(target, 0o755);
} catch {
  // Windows: exec bit is irrelevant
}
console.log(`Installed pre-push hook -> ${target}`);
