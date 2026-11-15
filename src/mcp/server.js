import crypto from 'node:crypto';
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { DemoToolRegistry } from '../tools/registry.js';

function tokenMatches(header, expected) {
  const received = Buffer.from(String(header || ''));
  const wanted = Buffer.from(`Bearer ${expected}`);
  return received.length === wanted.length && crypto.timingSafeEqual(received, wanted);
}

export function createMcpApp({ store, token }) {
  if (!token || token.length < 24) throw new Error('MCP_TOKEN must contain at least 24 characters');
  const registry = new DemoToolRegistry(store);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.post('/mcp', async (request, response) => {
    if (!tokenMatches(request.headers.authorization, token)) {
      response.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null });
      return;
    }
    const server = new Server({ name: 'dual-runtime-demo', version: '0.1.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: registry.definitions().map(definition => ({
        name: definition.name,
        description: definition.description,
        inputSchema: definition.input_schema,
      })),
    }));
    server.setRequestHandler(CallToolRequestSchema, async requestValue => {
      try {
        const output = await registry.call(requestValue.params.name, requestValue.params.arguments || {});
        return { content: [{ type: 'text', text: JSON.stringify(output) }] };
      } catch {
        return { isError: true, content: [{ type: 'text', text: 'Tool call failed' }] };
      }
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } finally {
      await transport.close().catch(() => {});
      await server.close().catch(() => {});
    }
  });
  return app;
}
