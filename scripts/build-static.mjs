#!/usr/bin/env node
/**
 * build-static.mjs — static GitHub Pages build for the relay-mode bundle.
 *
 * `output: 'export'` cannot coexist with dynamic API route handlers, so this
 * script temporarily relocates src/app/api aside, builds with
 * NEXT_STATIC_EXPORT=1 (which flips next.config.ts to export mode and bakes
 * NEXT_PUBLIC_BUILD_MODE=static → relay mode into the client bundle), then
 * restores the tree in a finally block. The server/exe build is untouched.
 *
 * Output lands in ./out — deploy that directory to GitHub Pages.
 *
 * Environment:
 *   NEXT_PUBLIC_BASE_PATH  Pages base path (default /jira-etl-dashboard;
 *                          set '' for user sites / custom domains)
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const apiDir = path.join(repoRoot, 'src', 'app', 'api');
const stashDir = path.join(repoRoot, '.api-stash');
const nextDir = path.join(repoRoot, '.next');
const outDir = path.join(repoRoot, 'out');

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/jira-etl-dashboard';

if (fs.existsSync(stashDir)) {
  console.error(`[build-static] stale stash exists at ${stashDir} — remove it and retry`);
  process.exit(1);
}

console.log(`[build-static] base path: ${basePath || '(root)'}`);
console.log('[build-static] relocating src/app/api for the export build');

let stashed = false;
try {
  fs.renameSync(apiDir, stashDir);
  stashed = true;

  // Clear .next first: dev-server artifacts (.next/dev/types) type-check the
  // API routes that are relocated for this build and would fail the build.
  if (fs.existsSync(nextDir)) {
    fs.rmSync(nextDir, { recursive: true, force: true });
    console.log('[build-static] cleared .next');
  }

  execSync('npx next build', {
    stdio: 'inherit',
    cwd: repoRoot,
    env: {
      ...process.env,
      NEXT_STATIC_EXPORT: '1',
      NEXT_PUBLIC_BASE_PATH: basePath,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });

  if (!fs.existsSync(outDir)) {
    throw new Error('next build did not produce ./out — check the build output above');
  }
  console.log(`[build-static] static bundle ready in ${outDir}`);
} finally {
  if (stashed) {
    fs.renameSync(stashDir, apiDir);
    console.log('[build-static] restored src/app/api');
  }
}
