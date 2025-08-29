const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('../../shared/logger');

/**
 * Ollama Process Monitor and Health Management
 * Implements defensive coding practices for external Ollama service interactions
 */
class OllamaMonitor {
  constructor() {
    this.ollamaProcess = null;
    this.isMonitoring = false;
    this.healthChecks = [];
    this.maxHealthChecks = 50;
    this.healthCheckInterval = null;
    this.restartAttempts = 0;
    this.maxRestartAttempts = 3;
    this.lastHealthCheck = null;
    this.processStats = {
      startTime: null,
      restartCount: 0,
      totalUptime: 0,
      lastRestartReason: null,
    };
  }

  /**
   * Initialize Ollama monitoring system
   */
  async initialize() {
    if (this.isMonitoring) return;

    try {
      logger.info('[OLLAMA-MONITOR] Initializing Ollama process monitoring');

      // Check if Ollama is already running
      await this.checkExistingOllamaProcess();

      // Start health monitoring
      this.startHealthMonitoring();

      // Set up process event handlers
      this.setupProcessEventHandlers();

      this.isMonitoring = true;
      logger.info(
        '[OLLAMA-MONITOR] Ollama monitoring initialized successfully',
      );
    } catch (error) {
      logger.error(
        '[OLLAMA-MONITOR] Failed to initialize Ollama monitoring:',
        error,
      );
    }
  }

  /**
   * Check for existing Ollama process
   */
  async checkExistingOllamaProcess() {
    try {
      const isRunning = await this.isOllamaRunning();

      if (isRunning) {
        logger.info('[OLLAMA-MONITOR] Found existing Ollama process');

        // Get process information
        const processInfo = await this.getOllamaProcessInfo();
        if (processInfo) {
          this.ollamaProcess = { pid: processInfo.pid, info: processInfo };
          logger.info(
            '[OLLAMA-MONITOR] Attached to existing Ollama process:',
            processInfo,
          );
        }
      } else {
        logger.info('[OLLAMA-MONITOR] No existing Ollama process found');
      }

      return isRunning;
    } catch (error) {
      logger.error(
        '[OLLAMA-MONITOR] Failed to check existing Ollama process:',
        error,
      );
      return false;
    }
  }

  /**
   * Check if Ollama is currently running
   */
  async isOllamaRunning() {
    return new Promise((resolve) => {
      if (process.platform === 'win32') {
        exec('tasklist /FI "IMAGENAME eq ollama.exe" /NH', (error, stdout) => {
          if (error) {
            resolve(false);
          } else {
            resolve(stdout.includes('ollama.exe'));
          }
        });
      } else {
        exec('pgrep -f ollama', (error, stdout) => {
          resolve(!error && stdout.trim().length > 0);
        });
      }
    });
  }

