const { app } = require('electron');
const { logger } = require('../../shared/logger');

/**
 * Comprehensive GPU Diagnostics and Hardware Acceleration Manager
 * Implements systematic GPU troubleshooting as outlined in the diagnostic framework
 */
class GPUDiagnostics {
  constructor() {
    this.gpuStatus = null;
    this.diagnosticHistory = [];
    this.isInitialized = false;
    this.gpuTestResults = null;

    // Initialization promise to prevent race conditions
    this.initPromise = null;
  }

  /**
   * Initialize GPU diagnostics system with race condition protection
   */
  async initialize() {
    // If already initialized, return immediately
    if (this.isInitialized) return;

    // If initialization is in progress, wait for it to complete
    if (this.initPromise) {
      logger.debug('[GPU-DIAG] Initialization already in progress, waiting...');
      return this.initPromise;
    }

    // Start initialization process
    this.initPromise = this._doInitialize();

    try {
      await this.initPromise;
    } catch (error) {
      // Reset initPromise on failure so future calls can retry
      this.initPromise = null;
      throw error;
    }

    return this.initPromise;
  }

  /**
   * Internal initialization method
   */
  async _doInitialize() {
    try {
      logger.info('[GPU-DIAG] Initializing GPU diagnostics system');

      // Double-check initialization state (another call might have completed while waiting)
      if (this.isInitialized) {
        logger.debug('[GPU-DIAG] Already initialized during concurrent call');
        return;
      }

      // Get initial GPU status
      await this.updateGPUStatus();

      // Run initial diagnostics
      await this.runInitialDiagnostics();

      // Set up continuous monitoring
      this.setupGPUMonitoring();

      this.isInitialized = true;
      logger.info('[GPU-DIAG] GPU diagnostics initialized successfully');
    } catch (error) {
      logger.error('[GPU-DIAG] Failed to initialize GPU diagnostics:', error);
      throw error;
    } finally {
      // Clear the promise so future calls can proceed
      this.initPromise = null;
    }
  }

  /**
   * Update current GPU status
   */
  async updateGPUStatus() {
    try {
      // Get Electron's GPU feature status
      const gpuFeatureStatus = app.getGPUFeatureStatus
        ? app.getGPUFeatureStatus()
        : {};
      const gpuInfo = await this.getGPUInfo();

      this.gpuStatus = {
        timestamp: new Date().toISOString(),
        featureStatus: gpuFeatureStatus,
        gpuInfo,
        hardwareAcceleration: !app.commandLine.hasSwitch('disable-gpu'),
        softwareRendering: app.commandLine.hasSwitch(
          'disable-software-rasterizer',
        ),
      };

      logger.debug('[GPU-DIAG] GPU status updated:', this.gpuStatus);
    } catch (error) {
      logger.error('[GPU-DIAG] Failed to update GPU status:', error);
      this.gpuStatus = { error: error.message };
    }
  }

