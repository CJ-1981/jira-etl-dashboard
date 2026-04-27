# Scripts Directory

This directory contains utility scripts for development and maintenance.

## Available Scripts

### Memory Health Check

**Windows:**
```bash
scripts\memory-health.bat
```

**Linux/Mac:**
```bash
chmod +x scripts/memory-health.sh
./scripts/memory-health.sh
```

**What it does:**
- Checks current Node.js processes
- Shows memory usage statistics
- Displays cache sizes
- Provides recommendations
- Offers to clean cache and restart dev server

### When to Use

- **Before starting work**: Check system resources
- **When experiencing memory issues**: Identify problematic processes
- **After crashes**: Clean up and get recommendations
- **Regular maintenance**: Monitor memory usage trends

### Manual Commands

If scripts don't work, you can manually:

**Windows:**
```cmd
# Check Node processes
tasklist /FI "IMAGENAME eq node.exe"

# Kill all Node processes
taskkill /F /IM node.exe

# Clean cache
rmdir /s /q .next
rmdir /s /q node_modules\.cache

# Restart dev server
npm run dev
```

**Linux/Mac:**
```bash
# Check Node processes
ps aux | grep node

# Kill all Node processes
pkill -9 node

# Clean cache
rm -rf .next node_modules/.cache

# Restart dev server
npm run dev
```

## Additional NPM Scripts

Available in `package.json`:

- `npm run dev` - Standard development server
- `npm run dev:turbo` - Development with Turbopack (faster)
- `npm run dev:low-memory` - Development with memory limits
- `npm run dev:clean` - Clean cache and start development
- `npm run clean` - Clean cache only
- `npm run build:analyze` - Analyze bundle size

## Troubleshooting

### Issue: "Port 3000 already in use"

**Solution:**
```bash
# Find process using port 3000
netstat -ano | findstr :3000

# Kill the process
taskkill /PID <PID> /F
```

### Issue: "Out of memory"

**Solution:**
```bash
# Run with memory limits
npm run dev:low-memory

# Or set environment variable
set NODE_OPTIONS=--max-old-space-size=2048
npm run dev
```

### Issue: "Too many node processes"

**Solution:**
```bash
# Run the memory health script
scripts\memory-health.bat

# Or manually kill all node processes
taskkill /F /IM node.exe
```

### Prisma Setup Script

```bash
node scripts/prisma-setup.mjs
```

**What it does:**
- Detects the database provider from `.env` (SQLite or PostgreSQL)
- Synchronizes the correct schema template from `prisma/`
- Generates the Prisma client
- Initializes the SQLite database if it doesn't exist

### Issue: "Missing Prisma Schema"
This happens if you haven't run the setup script. Run `npm run dev:clean` or `node scripts/prisma-setup.mjs` to restore it.

## Development Tips

1. **Start fresh**: Always run `npm run dev:clean` after pulling changes
2. **Monitor resources**: Keep Task Manager/activity monitor open
3. **Use Turbopack**: Try `npm run dev:turbo` for faster builds
4. **Memory limits**: Use `npm run dev:low-memory` on systems with limited RAM
5. **Regular cleaning**: Run `npm run clean` weekly or when experiencing issues