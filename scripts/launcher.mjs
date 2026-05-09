import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const START_PORT = parseInt(process.env.PORT || '3000');

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

async function findAvailablePort(startPort) {
  let port = startPort;
  while (!(await isPortAvailable(port))) {
    console.log(`Port ${port} is occupied, trying ${port + 1}...`);
    port++;
    if (port > startPort + 100) {
      throw new Error('Could not find an available port in range 3000-3100');
    }
  }
  return port;
}

async function start() {
  try {
    const port = await findAvailablePort(START_PORT);
    console.log(`\n=============================================`);
    console.log(`  Jira Dashboard starting on port: ${port}`);
    console.log(`  URL: http://localhost:${port}`);
    console.log(`=============================================\n`);

    // Set the environment variable for Next.js
    process.env.PORT = port.toString();
    process.env.NODE_ENV = 'production';

    // The server.js is located in the 'app' subfolder of the package
    const serverPath = join(__dirname, 'app', 'server.js');
    
    // Launch the server.js using the current node process
    import(serverPath);
  } catch (err) {
    console.error('Failed to start launcher:', err);
    process.exit(1);
  }
}

start();
