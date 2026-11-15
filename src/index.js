import path from 'node:path';
import { JsonConversationStore } from './core/store.js';
import { RuntimeRouter } from './core/router.js';
import { FakeRuntime } from './runtimes/fake.js';
import { ClaudeCodeRuntime } from './runtimes/claude-code.js';
import { MessagesApiRuntime } from './runtimes/messages-api.js';
import { createApp } from './app.js';
import { createMcpApp } from './mcp/server.js';

const store = new JsonConversationStore(process.env.DATA_FILE || path.resolve('data/state.json'));
const runtimes = {
  'fake-api': new FakeRuntime('fake-api'),
  'fake-claude-code': new FakeRuntime('fake-claude-code'),
  api: new MessagesApiRuntime({
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL,
    version: process.env.ANTHROPIC_VERSION,
  }),
  'claude-code': new ClaudeCodeRuntime({
    bin: process.env.CLAUDE_BIN,
    model: process.env.CLAUDE_MODEL,
    configDir: process.env.CLAUDE_CONFIG_DIR,
    homeDir: process.env.CLAUDE_HOME_DIR,
    cwd: process.env.CLAUDE_SPAWN_CWD,
    timeoutMs: process.env.CLAUDE_TIMEOUT_MS,
    mcpUrl: process.env.CLAUDE_MCP_URL,
    mcpToken: process.env.CLAUDE_MCP_TOKEN,
  }),
};
const router = new RuntimeRouter({ store, runtimes, defaultRuntime: process.env.DEFAULT_RUNTIME || 'fake-api' });
const server = createApp({ router, store });
const port = Number(process.env.PORT || 8787);
server.listen(port, '127.0.0.1', () => {
  console.log(`dual-runtime demo listening on http://127.0.0.1:${port}`);
});

if (process.env.MCP_TOKEN) {
  const mcpPort = Number(process.env.MCP_PORT || 8788);
  createMcpApp({ store, token: process.env.MCP_TOKEN }).listen(mcpPort, '127.0.0.1', () => {
    console.log(`toy MCP server listening on http://127.0.0.1:${mcpPort}/mcp`);
  });
}
