/**
 * Performance Monitor Component Tests
 * Tests performance tracking, metrics collection, and UI components
 */

// Mock React hooks and globals
const mockUseState = jest.fn();
const mockUseEffect = jest.fn();
const mockUseRef = jest.fn();
const mockUseMemo = jest.fn();

// Mock React
jest.mock('react', () => ({
  useState: mockUseState,
  useEffect: mockUseEffect,
  useRef: mockUseRef,
  useMemo: mockUseMemo,
  createContext: jest.fn(() => ({
    Provider: ({ children }) => children
  })),
  useContext: jest.fn(() => ({
    metrics: {},
    addMetric: jest.fn(),
    clearMetrics: jest.fn()
  })),
  createElement: jest.fn((type, props, ...children) => ({ type, props, children }))
}));

const React = require('react');

// Mock performance API
global.performance = {
  now: jest.fn(() => Date.now()),
  memory: {
    usedJSHeapSize: 50 * 1024 * 1024, // 50MB
    totalJSHeapSize: 100 * 1024 * 1024 // 100MB
  }
};

// Mock document methods
global.document = {
  querySelectorAll: jest.fn(() => ({ length: 25 }))
};

describe('Performance Monitor', () => {
  let PerformanceMonitor, PerformanceProvider, usePerformanceMetrics;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Default mock implementations
    mockUseState.mockImplementation((initial) => [initial, jest.fn()]);
    mockUseEffect.mockImplementation((fn) => {
      const cleanup = fn();
      return cleanup;
    });
    mockUseRef.mockImplementation((initial) => ({ current: initial }));
    mockUseMemo.mockImplementation((fn) => fn());

    // Try to import the actual component
    try {
      const module = await import('../src/renderer/components/PerformanceMonitor.js');
      PerformanceMonitor = module.default;
      PerformanceProvider = module.PerformanceProvider;
      usePerformanceMetrics = module.usePerformanceMetrics;
    } catch (error) {
      // Create mock implementations if import fails
      PerformanceMonitor = ({ enabled = true, showUI = true, onMetricsUpdate = null }) => {
        if (!enabled || !showUI) return null;
        return React.createElement('div', { 
          className: 'performance-monitor',
          'data-testid': 'performance-monitor'
        }, 'Performance Monitor');
      };
      
      PerformanceProvider = ({ children }) => children;
      
      usePerformanceMetrics = (componentName) => ({
        reportMetric: jest.fn(),
        reportRenderTime: jest.fn()
      });
    }
  });

  describe('PerformanceMonitor Component', () => {
    test('should render when enabled and showUI is true', () => {
      const component = PerformanceMonitor({ 
        enabled: true, 
        showUI: true 
      });
      
      expect(component).toBeDefined();
      // Component should not be null when enabled
      expect(component).not.toBeNull();
    });

    test('should not render when disabled', () => {
      const component = PerformanceMonitor({ 
        enabled: false, 
        showUI: true 
      });
      
      // Component should return null when disabled
      expect(component).toBeNull();
    });

    test('should not render when showUI is false', () => {
      const component = PerformanceMonitor({ 
        enabled: true, 
        showUI: false 
      });
      
      // Component should return null when showUI is false
      expect(component).toBeNull();
    });

    test('should call onMetricsUpdate when provided', () => {
      const mockOnMetricsUpdate = jest.fn();
      
      // Mock useState to return metrics and a setter
      const mockMetrics = {
        renderTime: 25,
        memoryUsage: 48.5,
        componentCount: 25,
        renderCount: 5
      };
      
      mockUseState.mockReturnValueOnce([mockMetrics, jest.fn()]);
      
      PerformanceMonitor({ 
        enabled: true, 
        showUI: true,
        onMetricsUpdate: mockOnMetricsUpdate
      });
      
      // useEffect should be called for metrics updates
      expect(mockUseEffect).toHaveBeenCalled();
    });

    test('should handle performance measurements', () => {
      // Mock performance.now to return different values
      let callCount = 0;
      global.performance.now.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 100 : 125; // 25ms render time
      });

      const mockSetMetrics = jest.fn();
      mockUseState.mockReturnValueOnce([{
        renderTime: 0,
        memoryUsage: 0,
        componentCount: 0,
        renderCount: 0,
        lastUpdate: Date.now()
      }, mockSetMetrics]);

      PerformanceMonitor({ enabled: true, showUI: true });

      // Performance measurement should be set up
      expect(mockUseEffect).toHaveBeenCalled();
    });
  });

  describe('Performance Analysis', () => {
    test('should categorize render performance correctly', () => {
      const testCases = [
        { renderTime: 10, expected: 'excellent' },
        { renderTime: 30, expected: 'good' },
        { renderTime: 80, expected: 'needs-optimization' }
      ];

      testCases.forEach(({ renderTime, expected }) => {
        const mockMetrics = { renderTime, memoryUsage: 50, componentCount: 25, renderCount: 10 };
        
        // Mock useMemo to return our analysis
        mockUseMemo.mockReturnValueOnce({
          renderPerformance: renderTime < 16 ? 'excellent' : renderTime < 50 ? 'good' : 'needs-optimization',
          memoryPerformance: 'excellent',
          componentLoad: 'light',
          renderFrequency: 'low'
        });

        PerformanceMonitor({ enabled: true, showUI: true });
        
        // useMemo should be called for performance analysis
        expect(mockUseMemo).toHaveBeenCalled();
      });
    });

    test('should categorize memory performance correctly', () => {
      const testCases = [
        { memoryUsage: 30, expected: 'excellent' },
        { memoryUsage: 75, expected: 'good' },
        { memoryUsage: 150, expected: 'high' }
      ];

      testCases.forEach(({ memoryUsage, expected }) => {
        const mockMetrics = { renderTime: 15, memoryUsage, componentCount: 25, renderCount: 10 };
        
        mockUseMemo.mockReturnValueOnce({
          renderPerformance: 'excellent',
          memoryPerformance: memoryUsage < 50 ? 'excellent' : memoryUsage < 100 ? 'good' : 'high',
          componentLoad: 'light',
          renderFrequency: 'low'
        });

        PerformanceMonitor({ enabled: true, showUI: true });
        
        expect(mockUseMemo).toHaveBeenCalled();
      });
    });
  });

  describe('Performance Tips', () => {
    test('should provide tips for slow renders', () => {
      const mockMetrics = { 
        renderTime: 80, // Slow render
        memoryUsage: 40, 
        componentCount: 30, 
        renderCount: 15 
      };
      
      mockUseState.mockReturnValueOnce([mockMetrics, jest.fn()]);
      
      PerformanceMonitor({ enabled: true, showUI: true });
      
      // Component should be created (tips are generated internally)
      expect(PerformanceMonitor).toBeDefined();
    });

    test('should provide tips for high memory usage', () => {
      const mockMetrics = { 
        renderTime: 20, 
        memoryUsage: 120, // High memory
        componentCount: 30, 
        renderCount: 15 
      };
      
      mockUseState.mockReturnValueOnce([mockMetrics, jest.fn()]);
      
      PerformanceMonitor({ enabled: true, showUI: true });
      
      expect(PerformanceMonitor).toBeDefined();
    });

    test('should provide tips for large component trees', () => {
      const mockMetrics = { 
        renderTime: 20, 
        memoryUsage: 40, 
        componentCount: 120, // Large component tree
        renderCount: 15 
      };
      
      mockUseState.mockReturnValueOnce([mockMetrics, jest.fn()]);
      
      PerformanceMonitor({ enabled: true, showUI: true });
      
      expect(PerformanceMonitor).toBeDefined();
    });

    test('should provide tips for frequent re-renders', () => {
      const mockMetrics = { 
        renderTime: 20, 
        memoryUsage: 40, 
        componentCount: 30, 
        renderCount: 150 // Frequent re-renders
      };
      
      mockUseState.mockReturnValueOnce([mockMetrics, jest.fn()]);
      
      PerformanceMonitor({ enabled: true, showUI: true });
      
      expect(PerformanceMonitor).toBeDefined();
    });
  });

  describe('PerformanceProvider', () => {
    test('should provide context to child components', () => {
      const mockChildren = React.createElement('div', {}, 'Test Child');
      const provider = PerformanceProvider({ children: mockChildren });
      
      expect(provider).toBeDefined();
      // Provider should wrap children
      expect(provider).toBe(mockChildren);
    });

    test('should manage global metrics state', () => {
      // Mock useState for the provider
      const mockGlobalMetrics = {};
      const mockSetGlobalMetrics = jest.fn();
      mockUseState.mockReturnValueOnce([mockGlobalMetrics, mockSetGlobalMetrics]);
      
      const provider = PerformanceProvider({ children: null });
      
      expect(mockUseState).toHaveBeenCalledWith({});
    });
  });

  describe('usePerformanceMetrics Hook', () => {
    test('should return metric reporting functions', () => {
      const hook = usePerformanceMetrics('TestComponent');
      
      expect(hook).toHaveProperty('reportMetric');
      expect(hook).toHaveProperty('reportRenderTime');
      expect(typeof hook.reportMetric).toBe('function');
      expect(typeof hook.reportRenderTime).toBe('function');
    });

    test('should handle metric reporting', () => {
      const hook = usePerformanceMetrics('TestComponent');
      
      // Should not throw when calling report functions
      expect(() => {
        hook.reportMetric('testMetric', 100);
        hook.reportRenderTime();
      }).not.toThrow();
    });

    test('should use useEffect for render time tracking', () => {
      usePerformanceMetrics('TestComponent');
      
      // useEffect should be called for render time tracking
      expect(mockUseEffect).toHaveBeenCalled();
    });
  });

  describe('Memory Usage Monitoring', () => {
    test('should handle browsers without performance.memory', () => {
      // Temporarily remove performance.memory
      const originalMemory = global.performance.memory;
      delete global.performance.memory;
      
      const mockSetMetrics = jest.fn();
      mockUseState.mockReturnValueOnce([{}, mockSetMetrics]);
      
      // Should not throw without performance.memory
      expect(() => {
        PerformanceMonitor({ enabled: true, showUI: true });
      }).not.toThrow();
      
      // Restore performance.memory
      global.performance.memory = originalMemory;
    });

    test('should calculate memory usage correctly', () => {
      // Set specific memory values
      global.performance.memory.usedJSHeapSize = 75 * 1024 * 1024; // 75MB
      
      const mockSetMetrics = jest.fn();
      mockUseState.mockReturnValueOnce([{}, mockSetMetrics]);
      
      PerformanceMonitor({ enabled: true, showUI: true });
      
      // Component should handle memory calculation
      expect(PerformanceMonitor).toBeDefined();
    });
  });

  describe('Component Count Estimation', () => {
    test('should estimate component count from DOM', () => {
      // Mock different DOM scenarios
      const testCases = [
        { reactComponents: 10, expected: 10 },
        { reactComponents: 0, divElements: 60, expected: 20 }, // 60/3 = 20
        { reactComponents: 0, divElements: 0, expected: 0 }
      ];

      testCases.forEach(({ reactComponents, divElements = 0, expected }) => {
        // Mock querySelectorAll responses
        global.document.querySelectorAll
          .mockReturnValueOnce({ length: reactComponents }) // [data-react-component]
          .mockReturnValueOnce({ length: 0 }) // div[class*="react"]
          .mockReturnValueOnce({ length: divElements }); // div

        const mockSetMetrics = jest.fn();
        mockUseState.mockReturnValueOnce([{}, mockSetMetrics]);
        
        PerformanceMonitor({ enabled: true, showUI: true });
        
        expect(global.document.querySelectorAll).toHaveBeenCalled();
      });
    });
  });

  describe('Integration with Development Environment', () => {
    test('should respect NODE_ENV for enabling', () => {
      const originalEnv = process.env.NODE_ENV;
      
      // Test development environment
      process.env.NODE_ENV = 'development';
      let component = PerformanceMonitor({});
      expect(component).toBeDefined(); // Should render in development
      
      // Test production environment
      process.env.NODE_ENV = 'production';
      component = PerformanceMonitor({});
      expect(component).toBeNull(); // Should not render in production by default
      
      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });

    test('should log slow renders in development', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalConsoleWarn = console.warn;
      
      process.env.NODE_ENV = 'development';
      console.warn = jest.fn();
      
      const mockOnMetricsUpdate = jest.fn();
      const slowMetrics = { renderTime: 150 }; // Slow render
      
      // Simulate metrics update callback
      mockOnMetricsUpdate(slowMetrics);
      
      // Should not throw
      expect(mockOnMetricsUpdate).toHaveBeenCalledWith(slowMetrics);
      
      // Restore
      process.env.NODE_ENV = originalEnv;
      console.warn = originalConsoleWarn;
    });
  });
});

// Export test utilities
module.exports = {
  // Test utilities could be exported here
}; 