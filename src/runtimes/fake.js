import { event } from '../core/events.js';

// Fake runtimes make the repository safe to run without credentials. Their
// deliberately plain responses expose whether the application passed the
// authoritative history across a runtime boundary.
export class FakeRuntime {
  constructor(name) {
    this.name = name;
    this.calls = [];
  }

  async run({ conversationId, conversation, switched, onEvent }) {
    this.calls.push({ conversationId, conversation: structuredClone(conversation), switched });
    const previousAssistant = conversation.messages
      .slice(0, -1)
      .findLast(message => message.role === 'assistant');
    const reply = previousAssistant
      ? `${this.name} received the shared history. Previous reply: ${previousAssistant.content}`
      : `${this.name} started the conversation from application-owned history.`;
    onEvent(event('text', { text: reply }));
    return { text: reply };
  }
}
