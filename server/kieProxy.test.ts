import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createKieHandler } from './kieProxy.ts';

async function request(action: string, options: { key?: string; method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const req = Readable.from([]) as any;
  req.url = `/api/kie?action=${action}`;
  req.method = options.method || 'GET';
  req.headers = options.headers || {};
  req.body = options.body;
  let response: any;
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(body: string) { response = { status: this.statusCode, headers: this.headers, body: JSON.parse(body) }; },
  };
  await createKieHandler(() => options.key)(req, res as any);
  return response;
}

test('configuration status exposes only availability', async () => {
  const response = await request('config', { key: 'server-test-secret' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { configured: true });
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual((await request('config')).body, { configured: false });
});

test('missing server key produces a useful error without asking the visitor for a key', async () => {
  const response = await request('create', { method: 'POST' });
  assert.equal(response.status, 503);
  assert.match(response.body.msg, /网站维护者/);
});

test('rejects unsupported routes, methods and malformed parameters before upstream calls', async () => {
  assert.equal((await request('anything', { key: 'test' })).status, 404);
  assert.equal((await request('create', { key: 'test' })).status, 405);
  assert.equal((await request('status&taskId=../other', { key: 'test' })).status, 400);
  assert.equal((await request('create', { key: 'test', method: 'POST', body: '{bad' })).status, 400);
  assert.equal((await request('create', { key: 'test', method: 'POST', body: { model: 'other', input: { prompt: 'test' } } })).status, 400);
});

test('create, poll and multipart upload use the server credential and fixed upstream endpoints', async () => {
  const originalFetch = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = (async (url: string, init: any) => {
    calls.push({ url, init });
    return Response.json({ code: 200, msg: 'ok', data: { taskId: 'task-1' } });
  }) as typeof fetch;
  try {
    const key = 'server-test-secret';
    const created = await request('create', { key, method: 'POST', body: { model: 'nano-banana-2', input: { prompt: 'A film set' }, ignored: true } });
    assert.equal(created.status, 200);
    assert.equal(calls[0].url, 'https://api.kie.ai/api/v1/jobs/createTask');
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${key}`);
    assert.equal(JSON.parse(calls[0].init.body).ignored, undefined);
    assert.ok(!JSON.stringify(created).includes(key));
    await request('status&taskId=task-1', { key });
    assert.equal(calls[1].url, 'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task-1');
    const contentType = 'application/octet-stream';
    await request('upload', { key, method: 'POST', headers: { 'content-type': contentType }, body: Buffer.from('--test\r\nimage bytes') });
    assert.equal(calls[2].url, 'https://kieai.redpandaai.co/api/file-stream-upload');
    assert.equal(calls[2].init.headers['Content-Type'], undefined);
    assert.ok(calls[2].init.body instanceof FormData);
    assert.equal(calls[2].init.body.get('uploadPath'), 'hollycut/sources');
    const firstName = calls[2].init.body.get('fileName');
    assert.match(firstName, /^reference-[a-f0-9-]+\.png$/);
    assert.equal(calls[2].init.body.get('file').name, firstName);
    await request('upload', { key, method: 'POST', headers: { 'content-type': contentType }, body: Buffer.from('another image') });
    assert.notEqual(calls[3].init.body.get('fileName'), firstName);
    assert.equal(await calls[2].init.body.get('file').text(), '--test\r\nimage bytes');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('upstream failures do not expose credentials', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('server-test-secret'); }) as typeof fetch;
  try {
    const response = await request('status&taskId=task-1', { key: 'server-test-secret' });
    assert.equal(response.status, 502);
    assert.ok(!JSON.stringify(response).includes('server-test-secret'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
