function withErrorLogging(logger, fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      try {
        logger?.error?.('[IPC] Handler error:', error);
      } catch (logError) {
        // eslint-disable-next-line no-console
        console.error('Failed to log IPC error:', logError);
      }
      throw error;
    }
  };
}

module.exports = { withErrorLogging };
