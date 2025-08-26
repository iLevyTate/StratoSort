function withErrorLogging(logger, fn, systemAnalytics) {
  return async (...args) => {
    const startTime = Date.now();
    const handlerName = fn.name || 'anonymous_handler';
    const actionId = `${handlerName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Track action start
    try {
      logger?.actionTrack?.(handlerName, {
        actionId,
        args: args.length > 1 ? JSON.stringify(args.slice(1, 3)) : undefined, // Limit args for privacy
        type: 'ipc_call_start',
      });
    } catch (logError) {
      // eslint-disable-next-line no-console
      console.error('Failed to log action start:', logError);
    }

    try {
      const result = await fn(...args);
      const duration = Date.now() - startTime;

      // Record metrics in system analytics
      try {
        systemAnalytics?.recordIpcCall?.(handlerName, duration, true, {
          actionId,
          argsCount: args.length - 1, // Exclude event object
        });
      } catch (metricsError) {
        // eslint-disable-next-line no-console
        console.error('Failed to record IPC metrics:', metricsError);
      }

      // Track successful action completion
      try {
        logger?.actionTrack?.(`${handlerName}_success`, {
          actionId,
          duration: `${duration}ms`,
          type: 'ipc_call_success',
        });

        // Log performance warning for slow operations
        if (duration > 1000) {
          logger?.warn?.(`[PERF] Slow IPC call: ${handlerName}`, {
            actionId,
            duration: `${duration}ms`,
            type: 'slow_ipc_call',
          });
        }
      } catch (logError) {
        // eslint-disable-next-line no-console
        console.error('Failed to log action success:', logError);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Record failed metrics in system analytics
      try {
        systemAnalytics?.recordIpcCall?.(handlerName, duration, false, {
          actionId,
          error: error.message,
          argsCount: args.length - 1,
        });
      } catch (metricsError) {
        // eslint-disable-next-line no-console
        console.error('Failed to record IPC error metrics:', metricsError);
      }

      try {
        logger?.error?.(`[IPC] ${handlerName} failed:`, {
          actionId,
          error: error.message,
          stack: error.stack,
          args: args.length > 1 ? JSON.stringify(args.slice(1)) : undefined,
          duration: `${duration}ms`,
          type: 'ipc_call_error',
        });

        logger?.actionTrack?.(`${handlerName}_error`, {
          actionId,
          duration: `${duration}ms`,
          error: error.message,
          type: 'ipc_call_error',
        });
      } catch (logError) {
        // eslint-disable-next-line no-console
        console.error('Failed to log IPC error:', logError);
      }

      throw error;
    }
  };
}

/**
 * Wrap an IPC handler with validation using a provided schema.
 * schema should have a safeParse method (e.g., zod). If validation fails, a structured error is returned.
 */
function withValidation(logger, schema, handler) {
  return withErrorLogging(logger, async (...args) => {
    try {
      // Electron ipcMain.handle args: (event, ...payloadArgs)
      const payload = args.slice(1);
      const parsed = schema.safeParse(
        payload.length <= 1 ? payload[0] : payload,
      );
      if (!parsed.success) {
        return {
          success: false,
          error: 'Invalid input',
          details: parsed.error.flatten
            ? parsed.error.flatten()
            : String(parsed.error),
        };
      }
      const normalized = parsed.data;
      // Reconstruct the args: keep event as first, then validated payload
      const nextArgs = [
        args[0],
        ...(Array.isArray(normalized) ? normalized : [normalized]),
      ];
      return await handler(...nextArgs);
    } catch (e) {
      logger?.error?.('[IPC] Validation wrapper failed:', e);
      throw e;
    }
  });
}

module.exports = { withErrorLogging, withValidation };
