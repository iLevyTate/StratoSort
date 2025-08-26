const {
  withErrorLogging,
  withValidation,
} = require('../src/main/ipc/withErrorLogging');

describe('withErrorLogging', () => {
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns a function that wraps the original function', () => {
    const originalFn = jest.fn().mockResolvedValue('success');
    const wrappedFn = withErrorLogging(mockLogger, originalFn);

    expect(typeof wrappedFn).toBe('function');
  });

  test('executes original function successfully', async () => {
    const originalFn = jest.fn().mockResolvedValue('success');
    const wrappedFn = withErrorLogging(mockLogger, originalFn);

    const result = await wrappedFn('arg1', 'arg2');

    expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
    expect(result).toBe('success');
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  test('logs and re-throws errors from original function', async () => {
    const testError = new Error('Test error');
    const originalFn = jest.fn().mockRejectedValue(testError);
    const wrappedFn = withErrorLogging(mockLogger, originalFn);

    await expect(wrappedFn()).rejects.toThrow('Test error');

    expect(mockLogger.error).toHaveBeenCalledWith(
      '[IPC] mockConstructor failed:',
      expect.objectContaining({
        error: 'Test error',
        type: 'ipc_call_error',
        actionId: expect.any(String),
        duration: expect.any(String),
        stack: expect.any(String),
      }),
    );
  });

  test('handles logger errors gracefully', async () => {
    const testError = new Error('Test error');
    const originalFn = jest.fn().mockRejectedValue(testError);
    const wrappedFn = withErrorLogging(mockLogger, originalFn);

    // Mock logger.error to throw
    mockLogger.error.mockImplementation(() => {
      throw new Error('Logger error');
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    await expect(wrappedFn()).rejects.toThrow('Test error');

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to log IPC error:',
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  test('handles null logger gracefully', async () => {
    const testError = new Error('Test error');
    const originalFn = jest.fn().mockRejectedValue(testError);
    const wrappedFn = withErrorLogging(null, originalFn);

    await expect(wrappedFn()).rejects.toThrow('Test error');
  });

  test('handles undefined logger gracefully', async () => {
    const testError = new Error('Test error');
    const originalFn = jest.fn().mockRejectedValue(testError);
    const wrappedFn = withErrorLogging(undefined, originalFn);

    await expect(wrappedFn()).rejects.toThrow('Test error');
  });

  test('preserves function context and this binding', async () => {
    const context = { value: 'test' };
    const originalFn = jest.fn().mockResolvedValue('success');
    const wrappedFn = withErrorLogging(mockLogger, originalFn);

    await wrappedFn.call(context, 'arg');

    expect(originalFn).toHaveBeenCalledWith('arg');
  });
});

describe('withValidation', () => {
  let mockLogger;
  let mockSchema;
  let mockHandler;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
    };

    mockSchema = {
      safeParse: jest.fn(),
    };

    mockHandler = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns a function wrapped with both validation and error logging', () => {
    const wrappedFn = withValidation(mockLogger, mockSchema, mockHandler);

    expect(typeof wrappedFn).toBe('function');
  });

  test('validates single argument payload successfully', async () => {
    const validData = { name: 'test' };
    mockSchema.safeParse.mockReturnValue({ success: true, data: validData });
    mockHandler.mockResolvedValue('success');

    const wrappedFn = withValidation(mockLogger, mockSchema, mockHandler);
    const result = await wrappedFn('event', 'payload');

    expect(mockSchema.safeParse).toHaveBeenCalledWith('payload');
    expect(mockHandler).toHaveBeenCalledWith('event', validData);
    expect(result).toBe('success');
  });

  test('validates multiple arguments payload successfully', async () => {
    const validData = ['arg1', 'arg2'];
    mockSchema.safeParse.mockReturnValue({ success: true, data: validData });
    mockHandler.mockResolvedValue('success');

    const wrappedFn = withValidation(mockLogger, mockSchema, mockHandler);
    const result = await wrappedFn('event', 'arg1', 'arg2');

    expect(mockSchema.safeParse).toHaveBeenCalledWith(['arg1', 'arg2']);
    expect(mockHandler).toHaveBeenCalledWith('event', 'arg1', 'arg2');
    expect(result).toBe('success');
  });

  test('returns validation error for invalid payload', async () => {
    const validationError = { fieldErrors: { name: ['Required'] } };
    mockSchema.safeParse.mockReturnValue({
      success: false,
      error: {
        flatten: () => validationError,
      },
    });

    const wrappedFn = withValidation(mockLogger, mockSchema, mockHandler);
    const result = await wrappedFn('event', 'invalid payload');

    expect(mockHandler).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      error: 'Invalid input',
      details: validationError,
    });
  });

  test('handles schema without flatten method', async () => {
    const errorMessage = 'Validation failed';
    mockSchema.safeParse.mockReturnValue({
      success: false,
      error: errorMessage,
    });

    const wrappedFn = withValidation(mockLogger, mockSchema, mockHandler);
    const result = await wrappedFn('event', 'invalid payload');

    expect(result).toEqual({
      success: false,
      error: 'Invalid input',
      details: errorMessage,
    });
  });

  test('handles validation wrapper errors', async () => {
    const validationError = new Error('Validation wrapper error');
    mockSchema.safeParse.mockImplementation(() => {
      throw validationError;
    });

    const wrappedFn = withValidation(mockLogger, mockSchema, mockHandler);

    await expect(wrappedFn('event', 'payload')).rejects.toThrow(
      'Validation wrapper error',
    );

    // Expect both the simple error call and the enhanced error call
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[IPC] Validation wrapper failed:',
      validationError,
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      '[IPC] anonymous_handler failed:',
      expect.objectContaining({
        error: 'Validation wrapper error',
        type: 'ipc_call_error',
        actionId: expect.any(String),
        duration: expect.any(String),
        stack: expect.any(String),
      }),
    );
  });

  test('passes through errors from handler', async () => {
    const handlerError = new Error('Handler error');
    mockSchema.safeParse.mockReturnValue({ success: true, data: 'valid' });
    mockHandler.mockRejectedValue(handlerError);

    const wrappedFn = withValidation(mockLogger, mockSchema, mockHandler);

    await expect(wrappedFn('event', 'payload')).rejects.toThrow(
      'Handler error',
    );
  });

  test('handles null schema', () => {
    expect(() => {
      withValidation(mockLogger, null, mockHandler);
    }).not.toThrow();
  });

  test('handles null handler', async () => {
    const validData = { name: 'test' };
    mockSchema.safeParse.mockReturnValue({ success: true, data: validData });

    const wrappedFn = withValidation(mockLogger, mockSchema, null);

    await expect(wrappedFn('event', 'payload')).rejects.toThrow();
  });
});
