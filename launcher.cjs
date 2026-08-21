const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const http = require('http');

const APP_NAME = 'JIRA ETL Dashboard';
const DEFAULT_PORT = 3200;
const PORT_SCAN_RANGE = 100;

// Explicit PORT env wins; otherwise we scan for a free port starting at DEFAULT_PORT
const REQUESTED_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : null;
let PORT = REQUESTED_PORT || DEFAULT_PORT;

/**
 * Returns true when `dir` lives under the OS temp directory.
 * The caxa-packaged exe self-extracts there, so that location is volatile
 * (wiped by temp cleanup and by every re-package) and must not hold user data.
 */
function isUnderTempDir(dir) {
  try {
    const tmp = fs.realpathSync(os.tmpdir()).toLowerCase();
    const real = fs.realpathSync(dir).toLowerCase();
    return real === tmp || real.startsWith(tmp + path.sep);
  } catch (e) {
    return false;
  }
}

/**
 * Returns the platform-appropriate base directory for persistent app data:
 * - Windows: %APPDATA% (AppData\Roaming)
 * - macOS:   ~/Library/Application Support
 * - Linux:   $XDG_DATA_HOME or ~/.local/share
 */
function defaultDataDir() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME);
  }
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, APP_NAME);
  }
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, APP_NAME);
}

/**
 * Decide where the database lives:
 * 1. JIRA_ETL_DATA_DIR override (explicit user/admin control).
 * 2. Packaged exe (running from the temp extraction dir): the platform data
 *    directory, so data survives app updates and temp cleanup.
 * 3. Portable layout (app folder on a local/shared/USB drive): a `data`
 *    folder next to the app, so the database travels with the folder.
 */
function resolveAppDataDir() {
  if (process.env.JIRA_ETL_DATA_DIR) {
    return path.resolve(process.env.JIRA_ETL_DATA_DIR);
  }
  if (isUnderTempDir(__dirname)) {
    return defaultDataDir();
  }
  return path.join(__dirname, 'data');
}

const appDataDir = resolveAppDataDir();
const dbDir = path.join(appDataDir, 'prisma', 'db');
const dbPath = path.join(dbDir, 'custom.db');

fs.mkdirSync(dbDir, { recursive: true });

/**
 * First-run bootstrap: seed the database from the bundled schema-only
 * template. Never touches an existing database file, so user data survives
 * app updates.
 */
function bootstrapDatabase() {
  try {
    if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
      return; // existing database — leave it alone
    }
    const candidates = [
      path.join(__dirname, 'db', 'template.db'),
      path.join(__dirname, 'prisma', 'db', 'template.db'),
    ];
    const template = candidates.find(function (p) {
      try {
        return fs.existsSync(p) && fs.statSync(p).size > 0;
      } catch (e) {
        return false;
      }
    });
    if (template) {
      fs.copyFileSync(template, dbPath);
      console.log('First run: created a new database from the bundled template.');
    } else {
      console.warn('Warning: no database template found in the package. The database will be created empty (without schema).');
    }
  } catch (e) {
    console.error('Warning: could not initialize the database file: ' + e.message);
  }
}

bootstrapDatabase();

/**
 * Probe whether a TCP port is free on localhost by briefly binding it.
 */
function isPortFree(port) {
  return new Promise(function (resolve) {
    const tester = net.createServer();
    tester.unref();
    tester.once('error', function () { resolve(false); });
    tester.once('listening', function () {
      tester.close(function () { resolve(true); });
    });
    tester.listen(port, '127.0.0.1');
  });
}

/**
 * Find an available port. Honors an explicit PORT env var as-is; otherwise
 * scans upward from DEFAULT_PORT so a busy port never blocks startup
 * (mirrors the port-scan behavior of the build-production launcher).
 */
async function resolvePort() {
  if (REQUESTED_PORT) {
    return REQUESTED_PORT;
  }
  for (let i = 0; i < PORT_SCAN_RANGE; i++) {
    const candidate = DEFAULT_PORT + i;
    if (await isPortFree(candidate)) {
      return candidate;
    }
    console.log('Port ' + candidate + ' is occupied, trying next...');
  }
  throw new Error('No available port found in range ' + DEFAULT_PORT + '-' + (DEFAULT_PORT + PORT_SCAN_RANGE - 1));
}

async function main() {
  try {
    PORT = await resolvePort();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const serverPath = path.join(__dirname, 'server.js');

  const env = {
    ...process.env,
    PORT: PORT.toString(),
    NODE_ENV: 'production',
    DATABASE_URL: 'file:' + dbPath.replace(/\\/g, '/'),
  };

  console.log('Starting ' + APP_NAME + ' on port ' + PORT + '...');
  console.log('Database: ' + dbPath);

  const server = spawn(process.execPath, [serverPath], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: __dirname,
  });

  server.stdout.on('data', function(d) { process.stdout.write(d.toString()); });
  server.stderr.on('data', function(d) { process.stderr.write(d.toString()); });

  server.on('exit', function(code) {
    console.log('Server exited with code ' + code);
    process.exit(code);
  });

  function waitForServer(retries) {
    if (retries <= 0) {
      console.error('Server failed to start within 60 seconds');
      return;
    }
    http.get('http://localhost:' + PORT, function(res) {
      console.log('\n' + APP_NAME + ' is ready!');
      console.log('Opening http://localhost:' + PORT + ' in your browser...\n');
      try {
        const openCmd = process.platform === 'win32' ? 'start' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
        require('child_process').execSync(`${openCmd} http://localhost:${PORT}`, { shell: true });
      } catch (e) {
        // Browser open failed, not critical
      }
    }).on('error', function() {
      setTimeout(function() { waitForServer(retries - 1); }, 1000);
    });
  }

  setTimeout(function() { waitForServer(60); }, 2000);

  process.on('SIGINT', function() { server.kill(); process.exit(); });
  process.on('SIGTERM', function() { server.kill(); process.exit(); });
}

main();
