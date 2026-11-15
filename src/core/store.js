import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

function emptyState() {
  return { version: 1, conversations: {}, runtimeSessions: {}, notes: [] };
}

function cleanId(value, label) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error(`${label} must be 1-80 safe characters`);
  return id;
}

export class JsonConversationStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.state = this.#load();
    this.writeChain = Promise.resolve();
  }

  #load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (parsed?.version === 1 && parsed.conversations && parsed.runtimeSessions && Array.isArray(parsed.notes)) {
        return parsed;
      }
    } catch {
      // A missing demo store starts empty. Corrupt data is never guessed.
    }
    return emptyState();
  }

  conversation(conversationId) {
    const id = cleanId(conversationId, 'conversationId');
    const value = this.state.conversations[id];
    return value ? structuredClone(value) : { id, lastRuntime: null, messages: [] };
  }

  async appendMessage(conversationId, role, content, runtime) {
    const id = cleanId(conversationId, 'conversationId');
    if (!['user', 'assistant'].includes(role)) throw new Error('role must be user or assistant');
    const text = String(content || '').trim();
    if (!text) throw new Error('message content must not be empty');
    const conversation = this.state.conversations[id] || { id, lastRuntime: null, messages: [] };
    conversation.messages.push({ id: crypto.randomUUID(), role, content: text, runtime, at: new Date().toISOString() });
    if (role === 'assistant') conversation.lastRuntime = runtime;
    this.state.conversations[id] = conversation;
    await this.persist();
    return structuredClone(conversation.messages.at(-1));
  }

  runtimeSession(conversationId, runtime) {
    const key = `${cleanId(conversationId, 'conversationId')}:${cleanId(runtime, 'runtime')}`;
    return this.state.runtimeSessions[key] ? structuredClone(this.state.runtimeSessions[key]) : null;
  }

  async setRuntimeSession(conversationId, runtime, value) {
    const key = `${cleanId(conversationId, 'conversationId')}:${cleanId(runtime, 'runtime')}`;
    if (value === null) delete this.state.runtimeSessions[key];
    else this.state.runtimeSessions[key] = { ...structuredClone(value), updatedAt: new Date().toISOString() };
    await this.persist();
  }

  listNotes() {
    return structuredClone(this.state.notes);
  }

  async saveNote(text) {
    const value = String(text || '').trim();
    if (!value || value.length > 500) throw new Error('note must contain 1-500 characters');
    const note = { id: crypto.randomUUID(), text: value, at: new Date().toISOString() };
    this.state.notes.push(note);
    await this.persist();
    return structuredClone(note);
  }

  async persist() {
    const snapshot = `${JSON.stringify(this.state, null, 2)}\n`;
    this.writeChain = this.writeChain.catch(() => {}).then(async () => {
      await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.tmp`;
      await fsp.writeFile(temporary, snapshot, { mode: 0o600 });
      await fsp.rename(temporary, this.filePath);
    });
    return this.writeChain;
  }
}
