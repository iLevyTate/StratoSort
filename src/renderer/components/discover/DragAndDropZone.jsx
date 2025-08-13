import React from 'react';

function DragAndDropZone({ isDragging, dragProps }) {
  return (
    <div
      className={`border-2 border-dashed rounded-lg p-fib-21 text-center transition-colors ${isDragging ? 'border-stratosort-blue bg-stratosort-blue/5' : 'border-system-gray-300'}`}
      {...dragProps}
    >
      <div className="text-2xl mb-fib-5">📥</div>
      <div className="text-sm text-system-gray-600">Drag and drop files here to analyze</div>
    </div>
  );
}

export default DragAndDropZone;


