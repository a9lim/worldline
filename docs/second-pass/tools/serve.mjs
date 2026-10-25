// A static server like the root's docs/sim-overhaul/serve.mjs, with /worldline/ served from a
// chosen checkout (a worktree, a frozen base for benchmarks), so each tree is tested alone.
// usage: node serve.mjs PORT [WORLDLINE_DIR = this checkout]; A9_ROOT overrides the site root
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
const ROOT = process.env.A9_ROOT || '/Users/a9lim/Work/a9lim.github.io';
const port = +process.argv[2];
const WL = resolve(process.argv[3] || new URL('../../..', import.meta.url).pathname);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.wgsl': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};
function map(path) {
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'shared') return join(ROOT, path);
  if (parts[0] === 'worldline') return join(WL, parts.slice(1).join('/'));
  return join(ROOT, 'dist', path);
}
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = normalize(decodeURIComponent(url.pathname));
  if (path.includes('..')) { res.writeHead(400).end(); return; }
  const top = path.split('/').filter(Boolean);
  if (top.length === 1 && top[0] === 'worldline' && !path.endsWith('/')) { res.writeHead(308, { Location: path + '/' + url.search }).end(); return; }
  let file = map(path);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    const headers = { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' };
    if (top[0] === 'worldline') headers['Cross-Origin-Embedder-Policy'] = 'credentialless';
    res.writeHead(200, headers).end(body);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found: ' + path); }
}).listen(port, () => console.log(`worldline from ${WL} on http://localhost:${port}/worldline/`));
