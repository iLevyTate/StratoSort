import React from 'react';

function StatusOverview({
  unprocessedCount = 0,
  processedCount = 0,
  failedCount = 0,
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-13">
      <div className="text-center p-13 bg-blue-50 rounded-lg border border-blue-200">
        <div className="text-2xl font-bold text-blue-600">
          {unprocessedCount}
        </div>
        <div className="text-sm text-blue-700">Ready to Organize</div>
      </div>
      <div className="text-center p-13 bg-green-50 rounded-lg border border-green-200">
        <div className="text-2xl font-bold text-green-600">
          {processedCount}
        </div>
        <div className="text-sm text-green-700">Already Organized</div>
      </div>
      <div className="text-center p-13 bg-gray-50 rounded-lg border border-gray-200">
        <div className="text-2xl font-bold text-gray-600">{failedCount}</div>
        <div className="text-sm text-gray-700">Failed Analysis</div>
      </div>
    </div>
  );
}

export default StatusOverview;
