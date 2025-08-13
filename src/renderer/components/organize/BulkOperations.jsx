import React from 'react';
import Button from '../ui/Button';
import Select from '../ui/Select';

function BulkOperations({
  total,
  selectedCount,
  onSelectAll,
  onApproveSelected,
  bulkEditMode,
  setBulkEditMode,
  bulkCategory,
  setBulkCategory,
  onApplyBulkCategory,
  smartFolders
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-fib-13">
        <input type="checkbox" checked={selectedCount === total && total > 0} onChange={onSelectAll} className="form-checkbox" />
        <span className="text-sm font-medium">{selectedCount > 0 ? `${selectedCount} selected` : 'Select all'}</span>
        {selectedCount > 0 && (
          <div className="flex items-center gap-fib-8">
            <Button onClick={onApproveSelected} variant="primary" className="text-sm">✓ Approve Selected</Button>
            <Button onClick={() => setBulkEditMode(!bulkEditMode)} variant="secondary" className="text-sm">✏️ Bulk Edit</Button>
          </div>
        )}
      </div>
      {bulkEditMode && (
        <div className="flex items-center gap-fib-5">
          <Select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="text-sm">
            <option value="">Select category...</option>
            {smartFolders.map(folder => (<option key={folder.id} value={folder.name}>{folder.name}</option>))}
          </Select>
          <Button onClick={onApplyBulkCategory} variant="primary" className="text-sm" disabled={!bulkCategory}>Apply</Button>
          <Button onClick={() => { setBulkEditMode(false); setBulkCategory(''); }} variant="secondary" className="text-sm">Cancel</Button>
        </div>
      )}
    </div>
  );
}

export default BulkOperations;


