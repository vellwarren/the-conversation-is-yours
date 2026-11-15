import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { JsonConversationStore } from '../src/core/store.js';
import { createMcpApp } from '../src/mcp/server.js';

test('toy MCP endpoint requires its bearer and exposes the neutral registry', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dual-mcp-test-'));
  const store = new JsonConversationStore(path.join(directory, 'state.json'));
  const token = 'test-token-with-at-least-24-characters';
  const server = createMcpApp({ store, token }).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const address = server.address();
  const url = new URL(`http://127.0.0.1:${address.port}/mcp`);

  const unauthorized = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
  });
  assert.equal(unauthorized.status, 401);

  const client = new Client({ name: 'dual-runtime-test', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  try {
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(tool => tool.name), ['save_note', 'search_notes', 'get_current_time']);
    const saved = await client.callTool({ name: 'save_note', arguments: { text: 'buy oat milk' } });
    assert.equal(saved.isError, undefined);
    const searched = await client.callTool({ name: 'search_notes', arguments: { query: 'oat' } });
    assert.equal(JSON.parse(searched.content[0].text).notes[0].text, 'buy oat milk');
  } finally {
    await client.close();
  }
});
