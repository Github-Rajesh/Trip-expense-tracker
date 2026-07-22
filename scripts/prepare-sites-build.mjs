import { copyFile, mkdir, writeFile } from 'node:fs/promises';

await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });

await writeFile(
  'dist/server/index.js',
  "import handler from './index.mjs';\n\nexport default { fetch: handler };\n",
  'utf8'
);

await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
