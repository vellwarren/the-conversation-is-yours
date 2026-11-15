const definitions = Object.freeze([
  {
    name: 'save_note',
    description: 'Save one short demo note in the application-owned store.',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string', minLength: 1, maxLength: 500 } },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_notes',
    description: 'Search demo notes by a case-insensitive substring.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', maxLength: 100 } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_current_time',
    description: 'Return the current UTC timestamp.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
]);

export class DemoToolRegistry {
  constructor(store) {
    this.store = store;
  }

  definitions({ cacheLast = false } = {}) {
    return definitions.map((definition, index) => ({
      ...structuredClone(definition),
      ...(cacheLast && index === definitions.length - 1
        ? { cache_control: { type: 'ephemeral', ttl: '1h' } }
        : {}),
    }));
  }

  async call(name, input = {}) {
    if (name === 'save_note') {
      const note = await this.store.saveNote(input.text);
      return { saved: true, note };
    }
    if (name === 'search_notes') {
      const query = String(input.query || '').toLowerCase();
      const notes = this.store.listNotes().filter(note => note.text.toLowerCase().includes(query));
      return { notes };
    }
    if (name === 'get_current_time') return { now: new Date().toISOString() };
    throw Object.assign(new Error(`Unknown tool: ${name}`), { code: 'unknown_tool' });
  }
}