  /**
   * Get detailed GPU information
   */
  async getGPUInfo() {
    try {
      const gpuInfo = {};

      // Basic GPU feature status
      if (app.getGPUFeatureStatus) {
        gpuInfo.featureStatus = app.getGPUFeatureStatus();
      }

      // System GPU information (limited in Electron)
      gpuInfo.systemInfo = {
        platform: process.platform,
        arch: process.arch,
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
      };

      // Command line switches that affect GPU
      gpuInfo.commandLineSwitches = {
        disableGpu: app.commandLine.hasSwitch('disable-gpu'),
        disableSoftwareRasterizer: app.commandLine.hasSwitch(
          'disable-software-rasterizer',
        ),
        enableGpuRasterization: app.commandLine.hasSwitch(
          'enable-gpu-rasterization',
        ),
        ignoreGpuBlocklist: app.commandLine.hasSwitch('ignore-gpu-blocklist'),
        useGL: app.commandLine.getSwitchValue('use-gl') || 'default',
        forceHighPerformanceGpu: app.commandLine.hasSwitch(
          'force_high_performance_gpu',
        ),
        forceLowPowerGpu: app.commandLine.hasSwitch('force_low_power_gpu'),
      };

      return gpuInfo;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Run initial GPU diagnostics
   */
  async runInitialDiagnostics() {
    try {
      logger.info('[GPU-DIAG] Running initial GPU diagnostics');

      const diagnostics = {
        timestamp: new Date().toISOString(),
        tests: {},
      };

      // Test 1: GPU Feature Status Analysis
      diagnostics.tests.featureStatus = await this.analyzeGPUFeatureStatus();

      // Test 2: Hardware Acceleration Capability
      diagnostics.tests.hardwareAcceleration =
        await this.testHardwareAcceleration();

      // Test 3: Driver Compatibility
      diagnostics.tests.driverCompatibility =
        await this.checkDriverCompatibility();

      // Test 4: Memory and Performance
      diagnostics.tests.memoryAndPerformance =
        await this.testMemoryAndPerformance();

      this.gpuTestResults = diagnostics;
      this.diagnosticHistory.push(diagnostics);

      // Keep only last 10 diagnostic runs
      if (this.diagnosticHistory.length > 10) {
        this.diagnosticHistory = this.diagnosticHistory.slice(-10);
      }

      logger.info('[GPU-DIAG] Initial diagnostics completed');
    } catch (error) {
      logger.error('[GPU-DIAG] Initial diagnostics failed:', error);
    }
  }

  /**
   * Analyze GPU feature status
   */
  async analyzeGPUFeatureStatus() {
    try {
      const status = this.gpuStatus?.featureStatus || {};
      const analysis = {
        status: 'unknown',
        issues: [],
        recommendations: [],
      };

      // Check for disabled features
      const disabledFeatures = [];
      Object.entries(status).forEach(([feature, state]) => {
        if (
          state === 'disabled_software' ||
          state === 'disabled_off' ||
          state === 'disabled_off_ok'
        ) {
          disabledFeatures.push(feature);
        }
      });

      if (disabledFeatures.length > 0) {
        analysis.issues.push(
          `Disabled GPU features: ${disabledFeatures.join(', ')}`,
        );
        analysis.recommendations.push(
          'Consider updating GPU drivers or enabling features manually',
        );
      }

      // Check for software rendering fallback
      if (status.gpu_compositing === 'disabled_software') {
        analysis.issues.push(
          'GPU compositing disabled, falling back to software rendering',
        );
        analysis.status = 'software_fallback';
        analysis.recommendations.push(
          'Check GPU drivers or try --disable-gpu flag for testing',
        );
      } else if (
        Object.values(status).some((state) => state === 'enabled_readback')
      ) {
        analysis.status = 'degraded';
        analysis.issues.push('GPU acceleration partially degraded');
        analysis.recommendations.push(
          'Monitor for visual artifacts or performance issues',
        );
      } else if (Object.values(status).every((state) => state === 'enabled')) {
        analysis.status = 'optimal';
      } else {
        analysis.status = 'mixed';
      }

      return analysis;
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Test hardware acceleration capability
   */
  async testHardwareAcceleration() {
    try {
      const test = {
        hardwareAccelerationEnabled: !app.commandLine.hasSwitch('disable-gpu'),
        softwareRenderingForced: app.commandLine.hasSwitch(
          'disable-software-rasterizer',
        ),
        issues: [],
        recommendations: [],
      };

      // Check if hardware acceleration is disabled
      if (!test.hardwareAccelerationEnabled) {
        test.issues.push('Hardware acceleration is disabled');
        test.recommendations.push(
          'Remove --disable-gpu flag to enable hardware acceleration',
        );
      }

      // Check for software rendering
      if (test.softwareRenderingForced) {
        test.issues.push(
          'Software rasterizer is disabled (forced software rendering)',
        );
        test.recommendations.push(
          'Remove --disable-software-rasterizer to allow GPU acceleration',
        );
      }

      // Check command line conflicts
      if (
        app.commandLine.hasSwitch('disable-gpu') &&
        app.commandLine.hasSwitch('enable-gpu-rasterization')
      ) {
        test.issues.push(
          'Conflicting GPU flags: --disable-gpu and --enable-gpu-rasterization',
        );
        test.recommendations.push(
          'Remove conflicting flags, --disable-gpu takes precedence',
        );
      }

      return test;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Check driver compatibility
   */
  async checkDriverCompatibility() {
    try {
      const compatibility = {
        status: 'unknown',
        issues: [],
        recommendations: [],
      };

      // This is a simplified check - in a real implementation,
      // you might check driver versions against known good/bad versions
      const gpuInfo = this.gpuStatus?.gpuInfo || {};

      // Check for known problematic configurations
      if (process.platform === 'win32') {
        compatibility.recommendations.push(
          'Ensure latest GPU drivers from manufacturer website',
        );
      } else if (process.platform === 'linux') {
        compatibility.recommendations.push(
          'Verify Mesa drivers are up to date',
        );
        compatibility.recommendations.push(
          'Consider using proprietary drivers if available',
        );
      } else if (process.platform === 'darwin') {
        compatibility.recommendations.push(
          'Keep macOS and Electron versions compatible',
        );
      }

      // Check for ANGLE backend issues
      if (gpuInfo.commandLineSwitches?.useGL) {
        const glBackend = gpuInfo.commandLineSwitches.useGL;
        if (glBackend === 'swiftshader') {
          compatibility.issues.push('Using SwiftShader software renderer');
          compatibility.status = 'software_renderer';
        }
      }

      return compatibility;
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Test memory and performance
   */
  async testMemoryAndPerformance() {
    try {
      const test = {
        memoryUsage: process.memoryUsage(),
        performance: {},
        issues: [],
        recommendations: [],
      };

      // Check memory usage
      const heapUsedMB = test.memoryUsage.heapUsed / 1024 / 1024;
      if (heapUsedMB > 512) {
        test.issues.push(
          `High memory usage: ${(heapUsedMB / 1024).toFixed(2)}GB`,
        );
        test.recommendations.push(
          'Monitor for memory leaks, consider restarting application',
        );
      }

      // Check external memory (often GPU-related)
      const externalMB = test.memoryUsage.external / 1024 / 1024;
      if (externalMB > 256) {
        test.issues.push(
          `High external memory usage: ${(externalMB / 1024).toFixed(2)}GB`,
        );
        test.recommendations.push(
          'External memory may indicate GPU memory pressure',
        );
      }

      // Basic performance indicators
      test.performance.uptime = process.uptime();
      test.performance.pid = process.pid;

      return test;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Set up continuous GPU monitoring
   */
  setupGPUMonitoring() {
    // Update GPU status every 5 minutes
    setInterval(
      async () => {
        try {
          await this.updateGPUStatus();
        } catch (error) {
          logger.debug('[GPU-DIAG] Monitoring update failed:', error.message);
        }
      },
      5 * 60 * 1000,
    );

    // Run diagnostics every hour
    setInterval(
      async () => {
        try {
          await this.runGPUDiagnostics();
        } catch (error) {
          logger.debug('[GPU-DIAG] Diagnostic run failed:', error.message);
        }
      },
      60 * 60 * 1000,
    );

    logger.info('[GPU-DIAG] Continuous monitoring started');
  }

  /**
   * Run periodic GPU diagnostics
   */
  async runGPUDiagnostics() {
    try {
      await this.updateGPUStatus();
      const diagnostics = {
        timestamp: new Date().toISOString(),
        tests: {
          featureStatus: await this.analyzeGPUFeatureStatus(),
          hardwareAcceleration: await this.testHardwareAcceleration(),
          driverCompatibility: await this.checkDriverCompatibility(),
          memoryAndPerformance: await this.testMemoryAndPerformance(),
        },
      };

      this.diagnosticHistory.push(diagnostics);

      // Check for significant changes
      await this.analyzeDiagnosticChanges(diagnostics);

      return diagnostics;
    } catch (error) {
      logger.error('[GPU-DIAG] GPU diagnostics failed:', error);
      return null;
    }
  }

  /**
   * Analyze changes in diagnostic results
   */
  async analyzeDiagnosticChanges(newDiagnostics) {
    try {
      if (this.diagnosticHistory.length < 2) return;

      const previous =
        this.diagnosticHistory[this.diagnosticHistory.length - 2];
      const changes = {
        timestamp: newDiagnostics.timestamp,
        significantChanges: [],
      };

      // Compare feature status
      const prevFeatures = previous.tests?.featureStatus?.status;
      const newFeatures = newDiagnostics.tests?.featureStatus?.status;

      if (prevFeatures !== newFeatures) {
        changes.significantChanges.push({
          type: 'gpu_status_change',
          from: prevFeatures,
          to: newFeatures,
          message: `GPU status changed from ${prevFeatures} to ${newFeatures}`,
        });

        logger.warn(
          '[GPU-DIAG] Significant GPU status change detected:',
          changes.significantChanges[0],
        );
      }

      // Check for new issues
      const newIssues = newDiagnostics.tests?.featureStatus?.issues || [];
      const prevIssues = previous.tests?.featureStatus?.issues || [];

      if (newIssues.length > prevIssues.length) {
        const newIssueMessages = newIssues.slice(prevIssues.length);
        changes.significantChanges.push({
          type: 'new_gpu_issues',
          issues: newIssueMessages,
          message: `New GPU issues detected: ${newIssueMessages.join(', ')}`,
        });

        logger.warn('[GPU-DIAG] New GPU issues detected:', newIssueMessages);
      }

      if (changes.significantChanges.length > 0) {
        // Log significant changes for analysis
        logger.info('[GPU-DIAG] Diagnostic changes detected:', changes);
      }
    } catch (error) {
      logger.debug('[GPU-DIAG] Change analysis failed:', error.message);
    }
  }

  /**
   * Generate troubleshooting recommendations
   */
  async generateTroubleshootingGuide() {
    try {
      const guide = {
        timestamp: new Date().toISOString(),
        currentStatus: this.gpuStatus,
        recommendations: [],
        emergencySteps: [],
      };

      // Analyze current GPU status for recommendations
      const featureStatus = this.gpuTestResults?.tests?.featureStatus;

      if (featureStatus?.status === 'software_fallback') {
        guide.recommendations.push({
          priority: 'high',
          issue: 'Software rendering fallback detected',
          steps: [
            'Update GPU drivers from manufacturer website',
            'Try running with --disable-gpu flag to confirm software rendering',
            'Check Windows Event Viewer for GPU driver errors',
            'Verify GPU is not overheating or overclocked',
          ],
        });
      }

      if (featureStatus?.status === 'degraded') {
        guide.recommendations.push({
          priority: 'medium',
          issue: 'GPU acceleration partially degraded',
          steps: [
            'Monitor for visual artifacts or performance issues',
            'Consider restarting the application',
            'Check for conflicting applications using GPU',
          ],
        });
      }

      // Emergency steps for critical issues
      if (
        this.gpuStatus?.featureStatus?.gpu_compositing === 'disabled_software'
      ) {
        guide.emergencySteps.push(
          'GPU compositing disabled - try --disable-gpu command line flag',
          'Check GPU drivers in Device Manager (Windows) or System Report (macOS)',
          'Try running without hardware acceleration temporarily',
        );
      }

      return guide;
    } catch (error) {
      logger.error(
        '[GPU-DIAG] Failed to generate troubleshooting guide:',
        error,
      );
      return { error: error.message };
    }
  }

  /**
   * Apply GPU fixes automatically
   */
  async applyGPUFixes() {
    try {
      logger.info('[GPU-DIAG] Applying automatic GPU fixes');

      const fixes = {
        applied: [],
        failed: [],
      };

      // Fix 1: Ensure proper GPU flags for current platform
      if (process.platform === 'win32') {
        try {
          app.commandLine.appendSwitch('ignore-gpu-blocklist');
          app.commandLine.appendSwitch('enable-gpu-rasterization');
          fixes.applied.push('Windows GPU optimization flags');
        } catch (e) {
          fixes.failed.push(`Windows GPU flags: ${e.message}`);
        }
      }

      // Fix 2: Memory optimization
      try {
        if (global.gc) {
          global.gc();
          fixes.applied.push('Garbage collection triggered');
        }
      } catch (e) {
        fixes.failed.push(`GC trigger: ${e.message}`);
      }

      logger.info('[GPU-DIAG] GPU fixes applied:', fixes);
      return fixes;
    } catch (error) {
      logger.error('[GPU-DIAG] Failed to apply GPU fixes:', error);
      return { error: error.message };
    }
  }

  /**
   * Get diagnostic report
   */
  async getDiagnosticReport() {
    try {
      const report = {
        timestamp: new Date().toISOString(),
        gpuStatus: this.gpuStatus,
        lastDiagnostics: this.gpuTestResults,
        diagnosticHistory: this.diagnosticHistory.slice(-3), // Last 3 runs
        troubleshootingGuide: await this.generateTroubleshootingGuide(),
        systemInfo: {
          platform: process.platform,
          arch: process.arch,
          electronVersion: process.versions.electron,
          chromeVersion: process.versions.chrome,
          nodeVersion: process.version,
        },
      };

      return report;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Export diagnostic data for external analysis
   */
  async exportDiagnostics(filepath) {
    try {
      const fs = require('fs').promises;
      const report = await this.getDiagnosticReport();

      await fs.writeFile(filepath, JSON.stringify(report, null, 2));
      logger.info(`[GPU-DIAG] Diagnostics exported to: ${filepath}`);

      return { success: true, filepath };
    } catch (error) {
      logger.error('[GPU-DIAG] Failed to export diagnostics:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
module.exports = new GPUDiagnostics();
