import React from 'react';

const LoadingSkeleton = ({ 
  type = 'text', 
  count = 1, 
  className = '',
  animate = true,
  label = 'Loading content'
}) => {
  const getSkeletonClasses = () => {
    const baseClasses = `bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded`;
    const animationClasses = animate ? 'animate-pulse bg-gradient-shimmer' : '';
    return `${baseClasses} ${animationClasses}`;
  };

  const renderSkeleton = () => {
    switch (type) {
      case 'text':
        return (
          <div className="space-y-2">
            {Array.from({ length: count }).map((_, index) => (
              <div
                key={index}
                className={`${getSkeletonClasses()} h-4 w-full ${className}`}
                style={{
                  width: index === count - 1 ? '75%' : '100%' // Last line shorter
                }}
                aria-hidden="true"
              />
            ))}
          </div>
        );

      case 'card':
        return (
          <div className={`glass-card p-4 space-y-3 ${className}`}>
            {/* Header */}
            <div className="flex items-center space-x-3">
              <div className={`${getSkeletonClasses()} h-10 w-10 rounded-full`} aria-hidden="true" />
              <div className="space-y-2 flex-1">
                <div className={`${getSkeletonClasses()} h-4 w-3/4`} aria-hidden="true" />
                <div className={`${getSkeletonClasses()} h-3 w-1/2`} aria-hidden="true" />
              </div>
            </div>
            
            {/* Content */}
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className={`${getSkeletonClasses()} h-3`}
                  style={{
                    width: index === 2 ? '60%' : '100%'
                  }}
                  aria-hidden="true"
                />
              ))}
            </div>
            
            {/* Footer */}
            <div className="flex justify-between items-center pt-2">
              <div className={`${getSkeletonClasses()} h-8 w-20 rounded-md`} aria-hidden="true" />
              <div className={`${getSkeletonClasses()} h-8 w-16 rounded-md`} aria-hidden="true" />
            </div>
          </div>
        );

      case 'file':
        return (
          <div className={`glass-card p-3 space-y-2 ${className}`}>
            <div className="flex items-center space-x-3">
              {/* File icon */}
              <div className={`${getSkeletonClasses()} h-8 w-8 rounded`} aria-hidden="true" />
              
              {/* File details */}
              <div className="flex-1 space-y-1">
                <div className={`${getSkeletonClasses()} h-4 w-full`} aria-hidden="true" />
                <div className={`${getSkeletonClasses()} h-3 w-2/3`} aria-hidden="true" />
              </div>
              
              {/* Status indicator */}
              <div className={`${getSkeletonClasses()} h-6 w-16 rounded-full`} aria-hidden="true" />
            </div>
          </div>
        );

      case 'button':
        return (
          <div className={`${getSkeletonClasses()} h-10 w-24 rounded-md ${className}`} aria-hidden="true" />
        );

      case 'avatar':
        return (
          <div className={`${getSkeletonClasses()} h-10 w-10 rounded-full ${className}`} aria-hidden="true" />
        );

      case 'table':
        return (
          <div className={`space-y-2 ${className}`}>
            {/* Header */}
            <div className="flex space-x-4 pb-2 border-b border-gray-200">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className={`${getSkeletonClasses()} h-4 flex-1`}
                  aria-hidden="true"
                />
              ))}
            </div>
            
            {/* Rows */}
            {Array.from({ length: count }).map((_, rowIndex) => (
              <div key={rowIndex} className="flex space-x-4 py-2">
                {Array.from({ length: 4 }).map((_, colIndex) => (
                  <div
                    key={colIndex}
                    className={`${getSkeletonClasses()} h-3 flex-1`}
                    aria-hidden="true"
                  />
                ))}
              </div>
            ))}
          </div>
        );

      case 'list':
        return (
          <div className={`space-y-3 ${className}`}>
            {Array.from({ length: count }).map((_, index) => (
              <div key={index} className="flex items-center space-x-3">
                <div className={`${getSkeletonClasses()} h-6 w-6 rounded`} aria-hidden="true" />
                <div className="flex-1 space-y-1">
                  <div className={`${getSkeletonClasses()} h-4 w-full`} aria-hidden="true" />
                  <div className={`${getSkeletonClasses()} h-3 w-3/4`} aria-hidden="true" />
                </div>
              </div>
            ))}
          </div>
        );

      case 'progress':
        return (
          <div className={`space-y-2 ${className}`}>
            <div className="flex justify-between items-center">
              <div className={`${getSkeletonClasses()} h-4 w-1/3`} aria-hidden="true" />
              <div className={`${getSkeletonClasses()} h-4 w-12`} aria-hidden="true" />
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-300 h-2 rounded-full animate-pulse"
                style={{ width: '45%' }}
                aria-hidden="true"
              />
            </div>
          </div>
        );

      default:
        return (
          <div className={`${getSkeletonClasses()} h-4 w-full ${className}`} aria-hidden="true" />
        );
    }
  };

  return (
    <div 
      role="status" 
      aria-label={label}
      aria-live="polite"
      className="animate-fade-in"
    >
      {renderSkeleton()}
      <span className="sr-only">{label}</span>
      
      <style jsx>{`
        @keyframes gradient-shimmer {
          0% {
            background-position: -200px 0;
          }
          100% {
            background-position: calc(200px + 100%) 0;
          }
        }
        
        .bg-gradient-shimmer {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200px 100%;
          animation: gradient-shimmer 1.5s infinite;
        }
        
        @media (prefers-reduced-motion: reduce) {
          .bg-gradient-shimmer {
            animation: none;
            background: #f0f0f0;
          }
        }
      `}</style>
    </div>
  );
};

// Specialized loading components for common use cases
export const FileListSkeleton = ({ count = 5 }) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, index) => (
      <LoadingSkeleton 
        key={index} 
        type="file" 
        label={`Loading file ${index + 1} of ${count}`}
      />
    ))}
  </div>
);

export const AnalysisProgressSkeleton = () => (
  <div className="glass-card p-4 space-y-4">
    <LoadingSkeleton type="progress" label="Loading analysis progress" />
    <LoadingSkeleton type="text" count={2} label="Loading analysis details" />
    <div className="flex justify-between">
      <LoadingSkeleton type="button" className="w-20" />
      <LoadingSkeleton type="button" className="w-24" />
    </div>
  </div>
);

export const SmartFoldersSkeleton = ({ count = 3 }) => (
  <div className="grid gap-3">
    {Array.from({ length: count }).map((_, index) => (
      <LoadingSkeleton 
        key={index} 
        type="card" 
        label={`Loading smart folder ${index + 1} of ${count}`}
      />
    ))}
  </div>
);

export default LoadingSkeleton; 