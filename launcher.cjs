const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

const APP_NAME = 'JIRA ETL Dashboard';
const PORT = parseInt(process.env.PORT || '3200', 10);

const appDataDir = path.join(
  process.env.APPDATA || process.env.HOME || process.cwd(),
  APP_NAME
);
const dbDir = path.join(appDataDir, 'prisma', 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const serverPath = path.join(__dirname, 'server.js');

const env = {
  ...process.env,
  PORT: PORT.toString(),
  NODE_ENV: 'production',
  DATABASE_URL: 'file:' + path.join(dbDir, 'custom.db').replace(/\\/g, '/'),
};

console.log('Starting ' + APP_NAME + ' on port ' + PORT + '...');
console.log('Database: ' + path.join(dbDir, 'custom.db'));

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