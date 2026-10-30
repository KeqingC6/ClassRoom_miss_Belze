import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5173;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.ts': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function resolveFile(urlPath) {
  let cleanPath = decodeURIComponent(urlPath.split('?')[0]);
  if (cleanPath === '/' || cleanPath === '') {
    cleanPath = '/index.html';
  }
  const fullPath = path.join(__dirname, cleanPath);

  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    return fullPath;
  }
  if (fs.existsSync(fullPath + '.ts') && fs.statSync(fullPath + '.ts').isFile()) {
    return fullPath + '.ts';
  }
  if (fs.existsSync(fullPath + '.js') && fs.statSync(fullPath + '.js').isFile()) {
    return fullPath + '.js';
  }
  return null;
}

const server = http.createServer((req, res) => {
  try {
    const filePath = resolveFile(req.url || '/');
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    if (ext === '.ts') {
      const tsSource = fs.readFileSync(filePath, 'utf-8');
      let jsOutput = stripTypeScriptTypes(tsSource, { mode: 'strip' });
      // Ensure relative imports have .ts extension for native browser ES module resolution
      jsOutput = jsOutput.replace(
        /(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g,
        (match, prefix, spec, suffix) => {
          if (spec.endsWith('.ts') || spec.endsWith('.js') || spec.endsWith('.css')) {
            return match;
          }
          return `${prefix}${spec}.ts${suffix}`;
        }
      );
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      });
      res.end(jsOutput);
      return;
    }

    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 Internal Server Error: ' + (err && err.message ? err.message : String(err)));
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  NTTCLASS TypeScript Server đang chạy tại:`);
  console.log(`  👉 http://localhost:${PORT}`);
  console.log(`  👉 Nhật ký học tập: http://localhost:${PORT}/?view=logs`);
  console.log(`  👉 Điểm số:         http://localhost:${PORT}/?view=scores-v2`);
  console.log(`======================================================\n`);
});
