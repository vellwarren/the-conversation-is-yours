import { event, publicError } from './events.js';

const PAID_RUNTIMES = new Set(['api']);

export class RuntimeRouter {
  constructor({ store, runtimes, defaultRuntime = 'fake-api' }) {
    this.store = store;
    this.runtimes = new Map(Object.entries(runtimes));
    this.defaultRuntime = defaultRuntime;
  }

  async turn({ conversationId, text, runtime: requestedRuntime, onEvent = () => {} }) {
    const runtimeName = requestedRuntime || this.defaultRuntime;
    const runtime = this.runtimes.get(runtimeName);
    if (!runtime) throw Object.assign(new Error(`Unknown runtime: ${runtimeName}`), { code: 'unknown_runtime' });

    // Paid API use must always be explicit. A default of "api" is rejected so
    // a deployment mistake cannot silently turn every request into paid usage.
    if (PAID_RUNTIMES.has(runtimeName) && requestedRuntime !== runtimeName) {
      throw Object.assign(new Error('Paid API runtime requires explicit selection'), { code: 'explicit_paid_runtime_required' });
    }

    const before = this.store.conversation(conversationId);
    await this.store.appendMessage(conversationId, 'user', text, 'application');
    const conversation = this.store.conversation(conversationId);
    const switched = Boolean(before.lastRuntime && before.lastRuntime !== runtimeName);
    onEvent(event('runtime_start', { runtime: runtimeName, switched }));

    try {
      const result = await runtime.run({
        conversationId,
        conversation,
        switched,
        store: this.store,
        onEvent,
      });
      const reply = String(result?.text || '').trim();
      if (!reply) throw Object.assign(new Error('Runtime returned no visible text'), { code: 'empty_reply' });
      await this.store.appendMessage(conversationId, 'assistant', reply, runtimeName);
      onEvent(event('done', { runtime: runtimeName }));
      return { runtime: runtimeName, switched, text: reply };
    } catch (error) {
      onEvent(publicError(error));
      throw error;
    }
  }
}
