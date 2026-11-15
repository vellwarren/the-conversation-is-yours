import assert from 'node:assert/strict';
import test from 'node:test';
import { ClaudeStreamParser } from '../src/runtimes/claude-stream.js';

test('Claude stream parser normalizes partial text, thinking and usage', () => {
  const parser = new ClaudeStreamParser();
  assert.deepEqual(parser.parseLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sid-1' })), []);
  const thinking = parser.parseLine(JSON.stringify({
    type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm' } },
  }));
  const text = parser.parseLine(JSON.stringify({
    type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } },
  }));
  const usage = parser.parseLine(JSON.stringify({
    type: 'result', subtype: 'success', session_id: 'sid-1', usage: { input_tokens: 12 },
  }));
  assert.equal(thinking[0].kind, 'thinking');
  assert.equal(text[0].data.text, 'hello');
  assert.equal(usage[0].kind, 'usage');
  assert.equal(parser.success, true);
  assert.equal(parser.text, 'hello');
});

test('Claude stream parser fails closed on malformed JSON', () => {
  const parser = new ClaudeStreamParser();
  assert.throws(() => parser.parseLine('{not-json'), error => error.code === 'claude_protocol_error');
});
