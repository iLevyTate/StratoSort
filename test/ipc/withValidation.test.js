const { withValidation } = require('../../src/main/ipc/withErrorLogging');

let z;
try {
  // Reuse zod if available to build a test schema
  // eslint-disable-next-line global-require
  z = require('zod');
} catch {
  z = null;
}

describe('withValidation IPC wrapper', () => {
  test('valid payload is validated and passed to handler', async () => {
    const logger = { error: () => {}, info: () => {} };
    const schema =
      z?.object({ name: z.string(), age: z.number().int().positive() }) ?? null;
    // If zod is not available, skip test gracefully
    if (!schema) {
      return;
    }
    const handler = jest.fn(async (_event, payload) => {
      return { ok: true, payload };
    });
    const wrapped = withValidation(logger, schema, handler);
    const event = { type: 'test' };
    const result = await wrapped(event, { name: 'Alice', age: 30 });
    expect(result).toEqual({ ok: true, payload: { name: 'Alice', age: 30 } });
    expect(handler).toHaveBeenCalled();
  });

  test('invalid payload returns validation error', async () => {
    const logger = { error: () => {}, info: () => {} };
    const schema =
      z?.object({ name: z.string(), age: z.number().int().positive() }) ?? null;
    if (!schema) {
      return;
    }
    const handler = jest.fn(async (_event, payload) => payload);
    const wrapped = withValidation(logger, schema, handler);
    const event = { type: 'test' };
    const invalid = { name: '', age: -1 };
    const result = await wrapped(event, invalid);
    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid input');
  });
});
