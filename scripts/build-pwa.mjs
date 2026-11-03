import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else files.push(file);
  }
  return files;
}
const files = (await walk(root)).filter(file => !file.endsWith('/sw.js')).sort();
const hash = createHash('sha256');
const assets = [];
for (const file of files) {
  const relative = '/' + path.relative(root, file).split(path.sep).join('/');
  // Only generated frontend assets belong to the offline shell.
  if (!(relative === '/index.html' || relative === '/manifest.webmanifest' || relative.startsWith('/assets/') || relative.startsWith('/icons/'))) continue;
  hash.update(relative).update(await readFile(file));
  assets.push(relative);
}
const template = await readFile('pwa/service-worker.js', 'utf8');
const cache = `hollycut-shell-${hash.digest('hex').slice(0, 16)}`;
await writeFile(path.join(root, 'sw.js'), template.replace('__CACHE_NAME__', JSON.stringify(cache)).replace('__PRECACHE__', JSON.stringify(assets)));
console.log(`PWA shell: ${assets.length} public assets; no API or photo caching.`);
