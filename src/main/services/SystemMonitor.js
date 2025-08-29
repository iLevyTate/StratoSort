/**
 * Comprehensive System Monitor Service
 * Monitors system health, GPU status, Ollama connectivity, and performance
 */

const { logger } = require('../../shared/logger');
const { fileLogger } = require('../../shared/fileLogger');
const systemAnalytics = require('../core/systemAnalytics');
const os = require('os');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { TIMEOUTS } = require('../../shared/constants');

// Import tree-kill for proper process tree cleanup
let treeKill;
try {
  treeKill = require('tree-kill');
} catch (error) {
  logger.warn(
    '[SYSTEM-MONITOR] tree-kill not available, falling back to basic process killing',
  );
  treeKill = null;
}

class SystemMonitor {
  constructor() {
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.healthChecks = new Map();
    this.maxHealthChecks = 1000; // Prevent unbounded growth
    this.systemInfo = {};
    this.gpuInfo = {};
    this.ollamaHealth = {};
  }

  /**
   * Safely add health check with size limit
   * @param {string} key - Health check key
   * @param {object} check - Health check data
   */
  addHealthCheck(key, check) {
    if (this.healthChecks.size >= this.maxHealthChecks) {
      // Remove oldest entry (first inserted)
      const firstKey = this.healthChecks.keys().next().value;
      if (firstKey) {
        this.healthChecks.delete(firstKey);
      }
    }
    this.healthChecks.set(key, { ...check, timestamp: Date.now() });
  }

