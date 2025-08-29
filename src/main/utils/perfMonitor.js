// Performance monitor utility for main process
module.exports = function createPerfMonitor(logger) {
  const log = (...args) => {
    try {
      logger?.debug?.(...args);
    } catch (error) {
      // Log to stderr as fallback
      if (process.stderr)
        process.stderr.write(`[PERF-LOG-ERROR] ${error.message}\n`);
    }
  };

  return {
    mark: (name) => {
      if (process.env.NODE_ENV === 'development') {
        log('[PERF] ' + String(name));
      }
    },
    measure: (name, fn) => {
      if (typeof fn !== 'function') {
        throw new Error(
          `perfMonitor.measure called with non-function: ${name}`,
        );
      }
      const start = Date.now();
      try {
        const result = fn();
        // Support sync or async results
        if (result && typeof result.then === 'function') {
          return result
            .then((res) => {
              const duration = Date.now() - start;
              if (duration > 100) log(`[PERF-SLOW] ${name}: ${duration}ms`);
              return res;
            })
            .catch((err) => {
              log(`[PERF-ERROR] ${name}: ${err}`);
              throw err; // rethrow after logging
            });
        }
        // Synchronous result
        const duration = Date.now() - start;
        if (duration > 100) log(`[PERF-SLOW] ${name}: ${duration}ms`);
        return result;
      } catch (err) {
        log(`[PERF-ERROR] ${name}: ${err}`);
        throw err;
      }
    },
  };
};
