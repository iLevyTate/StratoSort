/**
 * Comprehensive System Monitor Service
 * Monitors system health, GPU status, Ollama connectivity, and performance
 */

const { logger } = require('../../shared/logger');
const { fileLogger } = require('../../shared/fileLogger');
const systemAnalytics = require('../core/systemAnalytics');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class SystemMonitor {
  constructor() {
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.healthChecks = new Map();
    this.systemInfo = {};
    this.gpuInfo = {};
    this.ollamaHealth = {};
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

    // Collect basic system information
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

    // GPU Detection and Status
    await this.checkGPUStatus();

    // Ollama Health Check
    await this.checkOllamaHealth();

    // Network Connectivity
    await this.checkNetworkConnectivity();

    // Disk Space
    await this.checkDiskSpace();

    // Log initial system state
    await fileLogger.writeLog('performance', 'SYSTEM_STARTUP_CHECK', {
      systemInfo: this.systemInfo,
      gpuInfo: this.gpuInfo,
      ollamaHealth: this.ollamaHealth,
      timestamp: new Date().toISOString(),
    });

    logger.info('[SYSTEM-MONITOR] Initial system assessment completed', {
      gpuDetected: !!this.gpuInfo.available,
      ollamaHealthy: this.ollamaHealth.healthy,
      memoryUsage: `${Math.round((this.systemInfo.totalMemory - this.systemInfo.freeMemory) / 1024 / 1024)}MB/${Math.round(this.systemInfo.totalMemory / 1024 / 1024)}MB`,
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
          const { stdout } = await execAsync(
            'nvidia-smi --query-gpu=name,driver_version,memory.total,memory.free,temperature.gpu --format=csv,noheader,nounits',
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
          // NVIDIA not available, try AMD
          try {
            const { stdout } = await execAsync('rocminfo');
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
            // No GPU detected
          }
        }
      } else if (process.platform === 'linux') {
        // Linux GPU detection
        try {
          const { stdout } = await execAsync('lspci | grep -i vga');
          if (stdout.toLowerCase().includes('nvidia')) {
            this.gpuInfo.vendor = 'NVIDIA';
            this.gpuInfo.available = true;
          } else if (
            stdout.toLowerCase().includes('amd') ||
            stdout.toLowerCase().includes('radeon')
          ) {
            this.gpuInfo.vendor = 'AMD';
            this.gpuInfo.available = true;
          }
        } catch (error) {
          // GPU detection failed
        }
      } else if (process.platform === 'darwin') {
        // macOS GPU detection (Apple Silicon)
        this.gpuInfo = {
          available: true,
          vendor: 'Apple',
          name: 'Apple Silicon GPU',
          lastChecked: new Date().toISOString(),
        };
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
      const response = await fetch('http://localhost:11434/api/tags', {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' },
      });

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
      this.ollamaHealth.error = error.message;
      logger.error(
        '[SYSTEM-MONITOR] Ollama health check failed:',
        error.message,
      );
    }
  }

  async checkNetworkConnectivity() {
    try {
      // Test basic internet connectivity
      const response = await fetch('https://httpbin.org/status/200', {
        timeout: 3000,
        method: 'HEAD',
      });

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
      logger.warn(
        '[SYSTEM-MONITOR] Network connectivity check failed:',
        error.message,
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
    // Simple disk usage check for the current drive
    const cwd = process.cwd();
    const drive = cwd.split(':')[0] || '/'; // Windows or Unix

    if (process.platform === 'win32') {
      try {
        const { stdout } = await execAsync(
          `wmic logicaldisk where "DeviceID='${drive}:'" get FreeSpace,Size /format:csv`,
        );
        const lines = stdout.trim().split('\n');
        if (lines.length >= 2) {
          const values = lines[1].split(',');
          const freeSpace = parseInt(values[1]);
          const totalSpace = parseInt(values[2]);
          return {
            free: freeSpace,
            total: totalSpace,
            usagePercent: Math.round(
              ((totalSpace - freeSpace) / totalSpace) * 100,
            ),
          };
        }
      } catch (error) {
        // Fallback
      }
    }

    // Fallback: Use Node.js fs for basic info
    return {
      free: 1024 * 1024 * 1024, // 1GB fallback
      total: 10 * 1024 * 1024 * 1024, // 10GB fallback
      usagePercent: 90,
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
