import React from 'react';

const AnalysisDetails = React.memo(function AnalysisDetails({
  analysis,
  options = {},
}) {
  if (!analysis) return null;
  const { showName = true, showCategory = true } = options;
  const hasKeywords =
    Array.isArray(analysis.keywords) && analysis.keywords.length > 0;
  const hasColors =
    Array.isArray(analysis.colors) && analysis.colors.length > 0;
  const displayDate = analysis.date;
  const displayProject = analysis.project;
  const displayPurpose = analysis.purpose;
  const displayContentType = analysis.content_type || analysis.contentType;
  const displayHasText =
    typeof analysis.has_text === 'boolean'
      ? analysis.has_text
      : typeof analysis.hasText === 'boolean'
        ? analysis.hasText
        : undefined;

  return (
    <div className="space-y-3">
      {showName && analysis.suggestedName && (
        <div className="text-sm text-system-gray-700">
          <strong>Suggested Name:</strong>{' '}
          <span className="text-stratosort-blue font-mono">
            {analysis.suggestedName}
          </span>
        </div>
      )}

      {showCategory && analysis.category && (
        <div className="text-sm text-system-gray-700">
          <strong>Category:</strong>{' '}
          <span className="text-stratosort-blue">{analysis.category}</span>
        </div>
      )}

      {displayPurpose && (
        <div className="text-sm text-system-gray-600">
          <strong>Purpose:</strong> {displayPurpose}
        </div>
      )}

      {displayProject && (
        <div className="text-sm text-system-gray-600">
          <strong>Project:</strong> {displayProject}
        </div>
      )}

      {displayDate && (
        <div className="text-sm text-system-gray-600">
          <strong>Date:</strong> {displayDate}
        </div>
      )}

      {hasKeywords && (
        <div className="text-sm text-system-gray-500">
          <strong>Keywords:</strong> {analysis.keywords.join(', ')}
        </div>
      )}

      {typeof analysis.confidence !== 'undefined' &&
        analysis.confidence !== null && (
          <div className="text-xs text-system-gray-400">
            <strong>AI Confidence:</strong> {analysis.confidence}%
          </div>
        )}

      {displayContentType && (
        <div className="text-xs text-system-gray-500">
          <strong>Content Type:</strong> {displayContentType}
        </div>
      )}

      {typeof displayHasText !== 'undefined' && (
        <div className="text-xs text-system-gray-500">
          <strong>Has Text:</strong> {displayHasText ? 'Yes' : 'No'}
        </div>
      )}

      {hasColors && (
        <div className="text-xs text-system-gray-500">
          <strong>Colors:</strong> {analysis.colors.join(', ')}
        </div>
      )}

      {analysis.ocrText && (
        <div className="text-xs text-system-gray-500 line-clamp-2">
          <strong>OCR:</strong> {analysis.ocrText.slice(0, 120)}
          {analysis.ocrText.length > 120 ? '…' : ''}
        </div>
      )}

      {analysis.transcript && (
        <div className="text-xs text-system-gray-500 line-clamp-2">
          <strong>Transcript:</strong> {analysis.transcript.slice(0, 120)}
          {analysis.transcript.length > 120 ? '…' : ''}
        </div>
      )}
    </div>
  );
});

export default AnalysisDetails;
