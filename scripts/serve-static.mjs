#!/usr/bin/env node
/**
 * serve-static.mjs — tiny static server for e2e tests (and local preview) of
 * the GitHub Pages bundle. Maps BASE_PATH (default /jira-etl-dashboard) onto
 * STATIC_DIR (default ./out) so relative asset URLs resolve exactly as they do
 * on Pages. Stdlib only.
 *
 * Env: PORT (default 4173), BASE_PATH, STATIC_DIR
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT || 4173);
const HOST = '127.0.0.1';
const BASE_PATH = (process.env.BASE_PATH || '/jira-etl-dashboard').replace(/\/+$/, '');
const STATIC_DIR = path.resolve(repoRoot, process.env.STATIC_DIR || 'out');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  if (!urlPath.startsWith(`${BASE_PATH}/`) && urlPath !== BASE_PATH) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Not found — serve under ${BASE_PATH}/ (got ${urlPath})`);
    return;
  }

  // Map the base path onto the static dir; resolve inside STATIC_DIR only.
  const relative = urlPath.slice(BASE_PATH.length).replace(/^\/+/, '') || 'index.html';
  let filePath = path.resolve(STATIC_DIR, relative);
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Pages-style fallback: unknown extension-less paths get the nearest
      // index.html (trailingSlash export keeps one page, so this is enough).
      const fallback = path.join(STATIC_DIR, 'index.html');
      fs.readFile(fallback, (err2, html) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
      });
      return;
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[serve-static] ${STATIC_DIR} -> http://${HOST}:${PORT}${BASE_PATH}/`);
});
