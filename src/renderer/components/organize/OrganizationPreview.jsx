import React, { useState, useEffect } from 'react';
import { Card, Button } from '../ui';

function OrganizationPreview({
  files,
  strategy,
  suggestions,
  onConfirm,
  onCancel,
}) {
  const [previewTree, setPreviewTree] = useState({});
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [stats, setStats] = useState({
    totalFiles: 0,
    totalFolders: 0,
    movedFiles: 0,
    renamedFiles: 0,
  });

  useEffect(() => {
    if (!files || !suggestions) return;

    // Build preview tree structure
    const tree = {};
    const folderCount = new Set();
    let movedCount = 0;
    let renamedCount = 0;

    files.forEach((file, index) => {
      const suggestion = suggestions[index] || suggestions.primary;
      if (!suggestion) return;

      const folderPath = suggestion.path || suggestion.folder;
      const newName = suggestion.suggestedName || file.name;

      if (!tree[folderPath]) {
        tree[folderPath] = {
          name: suggestion.folder,
          path: folderPath,
          files: [],
          confidence: 0,
        };
        folderCount.add(folderPath);
      }

      tree[folderPath].files.push({
        original: file,
        newName,
        renamed: newName !== file.name,
        moved: true, // Assuming all files in preview are being moved
      });

      tree[folderPath].confidence =
        (tree[folderPath].confidence + (suggestion.confidence || 0.5)) / 2;

      movedCount++;
      if (newName !== file.name) renamedCount++;
    });

    setPreviewTree(tree);
    setStats({
      totalFiles: files.length,
      totalFolders: folderCount.size,
      movedFiles: movedCount,
      renamedFiles: renamedCount,
    });

    // Auto-expand folders with high confidence
    const toExpand = new Set();
    Object.entries(tree).forEach(([path, folder]) => {
      if (folder.confidence > 0.7 || folder.files.length <= 5) {
        toExpand.add(path);
      }
    });
    setExpandedFolders(toExpand);
  }, [files, suggestions]);

  const toggleFolder = (folderPath) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath);
    } else {
      newExpanded.add(folderPath);
    }
    setExpandedFolders(newExpanded);
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50';
    if (confidence >= 0.5) return 'text-yellow-600 bg-yellow-50';
    return 'text-orange-600 bg-orange-50';
  };

  return (
    <div className="space-y-4">
      {/* Header with Strategy Info */}
      {strategy && (
        <Card className="p-4 bg-stratosort-blue/5 border-stratosort-blue/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-system-gray-900">
                Organization Preview: {strategy.name}
              </h3>
              <p className="text-sm text-system-gray-600 mt-1">
                {strategy.description}
              </p>
            </div>
            <div className="text-sm text-system-gray-500">
              Pattern:{' '}
              <code className="bg-white px-2 py-1 rounded">
                {strategy.pattern}
              </code>
            </div>
          </div>
        </Card>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-3 text-center">
          <div className="text-2xl font-semibold text-stratosort-blue">
            {stats.totalFiles}
          </div>
          <div className="text-xs text-system-gray-600">Total Files</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-2xl font-semibold text-green-600">
            {stats.totalFolders}
          </div>
          <div className="text-xs text-system-gray-600">Target Folders</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-2xl font-semibold text-blue-600">
            {stats.movedFiles}
          </div>
          <div className="text-xs text-system-gray-600">Files to Move</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-2xl font-semibold text-purple-600">
            {stats.renamedFiles}
          </div>
          <div className="text-xs text-system-gray-600">Files to Rename</div>
        </Card>
      </div>

      {/* Preview Tree */}
      <Card className="p-4">
        <h4 className="font-medium text-system-gray-900 mb-3">
          Preview of Organization Structure
        </h4>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {Object.entries(previewTree).map(([folderPath, folder]) => (
            <div key={folderPath} className="border rounded-lg overflow-hidden">
              <div
                className="p-3 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between"
                onClick={() => toggleFolder(folderPath)}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`transform transition-transform ${
                      expandedFolders.has(folderPath) ? 'rotate-90' : ''
                    }`}
                  >
                    ▶
                  </span>
                  <span className="text-yellow-600">📁</span>
                  <span className="font-medium">{folder.name}</span>
                  <span className="text-sm text-system-gray-500">
                    ({folder.files.length} files)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-1 rounded ${getConfidenceColor(
                      folder.confidence,
                    )}`}
                  >
                    {Math.round(folder.confidence * 100)}% match
                  </span>
                  <span className="text-xs text-system-gray-400">
                    {folderPath}
                  </span>
                </div>
              </div>

              {expandedFolders.has(folderPath) && (
                <div className="border-t bg-gray-50 p-3">
                  <div className="space-y-1">
                    {folder.files.map((fileInfo, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between text-sm py-1"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-system-gray-400">└─</span>
                          <span className="text-blue-600">📄</span>
                          <div className="flex flex-col">
                            {fileInfo.renamed ? (
                              <>
                                <span className="line-through text-system-gray-400">
                                  {fileInfo.original.name}
                                </span>
                                <span className="text-green-600">
                                  → {fileInfo.newName}
                                </span>
                              </>
                            ) : (
                              <span>{fileInfo.original.name}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {fileInfo.renamed && (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                              Renamed
                            </span>
                          )}
                          {fileInfo.moved && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                              Moved
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Visual Tree Diagram */}
      <Card className="p-4 bg-gray-50">
        <h4 className="font-medium text-system-gray-900 mb-3">
          Folder Structure Visualization
        </h4>
        <div className="font-mono text-sm">
          <div className="text-system-gray-700">📁 Documents</div>
          {Object.entries(previewTree).map(([folderPath, folder]) => {
            const depth = folderPath.split('/').length - 1;
            const indent = '  '.repeat(depth);
            return (
              <div key={folderPath}>
                <div className="text-system-gray-600">
                  {indent}└─ 📁 {folder.name}
                  <span className="text-xs text-system-gray-400 ml-2">
                    ({folder.files.length})
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Comparison View */}
      <Card className="p-4">
        <h4 className="font-medium text-system-gray-900 mb-3">
          Before & After Comparison
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h5 className="text-sm font-medium text-system-gray-700 mb-2">
              Current State
            </h5>
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm">
              <div className="text-red-700 font-medium mb-2">
                ❌ Disorganized
              </div>
              <ul className="space-y-1 text-red-600">
                <li>• All files in one location</li>
                <li>• No clear categorization</li>
                <li>• Difficult to find related files</li>
                <li>• Inconsistent naming</li>
              </ul>
            </div>
          </div>
          <div>
            <h5 className="text-sm font-medium text-system-gray-700 mb-2">
              After Organization
            </h5>
            <div className="bg-green-50 border border-green-200 rounded p-3 text-sm">
              <div className="text-green-700 font-medium mb-2">
                ✅ Well-Organized
              </div>
              <ul className="space-y-1 text-green-600">
                <li>• Files sorted into {stats.totalFolders} folders</li>
                <li>• Clear categorization by {strategy?.name || 'purpose'}</li>
                <li>• Easy to locate related content</li>
                <li>• Consistent naming convention</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex justify-between items-center pt-4 border-t">
        <div className="text-sm text-system-gray-600">
          Review the preview above before confirming the organization
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            className="bg-stratosort-blue hover:bg-stratosort-blue/90"
          >
            Confirm & Organize
          </Button>
        </div>
      </div>
    </div>
  );
}

export default OrganizationPreview;
