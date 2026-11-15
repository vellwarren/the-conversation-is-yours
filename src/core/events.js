export const EVENT_KINDS = Object.freeze([
  'runtime_start',
  'text',
  'thinking',
  'tool_use',
  'tool_result',
  'usage',
  'done',
  'error',
]);

export function event(kind, data = {}) {
  if (!EVENT_KINDS.includes(kind)) throw new Error(`Unknown canonical event: ${kind}`);
  return { kind, data, at: new Date().toISOString() };
}

export function publicError(error) {
  const code = typeof error?.code === 'string' ? error.code : 'runtime_error';
  return event('error', { code, message: 'The selected runtime could not complete this turn.' });
}
