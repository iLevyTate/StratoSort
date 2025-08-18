import React from 'react';

const LoadingSkeleton = ({
  className = '',
  variant = 'default',
  count = 1,
}) => {
  const baseClasses =
    'animate-pulse bg-gradient-to-r from-system-gray-100 to-system-gray-200 rounded';

  const variantClasses = {
    default: 'h-4 w-full',
    title: 'h-8 w-3/4',
    text: 'h-3 w-full',
    card: 'h-32 w-full rounded-lg',
    avatar: 'h-12 w-12 rounded-full',
    button: 'h-10 w-24 rounded-lg',
    input: 'h-10 w-full rounded-lg',
    file: 'h-16 w-full rounded-lg',
    folder: 'h-20 w-full rounded-xl',
  };

  const skeletons = Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      className={`${baseClasses} ${variantClasses[variant] || variantClasses.default} ${className}`}
      aria-hidden="true"
      style={{ animationDelay: `${i * 0.1}s` }}
    />
  ));

  return count > 1 ? (
    <div className="space-y-2">{skeletons}</div>
  ) : (
    skeletons[0]
  );
};

// Composite loading states for common UI patterns
export const FileListSkeleton = ({ count = 5 }) => (
  <div className="space-y-3" role="status" aria-label="Loading files">
    {Array.from({ length: count }, (_, i) => (
      <div
        key={i}
        className="flex items-center gap-3 p-3 bg-white rounded-lg border border-border-light"
      >
        <LoadingSkeleton variant="avatar" />
        <div className="flex-1 space-y-2">
          <LoadingSkeleton className="w-2/3" />
          <LoadingSkeleton variant="text" className="w-1/3" />
        </div>
        <LoadingSkeleton variant="button" />
      </div>
    ))}
    <span className="sr-only">Loading file list...</span>
  </div>
);

export const FolderGridSkeleton = ({ count = 6 }) => (
  <div
    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    role="status"
    aria-label="Loading folders"
  >
    {Array.from({ length: count }, (_, i) => (
      <div
        key={i}
        className="p-4 bg-white rounded-xl border border-border-light"
      >
        <LoadingSkeleton variant="folder" />
        <div className="mt-3 space-y-2">
          <LoadingSkeleton className="w-3/4" />
          <LoadingSkeleton variant="text" />
        </div>
      </div>
    ))}
    <span className="sr-only">Loading folder list...</span>
  </div>
);

export const AnalysisProgressSkeleton = () => (
  <div
    className="p-6 bg-white rounded-xl border border-border-light shadow-sm"
    role="status"
    aria-label="Loading analysis"
  >
    <div className="flex items-center justify-between mb-4">
      <LoadingSkeleton variant="title" className="w-1/3" />
      <LoadingSkeleton variant="button" />
    </div>
    <div className="space-y-3">
      <LoadingSkeleton className="h-2 w-full rounded-full" />
      <div className="flex justify-between">
        <LoadingSkeleton variant="text" className="w-20" />
        <LoadingSkeleton variant="text" className="w-20" />
      </div>
    </div>
    <div className="mt-4 pt-4 border-t border-border-light">
      <LoadingSkeleton variant="text" className="w-2/3" />
    </div>
    <span className="sr-only">Loading analysis progress...</span>
  </div>
);

// Alias for backward compatibility
export const SmartFolderSkeleton = FolderGridSkeleton;

export default LoadingSkeleton;
