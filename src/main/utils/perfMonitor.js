// Performance monitor utility for main process
module.exports = function createPerfMonitor(logger) {
  const log = (...args) => {
    try {
      logger?.debug?.(...args);
    } catch {
      // ignore logging failures in perf paths
    }
  };

  return {
    mark: (name) => {
      if (process.env.NODE_ENV === 'development') {
        log('[PERF] ' + String(name));
      }
    },
    measure: (name, fn) => {
      if (typeof fn !== 'function') return fn;
      const start = Date.now();
      try {
        const result = fn();
        // Support sync or async results
        if (result && typeof result.then === 'function') {
          return result.then((res) => {
            const duration = Date.now() - start;
            if (duration > 100) log(`[PERF-SLOW] ${name}: ${duration}ms`);
            return res;
          });
        }
        const duration = Date.now() - start;
        if (duration > 100) log(`[PERF-SLOW] ${name}: ${duration}ms`);
        return result;
      } catch (err) {
        throw err;
      }
    },
  };
};
