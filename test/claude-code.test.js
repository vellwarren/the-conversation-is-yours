import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JsonConversationStore } from '../src/core/store.js';
import { ClaudeCodeRuntime } from '../src/runtimes/claude-code.js';

test('Claude Code adapter resumes only an uninterrupted runtime chain', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dual-claude-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const fake = path.join(directory, 'fake-claude.mjs');
  await fs.writeFile(fake, `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
let input = '';
for await (const chunk of process.stdin) input += chunk;
fs.appendFileSync(new URL('./calls.jsonl', import.meta.url), JSON.stringify({ args, input, hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY) }) + '\\n');
const at = args.indexOf('--resume');
const session = at >= 0 ? 'sid-resumed' : 'sid-fresh';
console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: session }));
console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: at >= 0 ? 'resumed' : 'fresh' }] } }));
console.log(JSON.stringify({ type: 'result', subtype: 'success', session_id: session, usage: { input_tokens: 1 } }));
`);
  await fs.chmod(fake, 0o755);
  const store = new JsonConversationStore(path.join(directory, 'state.json'));
  const runtime = new ClaudeCodeRuntime({
    bin: fake,
    model: 'test-model',
    configDir: directory,
    cwd: directory,
    resumeEnabled: true,
  });
  const onEvent = () => {};
  const firstConversation = { messages: [{ role: 'user', content: 'first' }] };
  const first = await runtime.run({ conversationId: 'room', conversation: firstConversation, switched: false, store, onEvent });
  assert.equal(first.text, 'fresh');
  assert.equal(store.runtimeSession('room', 'claude-code').sessionId, 'sid-fresh');

  const secondConversation = { messages: [...firstConversation.messages, { role: 'assistant', content: 'fresh' }, { role: 'user', content: 'second' }] };
  const second = await runtime.run({ conversationId: 'room', conversation: secondConversation, switched: false, store, onEvent });
  assert.equal(second.text, 'resumed');

  const third = await runtime.run({ conversationId: 'room', conversation: secondConversation, switched: true, store, onEvent });
  assert.equal(third.text, 'fresh');
  const calls = (await fs.readFile(path.join(directory, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls[0].args.includes('--resume'), false);
  assert.deepEqual(calls[1].args.slice(-2), ['--resume', 'sid-fresh']);
  assert.equal(calls[2].args.includes('--resume'), false);
  assert.equal(calls.every(call => call.hasApiKey === false), true);
  assert.match(JSON.parse(calls[1].input).message.content[0].text, /^second$/);
  assert.match(JSON.parse(calls[2].input).message.content[0].text, /User: first/);
});
