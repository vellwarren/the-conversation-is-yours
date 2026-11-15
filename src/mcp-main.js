import path from 'node:path';
import { JsonConversationStore } from './core/store.js';
import { createMcpApp } from './mcp/server.js';

const store = new JsonConversationStore(process.env.DATA_FILE || path.resolve('data/state.json'));
const port = Number(process.env.MCP_PORT || 8788);
const token = process.env.MCP_TOKEN || '';
createMcpApp({ store, token }).listen(port, '127.0.0.1', () => {
  console.log(`toy MCP server listening on http://127.0.0.1:${port}/mcp`);
});
