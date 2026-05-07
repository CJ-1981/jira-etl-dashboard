import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const prismaDir = path.join(rootDir, 'prisma');
const envFile = path.join(rootDir, '.env');

console.log('--- Prisma Setup Script ---');

// Helper for cleaning directories with retry (handles Windows file locks)
function cleanDirectorySync(dir, retries = 3) {
  if (!fs.existsSync(dir)) return true;
  
  for (let i = 0; i < retries; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return true;
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EBUSY') {
        if (i < retries - 1) {
          console.warn(`! Warning: Directory ${path.relative(rootDir, dir)} is locked. Retrying (${i + 1}/${retries})...`);
          // Use a blocking delay (safe for setup script)
          const waitTill = new Date(new Date().getTime() + 1000);
          while (waitTill > new Date()) {}
          continue;
        }
        console.warn(`! Warning: Directory ${path.relative(rootDir, dir)} is locked by another process.`);
        console.warn('  Common causes: A running dev server, VS Code Prisma extension, or an open terminal.');
        return false;
      }
      // If it's a permission error but not EPERM/EBUSY, still try to report it
      console.error(`! Fatal Error: Could not clean directory ${dir}: ${error.message}`);
      return false;
    }
  }
  return false;
}

// 1. Ensure required directories exist
const dirs = ['db', 'data'];
for (const dir of dirs) {
  const dirPath = path.join(rootDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
    console.log(`✓ Created directory: ${dir}`);
  }
}

// 2. Determine database provider
let databaseUrl = process.env.DATABASE_URL || '';

if (!databaseUrl && fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, 'utf8');
  const match = envContent.match(/DATABASE_URL=["']?(.+?)["']?(\s|$)/m);
  if (match) {
    databaseUrl = match[1];
  }
}

// Default to SQLite if not specified (only in local dev environments)
if (!databaseUrl) {
  databaseUrl = 'file:./db/custom.db';
  console.log('! No DATABASE_URL found in environment or .env, defaulting to SQLite');
  
  // Only write to .env if we are local (not in Vercel/CI)
  if (!process.env.VERCEL && !process.env.CI) {
    if (!fs.existsSync(envFile)) {
      fs.writeFileSync(envFile, `DATABASE_URL=${databaseUrl}\n`);
    } else {
      const envContent = fs.readFileSync(envFile, 'utf8');
      if (!envContent.includes('DATABASE_URL=')) {
        fs.appendFileSync(envFile, `\nDATABASE_URL=${databaseUrl}\n`);
      }
    }
  }
}

const isPostgres = databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://');
const sourceSchema = isPostgres ? 'schema.postgresql.prisma' : 'schema.sqlite.prisma';
const targetSchema = 'schema.prisma';

console.log(`> Target Database: ${isPostgres ? 'PostgreSQL' : 'SQLite'}`);

// 4. Run prisma generate for both providers to support dynamic switching
try {
  const sqliteGenDir = path.join(prismaDir, 'generated', 'sqlite');
  const pgGenDir = path.join(prismaDir, 'generated', 'postgresql');

  console.log('> Generating SQLite Prisma client...');
  if (!cleanDirectorySync(sqliteGenDir)) {
    console.error('! Aborting SQLite generation due to file lock.');
    throw new Error('FILE_LOCKED_SQLITE');
  }
  execSync('npx prisma generate --schema=prisma/schema.sqlite.prisma', { stdio: 'inherit', cwd: rootDir });
  
  console.log('> Generating PostgreSQL Prisma client...');
  if (!cleanDirectorySync(pgGenDir)) {
    console.error('! Aborting PostgreSQL generation due to file lock.');
    throw new Error('FILE_LOCKED_POSTGRES');
  }
  execSync('npx prisma generate --schema=prisma/schema.postgresql.prisma', { stdio: 'inherit', cwd: rootDir });
  
  // Also sync the main schema.prisma for general tools (Studio, etc)
  const sourcePath = path.join(prismaDir, isPostgres ? 'schema.postgresql.prisma' : 'schema.sqlite.prisma');
  const targetPath = path.join(prismaDir, 'schema.prisma');
  
  // Create a version of the schema without the custom output for the main schema.prisma
  // so that the default @prisma/client still works for the primary DB
  let schemaContent = fs.readFileSync(sourcePath, 'utf8');
  schemaContent = schemaContent.replace(/output\s*=\s*".*"/, '// output is default for main schema.prisma');
  fs.writeFileSync(targetPath, schemaContent);
  
  console.log(`✓ Synchronized schema.prisma from ${isPostgres ? 'schema.postgresql.prisma' : 'schema.sqlite.prisma'}`);
  
  console.log('> Running default prisma generate...');
  execSync('npx prisma generate', { stdio: 'inherit', cwd: rootDir });
  
  console.log('✓ All Prisma clients generated');
} catch (error) {
  if (error.message === 'FILE_LOCKED_SQLITE' || error.message === 'FILE_LOCKED_POSTGRES' || 
      (error.message && (error.message.includes('EPERM') || error.message.includes('operation not permitted')))) {
    console.error('\n--- CRITICAL: FILE LOCK DETECTED ---');
    console.error('Prisma cannot update its engine because it is currently in use.');
    console.error('This usually happens when a dev server or VS Code is running.');
    console.error('\nHOW TO FIX:');
    console.error('1. Close all running terminals (except this one).');
    console.error('2. Close VS Code (or restart the Prisma extension).');
    console.error('3. Run "taskkill /F /IM node.exe" in a Command Prompt to force clear all processes.');
    console.error('4. Try the build again.');
    console.error('-------------------------------------\n');
  } else {
    console.error('✗ Failed to generate Prisma clients', error);
  }
  process.exit(1);
}

// 5. Database push for SQLite if file missing
if (!isPostgres) {
  const sqlitePathMatch = databaseUrl.match(/file:(.+)/);
  if (sqlitePathMatch) {
    const relPath = sqlitePathMatch[1];
    const absPath = path.resolve(rootDir, relPath);
    const prismaAbsPath = path.resolve(prismaDir, relPath);
    
    if (!fs.existsSync(absPath) && !fs.existsSync(prismaAbsPath)) {
      console.log('> SQLite database file missing. Initializing database...');
      try {
        execSync('npx prisma db push', { stdio: 'inherit', cwd: rootDir });
        console.log('✓ Database initialized successfully');
      } catch (error) {
        console.error('✗ Failed to initialize database');
        // Don't exit(1) here as generate was successful
      }
    }
  }
}

console.log('--- Setup Complete ---\n');
