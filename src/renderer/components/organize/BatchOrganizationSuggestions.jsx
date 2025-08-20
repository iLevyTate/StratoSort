import React, { useState } from 'react';
import { Card, Button } from '../ui';

function BatchOrganizationSuggestions({
  batchSuggestions,
  onAcceptStrategy,
  onCustomizeGroup,
  onRejectAll,
}) {
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [selectedStrategy, setSelectedStrategy] = useState(null);

  if (!batchSuggestions || !batchSuggestions.groups) {
    return null;
  }

  const { groups, patterns, recommendations, suggestedStrategy } =
    batchSuggestions;

  const toggleGroup = (groupIndex) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupIndex)) {
      newExpanded.delete(groupIndex);
    } else {
      newExpanded.add(groupIndex);
    }
    setExpandedGroups(newExpanded);
  };

  const handleStrategyAccept = () => {
    if (onAcceptStrategy) {
      onAcceptStrategy(selectedStrategy || suggestedStrategy);
    }
  };

  return (
    <div className="space-y-6">
      {/* Pattern Analysis */}
      {patterns && (
        <Card className="p-4 bg-blue-50 border-stratosort-blue/30">
          <h3 className="font-medium text-system-gray-900 mb-3">
            Pattern Analysis
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {patterns.hasCommonProject && (
              <div>
                <span className="text-system-gray-600">Common Project:</span>
                <span className="ml-2 font-medium">{patterns.project}</span>
              </div>
            )}
            {patterns.dominantCategory && (
              <div>
                <span className="text-system-gray-600">Main Category:</span>
                <span className="ml-2 font-medium">
                  {patterns.dominantCategory}
                </span>
              </div>
            )}
            {patterns.fileTypes && patterns.fileTypes.length > 0 && (
              <div>
                <span className="text-system-gray-600">File Types:</span>
                <span className="ml-2">{patterns.fileTypes.join(', ')}</span>
              </div>
            )}
            {patterns.commonTerms && patterns.commonTerms.length > 0 && (
              <div className="col-span-2">
                <span className="text-system-gray-600">Common Terms:</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {patterns.commonTerms.map((term) => (
                    <span
                      key={term}
                      className="px-2 py-1 bg-white rounded text-xs"
                    >
                      {term}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <Card className="p-4 border-green-200 bg-green-50">
          <h3 className="font-medium text-system-gray-900 mb-3">
            Recommendations
          </h3>
          <div className="space-y-3">
            {recommendations.map((rec, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="mt-1">
                  {rec.confidence >= 0.8
                    ? '✅'
                    : rec.confidence >= 0.5
                      ? '💡'
                      : 'ℹ️'}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm">{rec.description}</div>
                  <div className="text-xs text-system-gray-600 mt-1">
                    {rec.suggestion}
                  </div>
                  <div className="text-xs text-system-gray-500 mt-1">
                    Confidence: {Math.round(rec.confidence * 100)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Suggested Strategy */}
      {suggestedStrategy && (
        <Card className="p-4 border-stratosort-blue/50 bg-stratosort-blue/5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-system-gray-900">
              Suggested Organization Strategy
            </h3>
            <span className="text-sm text-stratosort-blue">
              {Math.round((suggestedStrategy.score || 0) * 100)}% Match
            </span>
          </div>
          <div className="mb-4">
            <div className="font-medium">{suggestedStrategy.name}</div>
            <div className="text-sm text-system-gray-600 mt-1">
              {suggestedStrategy.description}
            </div>
            <div className="text-xs text-system-gray-500 mt-2">
              Pattern:{' '}
              <code className="bg-white px-2 py-1 rounded">
                {suggestedStrategy.pattern}
              </code>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={handleStrategyAccept}
              className="bg-stratosort-blue hover:bg-stratosort-blue/90"
            >
              Apply This Strategy
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelectedStrategy(null)}
            >
              Choose Different
            </Button>
          </div>
        </Card>
      )}

      {/* File Groups */}
      <div>
        <h3 className="font-medium text-system-gray-900 mb-3">
          Suggested File Groups ({groups.length})
        </h3>
        <div className="space-y-3">
          {groups.map((group, groupIndex) => (
            <Card key={groupIndex} className="overflow-hidden">
              <div
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleGroup(groupIndex)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`transform transition-transform ${
                        expandedGroups.has(groupIndex) ? 'rotate-90' : ''
                      }`}
                    >
                      ▶
                    </span>
                    <div>
                      <div className="font-medium">{group.folder}</div>
                      <div className="text-sm text-system-gray-600">
                        {group.files.length} file
                        {group.files.length !== 1 ? 's' : ''}
                        {group.confidence && (
                          <span className="ml-2">
                            • {Math.round(group.confidence * 100)}% confidence
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCustomizeGroup(groupIndex, group);
                    }}
                    className="text-stratosort-blue"
                  >
                    Customize
                  </Button>
                </div>
              </div>

              {expandedGroups.has(groupIndex) && (
                <div className="border-t border-gray-200 p-4 bg-gray-50">
                  <div className="space-y-2">
                    {group.files.map((file, fileIndex) => (
                      <div
                        key={fileIndex}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-system-gray-500">📄</span>
                          <span>{file.name}</span>
                        </div>
                        {file.suggestion && (
                          <span className="text-xs text-system-gray-500">
                            {Math.round(
                              (file.suggestion.confidence || 0) * 100,
                            )}
                            % match
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {group.files[0]?.alternatives &&
                    group.files[0].alternatives.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="text-xs text-system-gray-600 mb-2">
                          Alternative folders for this group:
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {group.files[0].alternatives
                            .slice(0, 3)
                            .map((alt, altIndex) => (
                              <button
                                key={altIndex}
                                className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:border-stratosort-blue transition-colors"
                                onClick={() =>
                                  onCustomizeGroup(groupIndex, {
                                    ...group,
                                    folder: alt.folder,
                                  })
                                }
                              >
                                {alt.folder}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t">
        <Button variant="secondary" onClick={onRejectAll}>
          Cancel Batch Organization
        </Button>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => console.log('Preview organization')}
          >
            Preview Changes
          </Button>
          <Button
            variant="primary"
            onClick={handleStrategyAccept}
            className="bg-stratosort-blue hover:bg-stratosort-blue/90"
          >
            Apply All Suggestions
          </Button>
        </div>
      </div>
    </div>
  );
}

export default BatchOrganizationSuggestions;
