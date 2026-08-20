import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Creates a clean, schema-only SQLite database (db/template.db) that packaged
// builds ship and copy into place on first run. An absolute file: URL is used
// because Prisma resolves relative URLs against the schema file location,
// which is not what we want here.
const templatePath = path.join(rootDir, 'db', 'template.db');
const templateUrl = 'file:' + templatePath.replace(/\\/g, '/');

console.log('--- Create DB Template ---');
console.log('> Target: ' + templatePath);

fs.mkdirSync(path.dirname(templatePath), { recursive: true });
for (const suffix of ['', '-wal', '-shm']) {
  const f = templatePath + suffix;
  if (fs.existsSync(f)) fs.rmSync(f);
}

try {
  execSync('npx prisma db push --schema=prisma/schema.sqlite.prisma --skip-generate --accept-data-loss', {
    stdio: 'inherit',
    cwd: rootDir,
    env: { ...process.env, DATABASE_URL: templateUrl },
  });
} catch (error) {
  console.error('✗ Failed to create database template', error);
  process.exit(1);
}

if (!fs.existsSync(templatePath) || fs.statSync(templatePath).size === 0) {
  console.error('✗ Template database was not created at ' + templatePath);
  process.exit(1);
}

console.log(`✓ Database template created (${(fs.statSync(templatePath).size / 1024).toFixed(1)} KB)`);