  /**
   * Execute a subprocess with timeout and proper cleanup
   * @param {string} command - Command to execute
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<string>} - Resolves with stdout or rejects with error
   */
  async executeSubprocessWithTimeout(command, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [], {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Set up timeout with proper process tree cleanup
      const timeout = setTimeout(() => {
        timedOut = true;

        // Use tree-kill if available, otherwise fallback to basic kill
        if (treeKill && child.pid) {
          logger.debug(
            `[SYSTEM-MONITOR] Killing process tree for PID ${child.pid}`,
          );
          treeKill(child.pid, 'SIGTERM', (err) => {
            if (err) {
              logger.warn(
                '[SYSTEM-MONITOR] Failed to kill process tree with SIGTERM, trying SIGKILL:',
                err.message,
              );
              // Fallback to SIGKILL if SIGTERM fails
              treeKill(child.pid, 'SIGKILL', (killErr) => {
                if (killErr) {
                  logger.error(
                    '[SYSTEM-MONITOR] Failed to kill process tree:',
                    killErr.message,
                  );
                }
              });
            } else {
              logger.debug(
                `[SYSTEM-MONITOR] Successfully killed process tree for PID ${child.pid}`,
              );
            }
          });
        } else {
          // Fallback to basic process killing
          logger.debug(
            `[SYSTEM-MONITOR] Using basic process kill for PID ${child.pid || 'unknown'}`,
          );
          child.kill('SIGTERM');

          // Force kill after grace period
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 1000);
        }
      }, timeoutMs);

      // Collect stdout
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      // Collect stderr
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle process completion
      child.on('close', (code, signal) => {
        clearTimeout(timeout);

        if (timedOut) {
          reject(new Error(`Command timed out after ${timeoutMs}ms`));
        } else if (code === 0) {
          resolve(stdout);
        } else {
          reject(
            new Error(`Command failed with code ${code}: ${stderr || stdout}`),
          );
        }
      });

      // Handle spawn errors
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async initialize() {
    logger.info(
      '[SYSTEM-MONITOR] Initializing comprehensive system monitoring...',
    );

    try {
      // Perform initial system assessment
      await this.performInitialSystemCheck();

      // Start periodic monitoring
      this.startPeriodicMonitoring();

      logger.info(
        '[SYSTEM-MONITOR] System monitoring initialized successfully',
      );
      await this.logSystemStartup();
    } catch (error) {
      logger.error(
        '[SYSTEM-MONITOR] Failed to initialize system monitoring:',
        error,
      );
      await fileLogger.logError('system_monitor_initialization', error, {
        context: 'system_monitor_init',
        severity: 'high',
      });
    }
  }

  async performInitialSystemCheck() {
    logger.info('[SYSTEM-MONITOR] Performing initial system assessment...');

    // Collect basic system information (fast, synchronous)
    this.systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      cpus: os.cpus().length,
      uptime: os.uptime(),
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      cwd: process.cwd(),
      userInfo: os.userInfo(),
    };

    // Perform heavy checks in parallel but with timeout to avoid blocking startup
    const heavyChecks = Promise.allSettled([
      this.checkGPUStatus(),
      this.checkDiskSpace(),
      // Defer network checks to avoid blocking startup
    ]);

    // Set a reasonable timeout for heavy checks (3 seconds)
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve('timeout'), 3000);
    });

    try {
      await Promise.race([heavyChecks, timeoutPromise]);
    } catch (error) {
      logger.debug(
        '[SYSTEM-MONITOR] Heavy checks timed out or failed:',
        error.message,
      );
    }

    // Perform network checks after a brief delay to not compete with UI startup
    setTimeout(async () => {
      try {
        await Promise.allSettled([
          this.checkOllamaHealth(),
          this.checkNetworkConnectivity(),
        ]);
      } catch (error) {
        logger.debug(
          '[SYSTEM-MONITOR] Deferred network checks failed:',
          error.message,
        );
      }
    }, 1000);

    // Log initial system state (don't await to avoid blocking)
    fileLogger
      .writeLog('performance', 'SYSTEM_STARTUP_CHECK', {
        systemInfo: this.systemInfo,
        gpuInfo: this.gpuInfo,
        ollamaHealth: this.ollamaHealth,
        timestamp: new Date().toISOString(),
      })
      .catch((error) => {
        logger.debug(
          '[SYSTEM-MONITOR] Failed to log initial system state:',
          error.message,
        );
      });

    logger.info('[SYSTEM-MONITOR] Initial system assessment completed', {
      gpuDetected: !!this.gpuInfo.available,
      ollamaHealthy: this.ollamaHealth.healthy,
      memoryUsage: (() => {
        const totalMB =
          this.systemInfo.totalMemory > 0
            ? Math.round(this.systemInfo.totalMemory / 1024 / 1024)
            : 0;
        const usedMB =
          this.systemInfo.totalMemory > 0
            ? Math.round(
                (this.systemInfo.totalMemory - this.systemInfo.freeMemory) /
                  1024 /
                  1024,
              )
            : 0;
        return `${usedMB}MB/${totalMB}MB`;
      })(),
    });
  }

  async checkGPUStatus() {
    this.gpuInfo = {
      available: false,
      vendor: null,
      driverVersion: null,
      memory: null,
      utilization: null,
      temperature: null,
      lastChecked: new Date().toISOString(),
    };

    try {
      // NVIDIA GPU Detection
      if (process.platform === 'win32') {
        try {
          const stdout = await this.executeSubprocessWithTimeout(
            'nvidia-smi --query-gpu=name,driver_version,memory.total,memory.free,temperature.gpu --format=csv,noheader,nounits',
            TIMEOUTS.GPU_DETECTION,
          );
          const lines = stdout.trim().split('\n');
          if (lines.length > 0 && lines[0] !== '') {
            const [name, driver, totalMem, freeMem, temp] = lines[0]
              .split(',')
              .map((s) => s.trim());
            this.gpuInfo = {
              available: true,
              vendor: 'NVIDIA',
              name: name,
              driverVersion: driver,
              memory: {
                total: parseInt(totalMem),
                free: parseInt(freeMem),
                used: parseInt(totalMem) - parseInt(freeMem),
              },
              temperature: parseInt(temp),
              lastChecked: new Date().toISOString(),
            };
          }
        } catch (nvidiaError) {
          logger.debug(
            '[SYSTEM-MONITOR] NVIDIA detection failed:',
            nvidiaError.message,
          );
          // NVIDIA not available, try AMD
          try {
            const stdout = await this.executeSubprocessWithTimeout(
              'rocminfo',
              TIMEOUTS.GPU_DETECTION,
            );
            if (stdout.includes('AMD')) {
              this.gpuInfo = {
                available: true,
                vendor: 'AMD',
                name: 'AMD Radeon',
                driverVersion: 'ROCm',
                lastChecked: new Date().toISOString(),
              };
            }
          } catch (amdError) {
            logger.debug(
              '[SYSTEM-MONITOR] AMD detection failed:',
              amdError.message,
            );
            // No GPU detected
          }
        }
      } else if (process.platform === 'linux') {
        // Enhanced Linux GPU detection with multiple fallback methods
        try {
          // Method 1: Check for NVIDIA GPU via nvidia-smi
          try {
            const stdout = await this.executeSubprocessWithTimeout(
              'nvidia-smi --query-gpu=name --format=csv,noheader,nounits',
              TIMEOUTS.GPU_DETECTION,
            );
            if (stdout.trim()) {
              this.gpuInfo = {
                available: true,
                vendor: 'NVIDIA',
                name: stdout.trim().split('\n')[0],
                driverVersion: 'NVIDIA',
                lastChecked: new Date().toISOString(),
              };
              logger.debug(
                '[SYSTEM-MONITOR] Linux GPU detected via nvidia-smi:',
                this.gpuInfo.name,
              );
            }
          } catch (nvidiaError) {
            logger.debug(
              '[SYSTEM-MONITOR] nvidia-smi not available or failed:',
              nvidiaError.message,
            );

            // Method 2: Check for AMD GPU via ROCm
            try {
              const { stdout } = await execAsync('rocminfo');
              if (stdout.includes('AMD') || stdout.includes('Radeon')) {
                this.gpuInfo = {
                  available: true,
                  vendor: 'AMD',
                  name: 'AMD Radeon (ROCm)',
                  driverVersion: 'ROCm',
                  lastChecked: new Date().toISOString(),
                };
                logger.debug(
                  '[SYSTEM-MONITOR] Linux GPU detected via ROCm:',
                  this.gpuInfo.name,
                );
              }
            } catch (amdError) {
              logger.debug(
                '[SYSTEM-MONITOR] ROCm not available or failed:',
                amdError.message,
              );

              // Method 3: Fallback to lspci for basic detection
              try {
                const stdout = await this.executeSubprocessWithTimeout(
                  'lspci | grep -i vga',
                  TIMEOUTS.GPU_DETECTION,
                );
                if (stdout.toLowerCase().includes('nvidia')) {
                  this.gpuInfo.vendor = 'NVIDIA';
                  this.gpuInfo.available = true;
                  logger.debug(
                    '[SYSTEM-MONITOR] Linux GPU detected via lspci: NVIDIA',
                  );
                } else if (
                  stdout.toLowerCase().includes('amd') ||
                  stdout.toLowerCase().includes('radeon')
                ) {
                  this.gpuInfo.vendor = 'AMD';
                  this.gpuInfo.available = true;
                  logger.debug(
                    '[SYSTEM-MONITOR] Linux GPU detected via lspci: AMD',
                  );
                } else if (
                  stdout.toLowerCase().includes('intel') ||
                  stdout.toLowerCase().includes('integrated')
                ) {
                  this.gpuInfo.vendor = 'Intel';
                  this.gpuInfo.available = true;
                  logger.debug(
                    '[SYSTEM-MONITOR] Linux GPU detected via lspci: Intel',
                  );
                } else {
                  logger.debug(
                    '[SYSTEM-MONITOR] No recognizable GPU found via lspci',
                  );
                }
              } catch (lspciError) {
                logger.debug(
                  '[SYSTEM-MONITOR] lspci failed:',
                  lspciError.message,
                );

                // Method 4: Check for Intel GPU via glxinfo
                try {
                  const stdout = await this.executeSubprocessWithTimeout(
                    'glxinfo | grep -i "vendor|renderer"',
                    TIMEOUTS.GPU_DETECTION,
                  );
                  if (stdout.toLowerCase().includes('intel')) {
                    this.gpuInfo = {
                      available: true,
                      vendor: 'Intel',
                      name: 'Intel Integrated Graphics',
                      lastChecked: new Date().toISOString(),
                    };
                    logger.debug(
                      '[SYSTEM-MONITOR] Linux GPU detected via glxinfo:',
                      this.gpuInfo.name,
                    );
                  } else {
                    logger.debug(
                      '[SYSTEM-MONITOR] glxinfo did not detect Intel GPU',
                    );
                  }
                } catch (glxError) {
                  logger.debug(
                    '[SYSTEM-MONITOR] glxinfo failed:',
                    glxError.message,
                  );
                  // All detection methods failed - this is expected on many systems
                  logger.debug(
                    '[SYSTEM-MONITOR] All Linux GPU detection methods failed - GPU may not be available or detectable',
                  );
                }
              }
            }
          }
        } catch (error) {
          logger.debug(
            '[SYSTEM-MONITOR] Enhanced Linux GPU detection failed:',
            error.message,
          );
        }
      } else if (process.platform === 'darwin') {
        // Enhanced macOS GPU detection
        try {
          // Check for Apple Silicon vs Intel
          const { stdout: cpuInfo } = await execAsync(
            'sysctl -n machdep.cpu.brand_string',
          );
          const isAppleSilicon = cpuInfo.toLowerCase().includes('apple');

          if (isAppleSilicon) {
            this.gpuInfo = {
              available: true,
              vendor: 'Apple',
              name: 'Apple Silicon GPU',
              lastChecked: new Date().toISOString(),
            };
          } else {
            // Intel Mac - try to detect discrete GPU
            try {
              const { stdout } = await execAsync(
                'system_profiler SPDisplaysDataType | grep -A 5 "Chipset Model"',
              );
              if (stdout.toLowerCase().includes('nvidia')) {
                this.gpuInfo = {
                  available: true,
                  vendor: 'NVIDIA',
                  name: 'NVIDIA GPU (Intel Mac)',
                  lastChecked: new Date().toISOString(),
                };
              } else if (
                stdout.toLowerCase().includes('amd') ||
                stdout.toLowerCase().includes('radeon')
              ) {
                this.gpuInfo = {
                  available: true,
                  vendor: 'AMD',
                  name: 'AMD Radeon (Intel Mac)',
                  lastChecked: new Date().toISOString(),
                };
              } else if (stdout.toLowerCase().includes('intel')) {
                this.gpuInfo = {
                  available: true,
                  vendor: 'Intel',
                  name: 'Intel Integrated Graphics',
                  lastChecked: new Date().toISOString(),
                };
              }
            } catch (gpuError) {
              // Fallback to basic detection
              this.gpuInfo = {
                available: true,
                vendor: 'Apple',
                name: 'Intel Mac Graphics',
                lastChecked: new Date().toISOString(),
              };
            }
          }
        } catch (error) {
          // Fallback to basic Apple GPU assumption
          this.gpuInfo = {
            available: true,
            vendor: 'Apple',
            name: 'Apple GPU',
            lastChecked: new Date().toISOString(),
          };
        }
      }

      if (this.gpuInfo.available) {
        logger.info('[SYSTEM-MONITOR] GPU detected and active', {
          vendor: this.gpuInfo.vendor,
          name: this.gpuInfo.name,
          driverVersion: this.gpuInfo.driverVersion,
        });
      } else {
        logger.warn(
          '[SYSTEM-MONITOR] No GPU detected - operations will use CPU',
        );
      }
    } catch (error) {
      logger.warn('[SYSTEM-MONITOR] GPU status check failed:', error.message);
    }
  }

  async checkOllamaHealth() {
    this.ollamaHealth = {
      healthy: false,
      reachable: false,
      modelsAvailable: 0,
      models: [],
      responseTime: null,
      lastChecked: new Date().toISOString(),
      error: null,
    };

    try {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('http://localhost:11434/api/tags', {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      });

      clearTimeout(timeoutId);
      this.ollamaHealth.responseTime = Date.now() - startTime;
      this.ollamaHealth.reachable = response.ok;

      if (response.ok) {
        const data = await response.json();
        this.ollamaHealth.healthy = true;
        this.ollamaHealth.modelsAvailable = data.models?.length || 0;
        this.ollamaHealth.models = data.models?.map((m) => m.name) || [];

        logger.info('[SYSTEM-MONITOR] Ollama health check passed', {
          modelsAvailable: this.ollamaHealth.modelsAvailable,
          responseTime: `${this.ollamaHealth.responseTime}ms`,
          models: this.ollamaHealth.models.slice(0, 3), // Log first 3 models
        });
      } else {
        this.ollamaHealth.error = `HTTP ${response.status}`;
        logger.warn(
          '[SYSTEM-MONITOR] Ollama returned non-200 status:',
          response.status,
        );
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        this.ollamaHealth.error = 'Request timeout after 5 seconds';
      } else {
        this.ollamaHealth.error = error.message;
      }
      logger.error(
        '[SYSTEM-MONITOR] Ollama health check failed:',
        this.ollamaHealth.error,
      );
    }
  }

  async checkNetworkConnectivity() {
    try {
      // Test basic internet connectivity
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch('https://httpbin.org/status/200', {
        signal: controller.signal,
        method: 'HEAD',
      });

      clearTimeout(timeoutId);
      const isConnected = response.ok;
      logger.info('[SYSTEM-MONITOR] Network connectivity check', {
        connected: isConnected,
        responseTime: 'N/A (external test)',
      });

      await fileLogger.writeLog('performance', 'NETWORK_CHECK', {
        connected: isConnected,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMessage =
        error.name === 'AbortError'
          ? 'Request timeout after 3 seconds'
          : error.message;
      logger.warn(
        '[SYSTEM-MONITOR] Network connectivity check failed:',
        errorMessage,
      );
    }
  }

  async checkDiskSpace() {
    try {
      const diskUsage = await this.getDiskUsage();
      const freeSpaceGB = diskUsage.free / (1024 * 1024 * 1024);

      logger.info('[SYSTEM-MONITOR] Disk space check', {
        freeSpace: `${freeSpaceGB.toFixed(1)}GB`,
        totalSpace: `${(diskUsage.total / (1024 * 1024 * 1024)).toFixed(1)}GB`,
        usagePercent: `${diskUsage.usagePercent}%`,
      });

      // Warn if low disk space
      if (freeSpaceGB < 2) {
        logger.warn('[SYSTEM-MONITOR] Low disk space detected!', {
          freeSpaceGB: freeSpaceGB.toFixed(1),
          recommendation: 'Free up disk space to ensure proper operation',
        });
      }
    } catch (error) {
      logger.warn('[SYSTEM-MONITOR] Disk space check failed:', error.message);
    }
  }

  async getDiskUsage() {
    // Get disk usage for the current drive/directory
    const cwd = process.cwd();

    if (process.platform === 'win32') {
      try {
        const drive = cwd.split(':')[0] || 'C';
        const { stdout } = await execAsync(
          `wmic logicaldisk where "DeviceID='${drive}:'" get FreeSpace,Size /format:csv`,
        );
        const lines = stdout.trim().split('\n');
        if (lines.length >= 2) {
          const values = lines[1].split(',');
          const freeSpace = parseInt(values[1]);
          const totalSpace = parseInt(values[2]);
          if (freeSpace && totalSpace) {
            return {
              free: freeSpace,
              total: totalSpace,
              usagePercent: Math.round(
                ((totalSpace - freeSpace) / totalSpace) * 100,
              ),
            };
          }
        }
      } catch (error) {
        logger.debug(
          '[SYSTEM-MONITOR] Windows disk space check failed:',
          error.message,
        );
      }
    } else {
      // Unix-like systems (Linux, macOS)
      try {
        // Get the mount point for current directory
        const { stdout: mountInfo } = await execAsync(
          'df -k "' + cwd + '" | tail -1',
        );
        const parts = mountInfo.trim().split(/\s+/);
        if (parts.length >= 4) {
          const totalBlocks = parseInt(parts[1]) * 1024; // Convert from KB to bytes
          const usedBlocks = parseInt(parts[2]) * 1024;
          const freeBlocks = parseInt(parts[3]) * 1024;

          if (totalBlocks && usedBlocks && freeBlocks) {
            return {
              free: freeBlocks,
              total: totalBlocks,
              usagePercent: Math.round((usedBlocks / totalBlocks) * 100),
            };
          }
        }
      } catch (error) {
        logger.debug(
          '[SYSTEM-MONITOR] Unix disk space check failed:',
          error.message,
        );
      }
    }

    // Enhanced fallback with attempt to get actual disk info
    try {
      // Try to get basic filesystem stats using Node.js
      const { stdout: fallbackInfo } = await execAsync('df -h . | tail -1');
      logger.debug('[SYSTEM-MONITOR] Disk info fallback:', fallbackInfo.trim());
    } catch (fallbackError) {
      logger.debug('[SYSTEM-MONITOR] Fallback disk info unavailable');
    }

    // Return more conservative fallback values
    logger.warn(
      '[SYSTEM-MONITOR] Using fallback disk space values - actual disk space unknown',
    );
    return {
      free: 2 * 1024 * 1024 * 1024, // 2GB fallback (more conservative)
      total: 100 * 1024 * 1024 * 1024, // 100GB fallback
      usagePercent: 98, // High usage to trigger warnings
    };
  }

  startPeriodicMonitoring() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    logger.info(
      '[SYSTEM-MONITOR] Starting periodic system monitoring (every 2 minutes)',
    );

    // Monitor every 2 minutes
    this.monitoringInterval = setInterval(
      async () => {
        try {
          await this.performHealthCheck();
        } catch (error) {
          logger.error('[SYSTEM-MONITOR] Periodic health check failed:', error);
        }
      },
      2 * 60 * 1000,
    ); // 2 minutes
  }

  async performHealthCheck() {
    const healthStatus = {
      timestamp: new Date().toISOString(),
      checks: {},
    };

    // GPU Health Check
    try {
      await this.checkGPUStatus();
      healthStatus.checks.gpu = {
        status: this.gpuInfo.available ? 'healthy' : 'unavailable',
        details: this.gpuInfo,
      };
    } catch (error) {
      healthStatus.checks.gpu = {
        status: 'error',
        error: error.message,
      };
    }

    // Ollama Health Check
    try {
      await this.checkOllamaHealth();
      healthStatus.checks.ollama = {
        status: this.ollamaHealth.healthy ? 'healthy' : 'unhealthy',
        details: this.ollamaHealth,
      };
    } catch (error) {
      healthStatus.checks.ollama = {
        status: 'error',
        error: error.message,
      };
    }

    // Memory Check
    const memUsage = process.memoryUsage();
    healthStatus.checks.memory = {
      status:
        memUsage.heapUsed / memUsage.heapTotal > 0.9 ? 'warning' : 'healthy',
      details: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024),
        total: Math.round(memUsage.heapTotal / 1024 / 1024),
        usagePercent: Math.round(
          (memUsage.heapUsed / memUsage.heapTotal) * 100,
        ),
      },
    };

    // Log health status
    await fileLogger.writeLog('performance', 'HEALTH_CHECK', healthStatus);

    // Log warnings for unhealthy components
    Object.entries(healthStatus.checks).forEach(([component, check]) => {
      if (check.status !== 'healthy') {
        logger.warn(
          `[SYSTEM-MONITOR] ${component} health check: ${check.status}`,
          {
            component,
            status: check.status,
            details: check.details,
            error: check.error,
          },
        );
      }
    });
  }

  async logSystemStartup() {
    const startupInfo = {
      timestamp: new Date().toISOString(),
      systemInfo: this.systemInfo,
      gpuInfo: this.gpuInfo,
      ollamaHealth: this.ollamaHealth,
      startupMetrics: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
    };

    await fileLogger.logPerformance('SYSTEM_STARTUP', Date.now(), startupInfo);

    logger.info('[SYSTEM-MONITOR] System startup logged successfully', {
      gpuAvailable: this.gpuInfo.available,
      ollamaHealthy: this.ollamaHealth.healthy,
      modelsAvailable: this.ollamaHealth.modelsAvailable,
    });
  }

  async logUserSession(sessionData) {
    await fileLogger.logAction('user_session', {
      ...sessionData,
      systemInfo: this.systemInfo,
      gpuInfo: this.gpuInfo,
      timestamp: new Date().toISOString(),
    });
  }

  async logPerformanceAnomaly(anomalyData) {
    await fileLogger.logError(
      'performance_anomaly',
      new Error('Performance anomaly detected'),
      {
        ...anomalyData,
        systemInfo: this.systemInfo,
        timestamp: new Date().toISOString(),
      },
    );

    logger.warn('[SYSTEM-MONITOR] Performance anomaly detected', anomalyData);
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    logger.info('[SYSTEM-MONITOR] System monitoring stopped');
  }

  getSystemStatus() {
    return {
      systemInfo: this.systemInfo,
      gpuInfo: this.gpuInfo,
      ollamaHealth: this.ollamaHealth,
      isMonitoring: this.isMonitoring,
      lastChecked: new Date().toISOString(),
    };
  }
}

// Create singleton instance
const systemMonitor = new SystemMonitor();

module.exports = {
  SystemMonitor,
  systemMonitor,
};
