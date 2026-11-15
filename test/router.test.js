import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JsonConversationStore } from '../src/core/store.js';
import { RuntimeRouter } from '../src/core/router.js';
import { FakeRuntime } from '../src/runtimes/fake.js';

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dual-runtime-test-'));
  const store = new JsonConversationStore(path.join(directory, 'state.json'));
  const api = new FakeRuntime('fake-api');
  const claude = new FakeRuntime('fake-claude-code');
  const router = new RuntimeRouter({
    store,
    runtimes: { 'fake-api': api, 'fake-claude-code': claude },
    defaultRuntime: 'fake-api',
  });
  return { directory, store, api, claude, router };
}

test('a second runtime receives application-owned history from the first', async t => {
  const value = await fixture();
  t.after(() => fs.rm(value.directory, { recursive: true, force: true }));

  const first = await value.router.turn({ conversationId: 'room-1', text: 'hello', runtime: 'fake-claude-code' });
  const second = await value.router.turn({ conversationId: 'room-1', text: 'continue', runtime: 'fake-api' });

  assert.equal(first.switched, false);
  assert.equal(second.switched, true);
  assert.match(second.text, /Previous reply: fake-claude-code started/);
  assert.equal(value.api.calls[0].conversation.messages.length, 3);
  assert.deepEqual(value.store.conversation('room-1').messages.map(message => message.role), [
    'user', 'assistant', 'user', 'assistant',
  ]);
});

test('switching back marks the Claude-style runtime fresh', async t => {
  const value = await fixture();
  t.after(() => fs.rm(value.directory, { recursive: true, force: true }));
  await value.router.turn({ conversationId: 'room-2', text: 'one', runtime: 'fake-api' });
  await value.router.turn({ conversationId: 'room-2', text: 'two', runtime: 'fake-claude-code' });
  assert.equal(value.claude.calls[0].switched, true);
});

test('a paid runtime can never be selected implicitly', async t => {
  const value = await fixture();
  t.after(() => fs.rm(value.directory, { recursive: true, force: true }));
  const paid = new FakeRuntime('api');
  const router = new RuntimeRouter({ store: value.store, runtimes: { api: paid }, defaultRuntime: 'api' });
  await assert.rejects(
    router.turn({ conversationId: 'room-3', text: 'hello' }),
    error => error.code === 'explicit_paid_runtime_required',
  );
  assert.equal(paid.calls.length, 0);
});

test('the JSON store survives a process-style reload', async t => {
  const value = await fixture();
  t.after(() => fs.rm(value.directory, { recursive: true, force: true }));
  await value.store.appendMessage('room-4', 'user', 'persist me', 'application');
  const reloaded = new JsonConversationStore(path.join(value.directory, 'state.json'));
  assert.equal(reloaded.conversation('room-4').messages[0].content, 'persist me');
});
