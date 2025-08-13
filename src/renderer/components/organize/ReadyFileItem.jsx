import React from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';

function ReadyFileItem({
  file,
  index,
  isSelected,
  onToggleSelected,
  stateDisplay,
  smartFolders,
  editing,
  onEdit,
  destination,
  category: categoryProp
}) {
  const analysis = editing?.analysis || file?.analysis;
  const suggestedName = editing?.suggestedName ?? analysis?.suggestedName;
  const category = categoryProp ?? editing?.category ?? analysis?.category;

  return (
    <div className={`border rounded-lg p-fib-13 transition-all duration-200 ${isSelected ? 'border-stratosort-blue bg-stratosort-blue/5' : 'border-system-gray-200'}`}>
      <div className="flex items-start gap-fib-13">
        <input type="checkbox" checked={isSelected} onChange={() => onToggleSelected(index)} className="form-checkbox mt-fib-3" />
        <div className="flex-1">
          <div className="flex items-center gap-fib-8 mb-fib-5">
            <div className="text-2xl">📄</div>
            <div>
              <div className="font-medium text-system-gray-900">{file.name}</div>
              <div className="text-sm text-system-gray-500">{file.size ? `${Math.round(file.size / 1024)} KB` : 'Unknown size'} • {file.source?.replace('_', ' ')}</div>
            </div>
          </div>
          {analysis ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-fib-8 mb-fib-8">
                <div>
                  <label className="block text-xs font-medium text-system-gray-700 mb-fib-2">Suggested Name</label>
                  <Input type="text" value={suggestedName} onChange={(e) => onEdit(index, 'suggestedName', e.target.value)} className="text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-system-gray-700 mb-fib-2">Category</label>
                  <Select value={category} onChange={(e) => onEdit(index, 'category', e.target.value)} className="text-sm">
                    {smartFolders.map(folder => (<option key={folder.id} value={folder.name}>{folder.name}</option>))}
                  </Select>
                </div>
              </div>
              {destination && (
                <div className="text-sm text-system-gray-600"><strong>Destination:</strong> <span className="text-stratosort-blue">{destination}</span></div>
              )}
            </>
          ) : (
            <div className="text-sm text-system-red-600 mt-fib-3">Analysis failed - will be skipped</div>
          )}
        </div>
        <div className={`text-sm font-medium flex items-center gap-fib-3 ${stateDisplay.color}`}>
          <span className={stateDisplay.spinning ? 'animate-spin' : ''}>{stateDisplay.icon}</span>
          <span>{stateDisplay.label}</span>
        </div>
      </div>
    </div>
  );
}

export default ReadyFileItem;


