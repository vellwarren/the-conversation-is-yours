import { event } from '../core/events.js';

function apiMessages(messages) {
  return messages.map(message => ({
    role: message.role,
    content: [{ type: 'text', text: message.content }],
  }));
}

async function* sseEvents(response) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');
    while (buffer.includes('\n\n')) {
      const boundary = buffer.indexOf('\n\n');
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame.split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())
        .join('\n');
      if (!data || data === '[DONE]') continue;
      try {
        yield JSON.parse(data);
      } catch {
        throw Object.assign(new Error('Messages API emitted invalid SSE JSON'), { code: 'api_protocol_error' });
      }
    }
  }
}

async function consumeMessageStream(response, onEvent) {
  const blocks = new Map();
  let text = '';
  let usage = {};
  let stopReason = null;

  for await (const message of sseEvents(response)) {
    if (message.type === 'message_start') usage = message.message?.usage || usage;
    if (message.type === 'content_block_start') {
      const block = structuredClone(message.content_block || {});
      if (block.type === 'tool_use') block.partial_json = '';
      blocks.set(message.index, block);
    }
    if (message.type === 'content_block_delta') {
      const block = blocks.get(message.index);
      if (!block) continue;
      if (message.delta?.type === 'text_delta') {
        text += message.delta.text;
        block.text = `${block.text || ''}${message.delta.text}`;
        onEvent(event('text', { text: message.delta.text }));
      } else if (message.delta?.type === 'thinking_delta') {
        block.thinking = `${block.thinking || ''}${message.delta.thinking}`;
        onEvent(event('thinking', { text: message.delta.thinking }));
      } else if (message.delta?.type === 'input_json_delta') {
        block.partial_json += message.delta.partial_json || '';
      }
    }
    if (message.type === 'content_block_stop') {
      const block = blocks.get(message.index);
      if (block?.type === 'tool_use') {
        try {
          block.input = block.partial_json ? JSON.parse(block.partial_json) : (block.input || {});
        } catch {
          throw Object.assign(new Error('Tool input was incomplete JSON'), { code: 'invalid_tool_input' });
        }
        delete block.partial_json;
        onEvent(event('tool_use', { id: block.id, name: block.name }));
      }
    }
    if (message.type === 'message_delta') {
      stopReason = message.delta?.stop_reason || stopReason;
      usage = { ...usage, ...(message.usage || {}) };
    }
    if (message.type === 'error') {
      throw Object.assign(new Error('Messages API returned a streaming error'), { code: 'api_stream_error' });
    }
  }

  return { content: [...blocks.entries()].sort(([a], [b]) => a - b).map(([, block]) => block), text, usage, stopReason };
}

export class MessagesApiRuntime {
  constructor(config = {}) {
    this.config = {
      baseUrl: String(config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, ''),
      apiKey: config.apiKey || '',
      model: config.model || '',
      version: config.version || '2023-06-01',
      maxTokens: Number(config.maxTokens || 1_024),
      maxToolLoops: Number(config.maxToolLoops || 3),
      system: config.system || 'You are a concise demo assistant. Use demo tools only when they are relevant.',
      fetch: config.fetch || globalThis.fetch,
    };
  }

  async #request(messages, tools, onEvent) {
    const response = await this.config.fetch(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': this.config.version,
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        stream: true,
        system: [{ type: 'text', text: this.config.system, cache_control: { type: 'ephemeral', ttl: '1h' } }],
        messages,
        tools,
      }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw Object.assign(new Error(`Messages API HTTP ${response.status}`), { code: 'api_http_error' });
    }
    return consumeMessageStream(response, onEvent);
  }

  async run({ conversation, store, onEvent }) {
    if (!this.config.apiKey || !this.config.model) {
      throw Object.assign(new Error('ANTHROPIC_API_KEY and ANTHROPIC_MODEL are required'), { code: 'api_not_configured' });
    }
    const registry = (await import('../tools/registry.js')).DemoToolRegistry;
    const tools = new registry(store);
    const definitions = tools.definitions({ cacheLast: true });
    const messages = apiMessages(conversation.messages);
    let visibleText = '';
    let totalUsage = {};

    for (let loop = 0; loop <= this.config.maxToolLoops; loop += 1) {
      const result = await this.#request(messages, definitions, onEvent);
      totalUsage = { ...totalUsage, ...result.usage };
      visibleText += result.text;
      const calls = result.content.filter(block => block.type === 'tool_use');
      if (!calls.length) {
        onEvent(event('usage', { usage: totalUsage }));
        return { text: visibleText, usage: totalUsage };
      }
      if (loop === this.config.maxToolLoops) {
        throw Object.assign(new Error('Tool loop limit reached'), { code: 'tool_loop_limit' });
      }

      messages.push({ role: 'assistant', content: result.content });
      const results = [];
      for (const call of calls) {
        try {
          const output = await tools.call(call.name, call.input);
          onEvent(event('tool_result', { id: call.id, name: call.name, ok: true }));
          results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(output) });
        } catch (error) {
          onEvent(event('tool_result', { id: call.id, name: call.name, ok: false }));
          results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: 'Tool call failed' });
        }
      }
      messages.push({ role: 'user', content: results });
    }
    throw new Error('unreachable');
  }
}
