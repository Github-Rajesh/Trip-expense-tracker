import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'server' || entry.name === '.openai') continue;
      files.push(...await walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

const files = await walk('dist');
const assets = {};

for (const file of files) {
  const path = `/${relative('dist', file).split(sep).join('/')}`;
  assets[path] = {
    contentType: contentTypes[extname(file)] || 'application/octet-stream',
    body: (await readFile(file)).toString('base64')
  };
}

await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });

await writeFile('dist/server/index.js', `const ASSETS = ${JSON.stringify(assets)};

function responseFor(pathname) {
  const asset = ASSETS[pathname] || ASSETS['/index.html'];
  if (!asset) return new Response('Not found', { status: 404 });

  const bytes = Uint8Array.from(atob(asset.body), (char) => char.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'content-type': asset.contentType,
      'cache-control': pathname.includes('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache'
    }
  });
}

export default {
  fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    return responseFor(pathname);
  }
};
`, 'utf8');

await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
