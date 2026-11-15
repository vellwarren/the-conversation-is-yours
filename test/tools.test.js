import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JsonConversationStore } from '../src/core/store.js';
import { DemoToolRegistry } from '../src/tools/registry.js';

test('the same neutral tool registry serves both runtime protocols', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dual-tools-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const registry = new DemoToolRegistry(new JsonConversationStore(path.join(directory, 'state.json')));

  const definitions = registry.definitions({ cacheLast: true });
  assert.deepEqual(definitions.map(tool => tool.name), ['save_note', 'search_notes', 'get_current_time']);
  assert.deepEqual(definitions.at(-1).cache_control, { type: 'ephemeral', ttl: '1h' });

  await registry.call('save_note', { text: 'buy oat milk' });
  const result = await registry.call('search_notes', { query: 'OAT' });
  assert.equal(result.notes.length, 1);
  assert.equal(result.notes[0].text, 'buy oat milk');
});
