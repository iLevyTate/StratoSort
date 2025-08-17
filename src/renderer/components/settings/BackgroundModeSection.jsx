import React from 'react';

function BackgroundModeSection({ settings, setSettings }) {
  return (
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
      <span className="text-sm text-system-gray-700">
        Keep running in background
      </span>
    </label>
  );
}

export default BackgroundModeSection;
