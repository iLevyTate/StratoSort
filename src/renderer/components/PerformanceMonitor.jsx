/**
 * Performance Monitor Component
 * Tracks render times, memory usage, and component performance metrics
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';

function PerformanceMonitor({ 
  enabled = process.env.NODE_ENV === 'development',
  showUI = true,
  onMetricsUpdate = null 
}) {
  const [metrics, setMetrics] = useState({
    renderTime: 0,
    memoryUsage: 0,
    componentCount: 0,
    renderCount: 0,
    lastUpdate: Date.now()
  });
  
  const [isExpanded, setIsExpanded] = useState(false);
  const renderStartTime = useRef(Date.now());
  const metricsRef = useRef(metrics);
  const intervalRef = useRef(null);

  // Performance measurement hook
  const measureRenderTime = () => {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      setMetrics((prev) => {
        const newMetrics = {
          ...prev,
          renderTime: Math.round(renderTime * 100) / 100,
          renderCount: prev.renderCount + 1,
          lastUpdate: Date.now()
        };
        metricsRef.current = newMetrics;
        return newMetrics;
      });
    };
  };

  // Memory usage monitoring
  const updateMemoryUsage = () => {
    if (performance.memory) {
      const memoryUsage = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024 * 100) / 100;
      
      setMetrics((prev) => {
        const newMetrics = {
          ...prev,
          memoryUsage,
          lastUpdate: Date.now()
        };
        metricsRef.current = newMetrics;
        return newMetrics;
      });
    }
  };

  // Component count estimation
  const updateComponentCount = () => {
    const componentCount = document.querySelectorAll('[data-react-component]').length || 
                          document.querySelectorAll('div[class*="react"]').length ||
                          Math.floor(document.querySelectorAll('div').length / 3);
    
    setMetrics((prev) => {
      const newMetrics = {
        ...prev,
        componentCount,
        lastUpdate: Date.now()
      };
      metricsRef.current = newMetrics;
      return newMetrics;
    });
  };

  // Setup performance monitoring
  useEffect(() => {
    if (!enabled) return;

    const cleanup = measureRenderTime();
    
    // Update memory and component metrics periodically
    intervalRef.current = setInterval(() => {
      updateMemoryUsage();
      updateComponentCount();
    }, 2000);

    return () => {
      cleanup();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled]);

  // Notify parent of metrics updates
  useEffect(() => {
    if (onMetricsUpdate && enabled) {
      onMetricsUpdate(metrics);
    }
  }, [metrics, onMetricsUpdate, enabled]);

  // Performance analysis
  const performanceAnalysis = useMemo(() => {
    const { renderTime, memoryUsage, componentCount, renderCount } = metrics;
    
    const analysis = {
      renderPerformance: renderTime < 16 ? 'excellent' : renderTime < 50 ? 'good' : 'needs-optimization',
      memoryPerformance: memoryUsage < 50 ? 'excellent' : memoryUsage < 100 ? 'good' : 'high',
      componentLoad: componentCount < 50 ? 'light' : componentCount < 100 ? 'moderate' : 'heavy',
      renderFrequency: renderCount < 10 ? 'low' : renderCount < 50 ? 'moderate' : 'high'
    };

    return analysis;
  }, [metrics]);

  // Performance tips
  const getPerformanceTips = () => {
    const tips = [];
    
    if (metrics.renderTime > 50) {
      tips.push('Consider memoizing expensive components with React.memo()');
    }
    
    if (metrics.memoryUsage > 100) {
      tips.push('High memory usage detected - check for memory leaks');
    }
    
    if (metrics.componentCount > 100) {
      tips.push('Large component tree - consider code splitting');
    }
    
    if (metrics.renderCount > 100) {
      tips.push('Frequent re-renders - optimize state updates');
    }

    return tips;
  };

  if (!enabled || !showUI) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 font-mono text-xs">
      <div className={`bg-black bg-opacity-90 text-green-400 rounded-lg shadow-lg transition-all duration-300 ${
        isExpanded ? 'w-80' : 'w-20'
      }`}>
        {/* Header */}
        <div 
          className="p-2 cursor-pointer flex items-center justify-between"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span className="font-bold">⚡ PERF</span>
          {!isExpanded && (
            <div className="flex space-x-1">
              <span className={`w-2 h-2 rounded-full ${
                performanceAnalysis.renderPerformance === 'excellent' ? 'bg-green-400' :
                  performanceAnalysis.renderPerformance === 'good' ? 'bg-yellow-400' : 'bg-red-400'
              }`}></span>
              <span className={`w-2 h-2 rounded-full ${
                performanceAnalysis.memoryPerformance === 'excellent' ? 'bg-green-400' :
                  performanceAnalysis.memoryPerformance === 'good' ? 'bg-yellow-400' : 'bg-red-400'
              }`}></span>
            </div>
          )}
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="p-3 pt-0 space-y-3">
            {/* Metrics */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Render Time:</span>
                <span className={
                  performanceAnalysis.renderPerformance === 'excellent' ? 'text-green-400' :
                    performanceAnalysis.renderPerformance === 'good' ? 'text-yellow-400' : 'text-red-400'
                }>
                  {metrics.renderTime}ms
                </span>
              </div>
              
              <div className="flex justify-between">
                <span>Memory:</span>
                <span className={
                  performanceAnalysis.memoryPerformance === 'excellent' ? 'text-green-400' :
                    performanceAnalysis.memoryPerformance === 'good' ? 'text-yellow-400' : 'text-red-400'
                }>
                  {metrics.memoryUsage}MB
                </span>
              </div>
              
              <div className="flex justify-between">
                <span>Components:</span>
                <span className="text-blue-400">{metrics.componentCount}</span>
              </div>
              
              <div className="flex justify-between">
                <span>Renders:</span>
                <span className="text-purple-400">{metrics.renderCount}</span>
              </div>
            </div>

            {/* Performance Indicators */}
            <div className="space-y-1">
              <div className="text-gray-400 text-xs">Performance:</div>
              <div className="flex space-x-2 text-xs">
                <span className={`px-2 py-1 rounded ${
                  performanceAnalysis.renderPerformance === 'excellent' ? 'bg-green-900 text-green-300' :
                    performanceAnalysis.renderPerformance === 'good' ? 'bg-yellow-900 text-yellow-300' : 'bg-red-900 text-red-300'
                }`}>
                  Render: {performanceAnalysis.renderPerformance}
                </span>
                <span className={`px-2 py-1 rounded ${
                  performanceAnalysis.memoryPerformance === 'excellent' ? 'bg-green-900 text-green-300' :
                    performanceAnalysis.memoryPerformance === 'good' ? 'bg-yellow-900 text-yellow-300' : 'bg-red-900 text-red-300'
                }`}>
                  Memory: {performanceAnalysis.memoryPerformance}
                </span>
              </div>
            </div>

            {/* Performance Tips */}
            {getPerformanceTips().length > 0 && (
              <div className="space-y-1">
                <div className="text-gray-400 text-xs">Tips:</div>
                <div className="space-y-1">
                  {getPerformanceTips().slice(0, 2).map((tip, index) => (
                    <div key={index} className="text-xs text-yellow-300 bg-yellow-900 bg-opacity-20 p-1 rounded">
                      💡 {tip}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Last Update */}
            <div className="text-gray-500 text-xs">
              Updated: {new Date(metrics.lastUpdate).toLocaleTimeString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Performance context for sharing metrics across components
export const PerformanceContext = React.createContext({
  metrics: {},
  addMetric: () => {},
  clearMetrics: () => {}
});

export function PerformanceProvider({ children }) {
  const [globalMetrics, setGlobalMetrics] = useState({});

  const addMetric = (componentName, metric) => {
    setGlobalMetrics((prev) => ({
      ...prev,
      [componentName]: {
        ...prev[componentName],
        ...metric,
        lastUpdate: Date.now()
      }
    }));
  };

  const clearMetrics = () => {
    setGlobalMetrics({});
  };

  return (
    <PerformanceContext.Provider value={{
      metrics: globalMetrics,
      addMetric,
      clearMetrics
    }}>
      {children}
    </PerformanceContext.Provider>
  );
}

// Hook for components to report their performance
export const usePerformanceMetrics = (componentName) => {
  const { addMetric } = React.useContext(PerformanceContext);
  const renderStartTime = useRef(Date.now());

  useEffect(() => {
    renderStartTime.current = Date.now();
  });

  const reportMetric = (metricName, value) => {
    addMetric(componentName, { [metricName]: value });
  };

  const reportRenderTime = () => {
    const renderTime = Date.now() - renderStartTime.current;
    reportMetric('renderTime', renderTime);
  };

  return {
    reportMetric,
    reportRenderTime
  };
};

export default PerformanceMonitor; 