import { event } from '../core/events.js';

export class ClaudeStreamParser {
  constructor() {
    this.sessionId = null;
    this.text = '';
    this.sawPartialText = false;
    this.success = false;
    this.usage = {};
  }

  parseLine(raw) {
    let value;
    try {
      value = JSON.parse(String(raw));
    } catch {
      throw Object.assign(new Error('Claude Code emitted invalid JSON'), { code: 'claude_protocol_error' });
    }

    if (value.type === 'system' && value.subtype === 'init') {
      if (typeof value.session_id === 'string') this.sessionId = value.session_id;
      return [];
    }

    if (value.type === 'stream_event') {
      const delta = value.event?.delta;
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        this.sawPartialText = true;
        this.text += delta.text;
        return [event('text', { text: delta.text })];
      }
      if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        return [event('thinking', { text: delta.thinking })];
      }
      return [];
    }

    if (value.type === 'assistant' && Array.isArray(value.message?.content)) {
      const events = [];
      for (const block of value.message.content) {
        if (block?.type === 'text' && !this.sawPartialText && typeof block.text === 'string') {
          this.text += block.text;
          events.push(event('text', { text: block.text }));
        } else if (block?.type === 'tool_use') {
          events.push(event('tool_use', { id: block.id || null, name: block.name || null }));
        }
      }
      return events;
    }

    if (value.type === 'user' && Array.isArray(value.message?.content)) {
      const ids = value.message.content
        .filter(block => block?.type === 'tool_result')
        .map(block => block.tool_use_id)
        .filter(Boolean);
      return ids.length ? [event('tool_result', { ids })] : [];
    }

    if (value.type === 'result') {
      if (typeof value.session_id === 'string') this.sessionId = value.session_id;
      this.usage = value.usage && typeof value.usage === 'object' ? value.usage : {};
      if (value.subtype === 'success' && value.is_error !== true) {
        this.success = true;
        return [event('usage', { usage: this.usage })];
      }
      throw Object.assign(new Error('Claude Code returned an error result'), { code: 'claude_result_error' });
    }

    return [];
  }
}
