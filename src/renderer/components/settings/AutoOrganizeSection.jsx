import React from 'react';

function AutoOrganizeSection({ settings, setSettings }) {
  return (
    <label className="flex items-center gap-5">
      <input
        type="checkbox"
        checked={settings.autoOrganize}
        onChange={(e) =>
          setSettings((prev) => ({
            ...prev,
            autoOrganize: e.target.checked,
          }))
        }
      />
      <span className="text-sm text-system-gray-700">
        Automatically organize new downloads
      </span>
    </label>
  );
}

export default AutoOrganizeSection;
