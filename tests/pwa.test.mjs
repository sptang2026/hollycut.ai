import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const template = await readFile('pwa/service-worker.js', 'utf8');
function worker() {
  const handlers = {};
  const calls = { added: [], fetched: [], skipped: 0, claimed: 0 };
  const cache = { addAll: async paths => calls.added.push(...paths), match: async key => key === '/index.html' ? new Response('offline shell') : undefined };
  const context = {
    URL, Set, Promise,
    self: { location: { origin: 'https://example.com' }, addEventListener: (name, fn) => { handlers[name] = fn; }, skipWaiting: () => { calls.skipped++; }, clients: { claim: async () => { calls.claimed++; } } },
    caches: { open: async () => cache, keys: async () => ['hollycut-shell-test'], delete: async () => true },
    fetch: async request => { calls.fetched.push(request); return new Response('network'); },
  };
  vm.runInNewContext(template.replace('__CACHE_NAME__', '"hollycut-shell-test"').replace('__PRECACHE__', JSON.stringify(['/index.html', '/assets/app.js', '/manifest.webmanifest'])), context);
  return { handlers, calls };
}

test('manifest has standalone launch and correctly sized installation icons', async () => {
  const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    const png = await readFile('public' + icon.src);
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    assert.equal(icon.sizes, `${width}x${height}`);
  }
});

test('worker leaves API, uploaded images, POSTs and external resources entirely to the network', () => {
  const { handlers } = worker();
  for (const [url, method] of [
    ['https://example.com/api/kie?action=config', 'GET'],
    ['https://example.com/api/kie?action=create', 'POST'],
    ['https://example.com/uploaded-photo.png', 'GET'],
    ['https://other.example/image.png', 'GET'],
  ]) {
    let intercepted = false;
    handlers.fetch({ request: { url, method, mode: 'cors' }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, url);
  }
});

test('offline shell is installed without forcing an update and serves offline navigation', async () => {
  const { handlers, calls } = worker();
  let pending;
  handlers.install({ waitUntil: promise => { pending = promise; } });
  await pending;
  assert.deepEqual(calls.added, ['/index.html', '/assets/app.js', '/manifest.webmanifest']);
  assert.equal(calls.skipped, 0);
  let response;
  handlers.fetch({ request: { url: 'https://example.com/', method: 'GET', mode: 'navigate' }, respondWith: promise => { response = promise; } });
  assert.equal(await (await response).text(), 'offline shell');
  assert.equal(calls.fetched.length, 0);
  handlers.message({ data: { type: 'SKIP_WAITING' } });
  assert.equal(calls.skipped, 1);
});

test('build changes cache version with asset contents and excludes private/server files', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hollycut-pwa-'));
  try {
    await mkdir(path.join(dir, 'dist/assets'), { recursive: true });
    await mkdir(path.join(dir, 'dist/api'), { recursive: true });
    await mkdir(path.join(dir, 'pwa'));
    await cp('pwa/service-worker.js', path.join(dir, 'pwa/service-worker.js'));
    await writeFile(path.join(dir, 'dist/index.html'), 'shell');
    await writeFile(path.join(dir, 'dist/assets/app.js'), 'one');
    await writeFile(path.join(dir, 'dist/api/private.json'), 'private');
    const script = path.resolve('scripts/build-pwa.mjs');
    execFileSync(process.execPath, [script], { cwd: dir });
    const first = await readFile(path.join(dir, 'dist/sw.js'), 'utf8');
    assert.ok(!first.includes('private.json'));
    execFileSync(process.execPath, [script], { cwd: dir });
    assert.equal(first, await readFile(path.join(dir, 'dist/sw.js'), 'utf8'));
    await writeFile(path.join(dir, 'dist/assets/app.js'), 'two');
    execFileSync(process.execPath, [script], { cwd: dir });
    assert.notEqual(first.match(/hollycut-shell-[a-f0-9]+/)[0], (await readFile(path.join(dir, 'dist/sw.js'), 'utf8')).match(/hollycut-shell-[a-f0-9]+/)[0]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
