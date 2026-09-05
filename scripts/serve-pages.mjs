import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const basePath = '/Escape-Velocity';
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const hostIndex = args.indexOf('--host');
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 4176;
const host = hostIndex >= 0 ? args[hostIndex + 1] : '127.0.0.1';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function fileForPath(requestPath) {
  if (requestPath !== basePath && !requestPath.startsWith(`${basePath}/`)) return null;
  const relativePath = requestPath.slice(basePath.length).replace(/^\/+/, '') || 'index.html';
  const candidate = resolve(join(root, normalize(relativePath)));
  if (candidate !== root && !candidate.startsWith(`${root}/`)) return null;
  return candidate;
}

const server = createServer((request, response) => {
  const requestPath = new URL(request.url ?? '/', `http://${host}`).pathname;
  const candidate = fileForPath(requestPath);
  if (!candidate) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  let filePath = candidate;
  try {
    if (statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html');
    statSync(filePath);
  } catch {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Pages preview available at http://${host}:${port}${basePath}/`);
});
