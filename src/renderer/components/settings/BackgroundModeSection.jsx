import React from 'react';

function BackgroundModeSection({ settings, setSettings }) {
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-5">
        <input
          type="checkbox"
          checked={settings.backgroundMode}
          onChange={(e) =>
            setSettings((prev) => ({
              ...prev,
              backgroundMode: e.target.checked,
            }))
          }
        />
        <div>
          <span className="text-sm text-system-gray-700 font-medium">
            Keep running in background
          </span>
          <p className="text-xs text-system-gray-500 mt-1">
            When enabled, closing the window will minimize to system tray
            instead of quitting
          </p>
        </div>
      </label>

      <label className="flex items-center gap-5">
        <input
          type="checkbox"
          checked={settings.launchOnStartup}
          onChange={(e) =>
            setSettings((prev) => ({
              ...prev,
              launchOnStartup: e.target.checked,
            }))
          }
        />
        <div>
          <span className="text-sm text-system-gray-700 font-medium">
            Launch on system startup
          </span>
          <p className="text-xs text-system-gray-500 mt-1">
            Automatically start StratoSort when your computer boots up
            {settings.backgroundMode ? ' (will start hidden in tray)' : ''}
          </p>
        </div>
      </label>

      {(settings.backgroundMode || settings.launchOnStartup) && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-2">
            <span className="text-blue-600 text-lg">💡</span>
            <div>
              <h4 className="text-sm font-medium text-blue-900">
                Background Mode Tips
              </h4>
              <ul className="text-xs text-blue-700 mt-1 space-y-1">
                <li>• Click the tray icon to show/hide the window</li>
                <li>• Right-click the tray icon for quick actions</li>
                <li>• Auto-organize will continue running in the background</li>
                {settings.launchOnStartup && (
                  <li>• App will start automatically with your computer</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BackgroundModeSection;
