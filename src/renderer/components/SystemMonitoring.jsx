import React, { useEffect, useState } from 'react';

function SystemMonitoring() {
  const [systemMetrics, setSystemMetrics] = useState({
    uptime: 0,
    cpu: 0,
    memory: { used: 0, total: 0 },
    disk: { used: 0, total: 0 },
  });
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    let intervalId;
    const startMonitoring = async () => {
      setIsMonitoring(true);
      try {
        const metrics = await window.electronAPI.system.getMetrics();
        setSystemMetrics(metrics);
        intervalId = setInterval(async () => {
          try {
            const updatedMetrics = await window.electronAPI.system.getMetrics();
            setSystemMetrics(updatedMetrics);
          } catch (error) {
            console.warn('Failed to update system metrics:', error);
          }
        }, 5000);
      } catch (error) {
        console.error('Failed to start system monitoring:', error);
        setIsMonitoring(false);
      }
    };
    startMonitoring();
    return () => {
      if (intervalId) clearInterval(intervalId);
      setIsMonitoring(false);
    };
  }, []);

  if (!isMonitoring) {
    return (
      <div className="text-sm text-system-gray-500">
        System monitoring unavailable
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h4 className="font-medium text-system-gray-700">📊 System Status</h4>
      <div className="grid grid-cols-2 gap-8 text-sm">
        <div>
          <span className="text-system-gray-600">CPU:</span>
          <span className="ml-2 font-medium">
            {systemMetrics.cpu?.toFixed(1) || 0}%
          </span>
        </div>
        <div>
          <span className="text-system-gray-600">Memory:</span>
          <span className="ml-2 font-medium">
            {systemMetrics.memory?.used || 0} /{' '}
            {systemMetrics.memory?.total || 0} MB
          </span>
        </div>
        <div>
          <span className="text-system-gray-600">Uptime:</span>
          <span className="ml-2 font-medium">
            {Math.floor((systemMetrics.uptime || 0) / 60)}m
          </span>
        </div>
        <div>
          <span className="text-system-gray-600">Disk:</span>
          <span className="ml-2 font-medium">
            {((systemMetrics.disk?.used || 0) / (1024 * 1024 * 1024)).toFixed(
              1,
            )}
            GB used
          </span>
        </div>
      </div>
    </div>
  );
}

export default SystemMonitoring;
