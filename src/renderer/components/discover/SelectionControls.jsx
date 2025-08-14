import React from 'react';
import Button from '../ui/Button';

function SelectionControls({ onSelectFiles, onSelectFolder, isScanning }) {
  return (
    <div className="flex items-center gap-8 flex-wrap">
      <Button onClick={onSelectFiles} variant="primary" disabled={isScanning}>Select Files</Button>
      <Button onClick={onSelectFolder} variant="secondary" disabled={isScanning}>Scan Folder</Button>
    </div>
  );
}

export default SelectionControls;