  /**
   * Get Ollama process information
   */
  async getOllamaProcessInfo() {
    try {
      return new Promise((resolve) => {
        if (process.platform === 'win32') {
          exec(
            'tasklist /FI "IMAGENAME eq ollama.exe" /V /FO CSV /NH',
            (error, stdout) => {
              if (error) {
                resolve(null);
              } else {
                const lines = stdout.split('\n').filter((line) => line.trim());
                if (lines.length > 0) {
                  const parts = lines[0].split('","');
                  if (parts.length >= 2) {
                    const pid = parts[1].replace(/"/g, '');
                    resolve({
                      pid: parseInt(pid),
                      name: 'ollama.exe',
                      platform: 'win32',
                    });
                  }
                }
                resolve(null);
              }
            },
          );
        } else {
          exec('pgrep -f ollama', (error, stdout) => {
            if (error) {
              resolve(null);
            } else {
              const pids = stdout
                .trim()
                .split('\n')
                .map((pid) => parseInt(pid.trim()));
              if (pids.length > 0) {
                resolve({
                  pid: pids[0],
                  name: 'ollama',
                  platform: process.platform,
                });
              } else {
                resolve(null);
              }
            }
          });
        }
      });
    } catch (error) {
      logger.error(
        '[OLLAMA-MONITOR] Failed to get Ollama process info:',
        error,
      );
      return null;
    }
  }

  /**
   * Start Ollama health monitoring
   */
  startHealthMonitoring() {
    logger.info('[OLLAMA-MONITOR] Starting health monitoring');

    // Initial health check
    this.performHealthCheck();

    // Set up periodic health checks
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('[OLLAMA-MONITOR] Health check failed:', error);
      }
    }, 30000); // Check every 30 seconds

    // Set up resource monitoring
    this.startResourceMonitoring();
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    try {
      const healthCheck = {
        timestamp: new Date().toISOString(),
        checks: {},
        overall: 'unknown',
      };

      // Check 1: Process existence
      healthCheck.checks.processExists = await this.checkProcessExists();

      // Check 2: API responsiveness
      healthCheck.checks.apiResponsive = await this.checkAPIResponsiveness();

      // Check 3: Memory usage
      healthCheck.checks.memoryUsage = await this.checkMemoryUsage();

      // Check 4: CPU usage
      healthCheck.checks.cpuUsage = await this.checkCPUUsage();

      // Determine overall health
      healthCheck.overall = this.determineOverallHealth(healthCheck.checks);

      // Store health check
      this.healthChecks.push(healthCheck);
      this.lastHealthCheck = healthCheck;

      // Maintain history limit
      if (this.healthChecks.length > this.maxHealthChecks) {
        this.healthChecks = this.healthChecks.slice(-this.maxHealthChecks);
      }

      // Handle health issues
      await this.handleHealthIssues(healthCheck);

      logger.debug(
        '[OLLAMA-MONITOR] Health check completed:',
        healthCheck.overall,
      );
    } catch (error) {
      logger.error('[OLLAMA-MONITOR] Health check error:', error);
    }
  }

  /**
   * Check if Ollama process exists
   */
  async checkProcessExists() {
    try {
      const isRunning = await this.isOllamaRunning();

      if (!isRunning && this.ollamaProcess) {
        logger.warn('[OLLAMA-MONITOR] Ollama process disappeared unexpectedly');
        this.ollamaProcess = null;
      } else if (isRunning && !this.ollamaProcess) {
        logger.info('[OLLAMA-MONITOR] Ollama process detected');
        const processInfo = await this.getOllamaProcessInfo();
        if (processInfo) {
          this.ollamaProcess = { pid: processInfo.pid, info: processInfo };
        }
      }

      return {
        status: isRunning ? 'running' : 'stopped',
        exists: isRunning,
        pid: this.ollamaProcess?.pid || null,
      };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Check Ollama API responsiveness
   */
  async checkAPIResponsiveness() {
    try {
      const { getOllamaHost } = require('../ollamaUtils');
      const host = await getOllamaHost();

      if (!host) {
        return { status: 'no_host', responsive: false };
      }

      // Try to connect to Ollama API
      const http = require('http');
      const url = require('url');

      return new Promise((resolve) => {
        const parsedUrl = url.parse(`${host}/api/tags`);
        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.path,
          method: 'GET',
          timeout: 5000, // 5 second timeout
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const response = JSON.parse(data);
              resolve({
                status: 'responsive',
                responsive: true,
                responseTime: Date.now(),
                hasModels: response.models && response.models.length > 0,
              });
            } catch (e) {
              resolve({
                status: 'invalid_response',
                responsive: false,
                error: 'Invalid JSON response',
              });
            }
          });
        });

        req.on('error', (error) => {
          resolve({
            status: 'connection_error',
            responsive: false,
            error: error.message,
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({
            status: 'timeout',
            responsive: false,
            error: 'Connection timeout',
          });
        });

        req.end();
      });
    } catch (error) {
      return { status: 'error', responsive: false, error: error.message };
    }
  }

  /**
   * Check Ollama memory usage
   */
  async checkMemoryUsage() {
    try {
      if (!this.ollamaProcess?.pid) {
        return { status: 'no_process', memoryMB: 0 };
      }

      return new Promise((resolve) => {
        if (process.platform === 'win32') {
          exec(
            `tasklist /FI "PID eq ${this.ollamaProcess.pid}" /FO CSV /NH`,
            (error, stdout) => {
              if (error) {
                resolve({ status: 'error', error: error.message });
              } else {
                const lines = stdout.split('\n').filter((line) => line.trim());
                if (lines.length > 0) {
                  const parts = lines[0].split('","');
                  if (parts.length >= 5) {
                    const memoryKB = parseInt(
                      parts[4].replace(/"/g, '').replace(/,/g, ''),
                    );
                    const memoryMB = Math.round(memoryKB / 1024);
                    resolve({
                      status: 'ok',
                      memoryMB,
                      memoryGB: (memoryMB / 1024).toFixed(2),
                    });
                  } else {
                    resolve({ status: 'parse_error' });
                  }
                } else {
                  resolve({ status: 'no_data' });
                }
              }
            },
          );
        } else {
          exec(`ps -p ${this.ollamaProcess.pid} -o rss=`, (error, stdout) => {
            if (error) {
              resolve({ status: 'error', error: error.message });
            } else {
              const memoryKB = parseInt(stdout.trim());
              if (isNaN(memoryKB)) {
                resolve({ status: 'parse_error' });
              } else {
                const memoryMB = Math.round(memoryKB / 1024);
                resolve({
                  status: 'ok',
                  memoryMB,
                  memoryGB: (memoryMB / 1024).toFixed(2),
                });
              }
            }
          });
        }
      });
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Check Ollama CPU usage
   */
  async checkCPUUsage() {
    try {
      if (!this.ollamaProcess?.pid) {
        return { status: 'no_process', cpuPercent: 0 };
      }

      return new Promise((resolve) => {
        if (process.platform === 'win32') {
          // Windows CPU monitoring is complex, return basic info
          exec(
            `tasklist /FI "PID eq ${this.ollamaProcess.pid}" /FO CSV /NH`,
            (error, stdout) => {
              if (error) {
                resolve({ status: 'error', error: error.message });
              } else {
                resolve({ status: 'ok', cpuPercent: 'N/A (Windows)' });
              }
            },
          );
        } else {
          exec(`ps -p ${this.ollamaProcess.pid} -o pcpu=`, (error, stdout) => {
            if (error) {
              resolve({ status: 'error', error: error.message });
            } else {
              const cpuPercent = parseFloat(stdout.trim());
              if (isNaN(cpuPercent)) {
                resolve({ status: 'parse_error' });
              } else {
                resolve({
                  status: 'ok',
                  cpuPercent: Math.round(cpuPercent * 100) / 100,
                });
              }
            }
          });
        }
      });
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Determine overall health status
   */
  determineOverallHealth(checks) {
    const issues = [];

    // Check process existence
    if (!checks.processExists?.exists) {
      issues.push('process_missing');
    }

    // Check API responsiveness
    if (!checks.apiResponsive?.responsive) {
      issues.push('api_unresponsive');
    }

    // Check memory usage
    if (checks.memoryUsage?.memoryMB > 4096) {
      // 4GB threshold
      issues.push('high_memory');
    }

    // Check CPU usage
    if (checks.cpuUsage?.cpuPercent > 90) {
      issues.push('high_cpu');
    }

    // Determine overall status
    if (issues.length === 0) {
      return 'healthy';
    } else if (
      issues.includes('process_missing') ||
      issues.includes('api_unresponsive')
    ) {
      return 'critical';
    } else {
      return 'warning';
    }
  }

  /**
   * Handle health issues
   */
  async handleHealthIssues(healthCheck) {
    try {
      const issues = [];
      const checks = healthCheck.checks;

      // Identify specific issues
      if (!checks.processExists?.exists) {
        issues.push('process_missing');
      }

      if (!checks.apiResponsive?.responsive) {
        issues.push('api_unresponsive');
      }

      if (checks.memoryUsage?.memoryMB > 8192) {
        // 8GB critical threshold
        issues.push('critical_memory');
      }

      if (issues.length === 0) return;

      // Handle critical issues
      if (issues.includes('process_missing')) {
        logger.error(
          '[OLLAMA-MONITOR] Ollama process missing, attempting restart',
        );
        await this.restartOllama('process_missing');
      } else if (issues.includes('api_unresponsive')) {
        logger.warn('[OLLAMA-MONITOR] Ollama API unresponsive');
        // Could implement API restart logic here
      }

      // Log issues for monitoring
      logger.warn('[OLLAMA-MONITOR] Health issues detected:', issues);
    } catch (error) {
      logger.error('[OLLAMA-MONITOR] Failed to handle health issues:', error);
    }
  }

  /**
   * Start Ollama process
   */
  async startOllama(options = {}) {
    try {
      logger.info('[OLLAMA-MONITOR] Starting Ollama process');

      const startTime = Date.now();
      this.processStats.startTime = startTime;

      // Determine Ollama executable path
      const ollamaPath = await this.findOllamaExecutable();

      if (!ollamaPath) {
        throw new Error('Ollama executable not found');
      }

      // Prepare spawn options
      const spawnOptions = {
        stdio: options.detached ? 'ignore' : ['pipe', 'pipe', 'pipe'],
        detached: options.detached || false,
        env: { ...process.env, ...options.env },
      };

      // Start Ollama process
      this.ollamaProcess = spawn(ollamaPath, ['serve'], spawnOptions);

      // Set up event handlers
      this.setupProcessHandlers();

      // Wait for process to be ready
      await this.waitForOllamaReady();

      this.processStats.restartCount++;
      logger.info(
        `[OLLAMA-MONITOR] Ollama started successfully (PID: ${this.ollamaProcess.pid})`,
      );

      return { success: true, pid: this.ollamaProcess.pid };
    } catch (error) {
      logger.error('[OLLAMA-MONITOR] Failed to start Ollama:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Restart Ollama process
   */
  async restartOllama(reason = 'manual') {
    try {
      if (this.restartAttempts >= this.maxRestartAttempts) {
        logger.error(
          '[OLLAMA-MONITOR] Max restart attempts reached, not restarting',
        );
        return { success: false, error: 'Max restart attempts reached' };
      }

      logger.info(`[OLLAMA-MONITOR] Restarting Ollama (reason: ${reason})`);

      // Stop existing process
      await this.stopOllama();

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Start new process
      this.restartAttempts++;
      this.processStats.lastRestartReason = reason;

      const result = await this.startOllama();

      if (result.success) {
        this.restartAttempts = 0; // Reset on successful restart
        logger.info('[OLLAMA-MONITOR] Ollama restarted successfully');
      }

      return result;
    } catch (error) {
      logger.error('[OLLAMA-MONITOR] Failed to restart Ollama:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop Ollama process
   */
  async stopOllama() {
    try {
      if (!this.ollamaProcess) {
        logger.debug('[OLLAMA-MONITOR] No Ollama process to stop');
        return { success: true };
      }

      logger.info(
        `[OLLAMA-MONITOR] Stopping Ollama process (PID: ${this.ollamaProcess.pid})`,
      );

      if (process.platform === 'win32') {
        exec(`taskkill /PID ${this.ollamaProcess.pid} /T /F`, (error) => {
          if (error) {
            logger.error(
              '[OLLAMA-MONITOR] Failed to kill Ollama process:',
              error,
            );
          }
        });
      } else {
        this.ollamaProcess.kill('SIGTERM');

        // Force kill after timeout
        setTimeout(() => {
          if (this.ollamaProcess && !this.ollamaProcess.killed) {
            this.ollamaProcess.kill('SIGKILL');
          }
        }, 5000);
      }

      this.ollamaProcess = null;
      return { success: true };
    } catch (error) {
      logger.error('[OLLAMA-MONITOR] Failed to stop Ollama:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Find Ollama executable path
   */
  async findOllamaExecutable() {
    try {
      // Check common installation paths
      const commonPaths = [];

      if (process.platform === 'win32') {
        commonPaths.push(
          'C:\\Program Files\\Ollama\\ollama.exe',
          'C:\\Program Files (x86)\\Ollama\\ollama.exe',
          path.join(
            process.env.USERPROFILE,
            'AppData',
            'Local',
            'Programs',
            'Ollama',
            'ollama.exe',
          ),
        );
      } else if (process.platform === 'darwin') {
        commonPaths.push(
          '/usr/local/bin/ollama',
          '/opt/homebrew/bin/ollama',
          path.join(process.env.HOME, '.ollama', 'bin', 'ollama'),
        );
      } else {
        commonPaths.push(
          '/usr/local/bin/ollama',
          '/usr/bin/ollama',
          path.join(process.env.HOME, '.ollama', 'bin', 'ollama'),
        );
      }

      // Check if executable exists
      for (const execPath of commonPaths) {
        try {
          await fs.access(execPath, fs.constants.F_OK);
          return execPath;
        } catch (e) {
          // Continue to next path
        }
      }

      // Try to find in PATH
      return new Promise((resolve) => {
        exec('which ollama', (error, stdout) => {
          if (error) {
            resolve(null);
          } else {
            resolve(stdout.trim());
          }
        });
      });
    } catch (error) {
      logger.error('[OLLAMA-MONITOR] Failed to find Ollama executable:', error);
      return null;
    }
  }

  /**
   * Wait for Ollama to be ready
   */
  async waitForOllamaReady(timeout = 30000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const apiCheck = await this.checkAPIResponsiveness();
        if (apiCheck.responsive) {
          return true;
        }
      } catch (e) {
        // Continue waiting
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error('Ollama failed to become ready within timeout');
  }

  /**
   * Set up process event handlers
   */
  setupProcessEventHandlers() {
    if (this.ollamaProcess) {
      this.setupProcessHandlers();
    }
  }

  /**
   * Set up handlers for spawned process
   */
  setupProcessHandlers() {
    if (!this.ollamaProcess) return;

    this.ollamaProcess.on('exit', (code, signal) => {
      logger.warn(
        `[OLLAMA-MONITOR] Ollama process exited (code: ${code}, signal: ${signal})`,
      );
      this.ollamaProcess = null;

      // Attempt restart for unexpected exits
      if (code !== 0 && code !== null) {
        setTimeout(async () => {
          await this.restartOllama(`exit_code_${code}`);
        }, 5000);
      }
    });

    this.ollamaProcess.on('error', (error) => {
      logger.error('[OLLAMA-MONITOR] Ollama process error:', error);
      this.ollamaProcess = null;
    });

    // Log stdout/stderr for debugging
    if (this.ollamaProcess.stdout) {
      this.ollamaProcess.stdout.on('data', (data) => {
        logger.debug('[OLLAMA-MONITOR] Ollama stdout:', data.toString().trim());
      });
    }

    if (this.ollamaProcess.stderr) {
      this.ollamaProcess.stderr.on('data', (data) => {
        logger.debug('[OLLAMA-MONITOR] Ollama stderr:', data.toString().trim());
      });
    }
  }

  /**
   * Start resource monitoring
   */
  startResourceMonitoring() {
    setInterval(async () => {
      try {
        const memory = await this.checkMemoryUsage();
        const cpu = await this.checkCPUUsage();

        // Alert on resource issues
        if (memory.memoryMB > 6144) {
          // 6GB
          logger.warn(
            `[OLLAMA-MONITOR] High Ollama memory usage: ${memory.memoryMB}MB`,
          );
        }

        if (cpu.cpuPercent > 80) {
          logger.warn(
            `[OLLAMA-MONITOR] High Ollama CPU usage: ${cpu.cpuPercent}%`,
          );
        }
      } catch (error) {
        logger.debug(
          '[OLLAMA-MONITOR] Resource monitoring failed:',
          error.message,
        );
      }
    }, 60000); // Check every minute
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      ollamaRunning: this.ollamaProcess !== null,
      processInfo: this.ollamaProcess
        ? {
            pid: this.ollamaProcess.pid,
            info: this.ollamaProcess.info,
          }
        : null,
      lastHealthCheck: this.lastHealthCheck,
      restartAttempts: this.restartAttempts,
      processStats: this.processStats,
      healthHistory: this.healthChecks.slice(-5), // Last 5 checks
    };
  }

  /**
   * Get health report
   */
  async getHealthReport() {
    try {
      const currentHealth = this.lastHealthCheck;
      const history = this.healthChecks.slice(-10); // Last 10 checks

      // Analyze trends
      const trends = this.analyzeHealthTrends(history);

      return {
        timestamp: new Date().toISOString(),
        currentHealth,
        trends,
        recommendations: this.generateRecommendations(currentHealth, trends),
        processStats: this.processStats,
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Analyze health trends
   */
  analyzeHealthTrends(history) {
    if (history.length < 2) return { insufficient_data: true };

    const trends = {
      stability: 'stable',
      memoryTrend: 'stable',
      responsivenessTrend: 'stable',
      issues: [],
    };

    // Analyze memory trend
    const memoryValues = history
      .map((h) => h.checks.memoryUsage?.memoryMB)
      .filter((v) => v);
    if (memoryValues.length >= 3) {
      const recent = memoryValues.slice(-3);
      const increasing = recent.every(
        (val, i) => i === 0 || val >= recent[i - 1],
      );

      if (increasing && recent[recent.length - 1] > recent[0] * 1.2) {
        trends.memoryTrend = 'increasing';
        trends.issues.push('Memory usage increasing over time');
      }
    }

    // Analyze responsiveness
    const responsiveChecks = history.map(
      (h) => h.checks.apiResponsive?.responsive,
    );
    const recentResponsive = responsiveChecks.slice(-5);
    const failureRate =
      recentResponsive.filter((r) => !r).length / recentResponsive.length;

    if (failureRate > 0.5) {
      trends.responsivenessTrend = 'degrading';
      trends.issues.push('API responsiveness degrading');
    }

    return trends;
  }

  /**
   * Generate recommendations based on health data
   */
  generateRecommendations(healthCheck, trends) {
    const recommendations = [];

    if (!healthCheck) {
      recommendations.push('Run health check to get recommendations');
      return recommendations;
    }

    const checks = healthCheck.checks;

    // Process recommendations
    if (!checks.processExists?.exists) {
      recommendations.push({
        priority: 'critical',
        issue: 'Ollama process not running',
        action: 'Start Ollama service',
      });
    }

    // API recommendations
    if (!checks.apiResponsive?.responsive) {
      recommendations.push({
        priority: 'high',
        issue: 'Ollama API unresponsive',
        action: 'Check Ollama service status and logs',
      });
    }

    // Memory recommendations
    if (checks.memoryUsage?.memoryMB > 4096) {
      recommendations.push({
        priority: 'medium',
        issue: 'High memory usage',
        action:
          'Monitor memory usage, consider restarting if it continues to grow',
      });
    }

    // Trend-based recommendations
    if (trends.memoryTrend === 'increasing') {
      recommendations.push({
        priority: 'medium',
        issue: 'Memory usage trend increasing',
        action: 'Monitor closely, may need to restart Ollama periodically',
      });
    }

    return recommendations;
  }

  /**
   * Cleanup monitoring resources
   */
  cleanup() {
    try {
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      this.isMonitoring = false;
      logger.info('[OLLAMA-MONITOR] Monitoring cleanup completed');
    } catch (error) {
      logger.error('[OLLAMA-MONITOR] Failed to cleanup monitoring:', error);
    }
  }
}

// Export singleton instance
module.exports = new OllamaMonitor();
