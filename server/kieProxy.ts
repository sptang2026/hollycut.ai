import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

type Request = IncomingMessage & { body?: unknown };
const MAX_BODY = 4 * 1024 * 1024;

async function readBody(req: Request): Promise<Buffer> {
  if (req.body !== undefined) {
    if (Buffer.isBuffer(req.body)) return req.body;
    return Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY) throw new Error('BODY_TOO_LARGE');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function createKieHandler(getKey: () => string | undefined) {
  return async (req: Request, res: ServerResponse) => {
    const reply = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(body));
    };
    const url = new URL(req.url || '/', 'http://localhost');
    const action = url.searchParams.get('action');
    const apiKey = getKey()?.trim();
    if (action === 'config' && req.method === 'GET') {
      reply(200, { configured: Boolean(apiKey) });
      return;
    }
    const expectedMethod = action === 'status' ? 'GET' : 'POST';
    if (!['upload', 'create', 'status'].includes(action || '')) {
      reply(404, { code: 404, msg: '接口不存在' });
      return;
    }
    if (req.method !== expectedMethod) {
      res.setHeader('Allow', expectedMethod);
      reply(405, { code: 405, msg: '请求方式不支持' });
      return;
    }
    if (!apiKey) {
      reply(503, { code: 503, msg: '服务暂未配置，请联系网站维护者设置 KIE_API_KEY。' });
      return;
    }
    try {
      let upstream: string;
      const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
      let body: Buffer | string | FormData | undefined;
      if (action === 'status') {
        const taskId = url.searchParams.get('taskId') || '';
        if (!/^[a-zA-Z0-9_-]{1,200}$/.test(taskId)) {
          reply(400, { code: 400, msg: '任务编号无效' });
          return;
        }
        upstream = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;
      } else {
        body = await readBody(req);
        if (body.length > MAX_BODY) throw new Error('BODY_TOO_LARGE');
        if (action === 'upload') {
          const contentType = req.headers['content-type'] || '';
          if (contentType !== 'application/octet-stream') {
            reply(400, { code: 400, msg: '图片上传格式错误' });
            return;
          }
          const form = new FormData();
          const fileName = `reference-${randomUUID()}.png`;
          form.append('file', new Blob([Uint8Array.from(body)], { type: 'application/octet-stream' }), fileName);
          form.append('uploadPath', 'hollycut/sources');
          form.append('fileName', fileName);
          body = form;
          upstream = 'https://kieai.redpandaai.co/api/file-stream-upload';
        } else {
          const payload = JSON.parse(body.toString());
          const input = payload.input;
          if (payload.model !== 'nano-banana-2' || !input || typeof input.prompt !== 'string' || !input.prompt.trim()) {
            reply(400, { code: 400, msg: '生成参数无效' });
            return;
          }
          body = JSON.stringify({ model: 'nano-banana-2', input });
          headers['Content-Type'] = 'application/json';
          upstream = 'https://api.kie.ai/api/v1/jobs/createTask';
        }
      }
      const response = await fetch(upstream, {
        method: expectedMethod,
        headers,
        body: body as BodyInit | undefined,
        signal: AbortSignal.timeout(55000),
      });
      const data = await response.json();
      // Return only fields needed by the app, never upstream request headers.
      reply(response.status, {
        code: data.code,
        msg: typeof data.msg === 'string' ? data.msg.replaceAll(apiKey, '[redacted]') : undefined,
        data: data.data,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'BODY_TOO_LARGE') {
        reply(413, { code: 413, msg: '参考图片过大，请使用小于 4MB 的图片。' });
      } else if (error instanceof SyntaxError) {
        reply(400, { code: 400, msg: '请求格式错误' });
      } else {
        reply(502, { code: 502, msg: '图像服务暂时无法连接，请稍后重试。' });
      }
    }
  };
}
