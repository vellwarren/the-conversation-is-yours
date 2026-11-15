import http from 'node:http';
import { URL } from 'node:url';

async function jsonBody(request, limit = 64 * 1024) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > limit) throw Object.assign(new Error('Request too large'), { status: 413 });
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(value)}\n`);
}

function sendSse(response, value) {
  response.write(`data: ${JSON.stringify(value)}\n\n`);
}

export function createApp({ router, store }) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/healthz') {
      sendJson(response, 200, { ok: true });
      return;
    }
    if (request.method === 'GET' && url.pathname.startsWith('/conversations/')) {
      const id = decodeURIComponent(url.pathname.slice('/conversations/'.length));
      try {
        sendJson(response, 200, store.conversation(id));
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }
      return;
    }
    if (request.method === 'POST' && url.pathname === '/chat') {
      try {
        const body = await jsonBody(request);
        response.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
        });
        const result = await router.turn({
          conversationId: body.conversationId,
          text: body.text,
          runtime: body.runtime,
          onEvent: normalized => sendSse(response, normalized),
        });
        sendSse(response, { kind: 'response', data: result });
        response.end();
      } catch (error) {
        if (!response.headersSent) sendJson(response, error.status || 400, { error: error.code || error.message });
        else response.end();
      }
      return;
    }
    sendJson(response, 404, { error: 'not_found' });
  });
}
