import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JsonConversationStore } from '../src/core/store.js';
import { MessagesApiRuntime } from '../src/runtimes/messages-api.js';

function sse(values) {
  return values.map(value => `event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`).join('');
}

test('Messages API runtime executes a tool loop and returns visible text', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dual-api-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new JsonConversationStore(path.join(directory, 'state.json'));
  const bodies = [];
  const responses = [
    sse([
      { type: 'message_start', message: { usage: { input_tokens: 10 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tool-1', name: 'save_note', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"text":"buy oat milk"}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } },
      { type: 'message_stop' },
    ]),
    sse([
      { type: 'message_start', message: { usage: { input_tokens: 20 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Saved.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
      { type: 'message_stop' },
    ]),
  ];
  const runtime = new MessagesApiRuntime({
    apiKey: 'test-key',
    model: 'test-model',
    fetch: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return new Response(responses.shift(), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    },
  });
  const normalized = [];
  const result = await runtime.run({
    conversation: { messages: [{ role: 'user', content: 'remember oat milk' }] },
    store,
    onEvent: value => normalized.push(value),
  });

  assert.equal(result.text, 'Saved.');
  assert.equal(store.listNotes()[0].text, 'buy oat milk');
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].messages.at(-1).content[0].type, 'tool_result');
  assert.equal(normalized.some(value => value.kind === 'tool_use'), true);
  assert.equal(normalized.some(value => value.kind === 'tool_result'), true);
});
