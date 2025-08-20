import React from 'react';

function AutoOrganizeSection({ settings, setSettings }) {
  const updateSetting = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <div className="space-y-4">
      {/* Auto-organize toggle */}
      <label className="flex items-center gap-5">
        <input
          type="checkbox"
          checked={settings.autoOrganize}
          onChange={(e) => updateSetting('autoOrganize', e.target.checked)}
        />
        <span className="text-sm text-system-gray-700">
          Automatically organize new downloads
        </span>
      </label>

      {/* Confidence thresholds */}
      {settings.autoOrganize && (
        <div className="ml-6 space-y-3 p-3 bg-gray-50 rounded-lg">
          <h4 className="text-xs font-medium text-system-gray-600 uppercase tracking-wider">
            Confidence Thresholds
          </h4>

          {/* Auto-approve threshold */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-sm text-system-gray-700">
                Auto-approve confidence
              </label>
              <span className="text-sm font-medium text-stratosort-blue">
                {Math.round((settings.autoApproveThreshold || 0.8) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="100"
              value={Math.round((settings.autoApproveThreshold || 0.8) * 100)}
              onChange={(e) =>
                updateSetting('autoApproveThreshold', e.target.value / 100)
              }
              className="w-full"
            />
            <p className="text-xs text-system-gray-500">
              Files above this confidence are organized automatically
            </p>
          </div>

          {/* Download confidence threshold */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-sm text-system-gray-700">
                Downloads confidence
              </label>
              <span className="text-sm font-medium text-stratosort-blue">
                {Math.round(
                  (settings.downloadConfidenceThreshold || 0.9) * 100,
                )}
                %
              </span>
            </div>
            <input
              type="range"
              min="70"
              max="100"
              value={Math.round(
                (settings.downloadConfidenceThreshold || 0.9) * 100,
              )}
              onChange={(e) =>
                updateSetting(
                  'downloadConfidenceThreshold',
                  e.target.value / 100,
                )
              }
              className="w-full"
            />
            <p className="text-xs text-system-gray-500">
              Higher threshold for automatic download organization
            </p>
          </div>

          {/* Review threshold */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-sm text-system-gray-700">
                Review threshold
              </label>
              <span className="text-sm font-medium text-amber-600">
                {Math.round((settings.reviewThreshold || 0.5) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="30"
              max="80"
              value={Math.round((settings.reviewThreshold || 0.5) * 100)}
              onChange={(e) =>
                updateSetting('reviewThreshold', e.target.value / 100)
              }
              className="w-full"
            />
            <p className="text-xs text-system-gray-500">
              Files below this need manual review
            </p>
          </div>

          {/* Visual confidence guide */}
          <div className="mt-3 p-2 bg-white rounded border border-gray-200">
            <div className="text-xs text-system-gray-600 mb-2">
              Confidence Guide:
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span>≥80% - Auto-organize</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span>50-79% - Review suggested</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <span>&lt;50% - Manual review required</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AutoOrganizeSection;
