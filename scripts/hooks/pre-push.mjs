#!/usr/bin/env node
/**
 * Pre-push quality gate — runs the same checks CI runs, so red code cannot
 * leave the machine. Install: copy scripts/hooks/pre-push to .git/hooks/pre-push
 * (git hooks are not versioned). Override with `git push --no-verify` when needed.
 *
 * Checks (mirrors .github/workflows/ci.yml):
 *   1. npm test               (vitest run)
 *   2. npm run lint -- --max-warnings=917
 *   3. npm run type-check
 */
import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: isWindows,
      env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? '1' },
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

const steps = [
  { label: 'Unit tests (vitest run)', cmd: 'npm', args: ['test'] },
  { label: 'ESLint (--max-warnings=917)', cmd: 'npm', args: ['run', 'lint', '--', '--max-warnings=917'] },
  { label: 'TypeScript (tsc --noEmit)', cmd: 'npm', args: ['run', 'type-check'] },
];

console.log('=== pre-push: running CI checks locally ===\n');
for (const { label, cmd, args } of steps) {
  console.log(`> ${label}`);
  const code = await run(cmd, args);
  if (code !== 0) {
    console.error(`\n✗ pre-push: "${label}" failed (exit ${code}). Push blocked — fix, or bypass with git push --no-verify.`);
    process.exit(code);
  }
  console.log('');
}
console.log('✓ pre-push: all CI checks passed.');
