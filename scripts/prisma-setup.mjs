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

// 3. Copy schema template
const sourcePath = path.join(prismaDir, sourceSchema);
const targetPath = path.join(prismaDir, targetSchema);

if (fs.existsSync(sourcePath)) {
  // Only copy if different or missing
  let shouldCopy = true;
  if (fs.existsSync(targetPath)) {
    const sourceContent = fs.readFileSync(sourcePath, 'utf8');
    const targetContent = fs.readFileSync(targetPath, 'utf8');
    if (sourceContent === targetContent) {
      shouldCopy = false;
    }
  }

  if (shouldCopy) {
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`✓ Synchronized ${targetSchema} from ${sourceSchema}`);
  } else {
    console.log(`✓ ${targetSchema} is already up to date`);
  }
} else {
  console.error(`✗ Error: Source schema ${sourceSchema} not found in ${prismaDir}`);
  process.exit(1);
}

// 4. Run prisma generate
try {
  console.log('> Running npx prisma generate...');
  execSync('npx prisma generate', { stdio: 'inherit', cwd: rootDir });
  console.log('✓ Prisma client generated');
} catch (error) {
  console.error('✗ Failed to generate Prisma client');
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
