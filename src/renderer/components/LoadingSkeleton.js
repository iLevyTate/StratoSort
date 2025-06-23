import React from 'react';

// Generic skeleton loader
const Skeleton = ({ 
  width = 'w-full', 
  height = 'h-4', 
  className = '', 
  rounded = 'rounded',
  animated = true 
}) => (
  <div 
    className={`
      ${width} ${height} ${rounded} ${className}
      bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200
      ${animated ? 'animate-pulse' : ''}
    `} 
  />
);

// File operation skeleton
export const FileOperationSkeleton = ({ count = 3 }) => (
  <div className="space-y-6">
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 flex-1">
            <Skeleton width="w-10" height="h-10" rounded="rounded-lg" />
            <div className="flex-1 space-y-3">
              <Skeleton width="w-3/4" height="h-5" />
              <Skeleton width="w-1/2" height="h-4" />
            </div>
          </div>
          <div className="flex gap-3">
            <Skeleton width="w-20" height="h-8" rounded="rounded-md" />
            <Skeleton width="w-20" height="h-8" rounded="rounded-md" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

// Smart folder skeleton
export const SmartFolderSkeleton = ({ count = 4 }) => (
  <div className="space-y-6">
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 flex-1">
            <Skeleton width="w-8" height="h-8" rounded="rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton width="w-1/3" height="h-5" />
              <Skeleton width="w-2/3" height="h-4" />
            </div>
          </div>
          <div className="flex gap-3">
            <Skeleton width="w-16" height="h-8" rounded="rounded-md" />
            <Skeleton width="w-16" height="h-8" rounded="rounded-md" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

// File analysis skeleton
export const FileAnalysisSkeleton = ({ count = 5 }) => (
  <div className="space-y-4">
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="card">
        <div className="flex items-start gap-6">
          <Skeleton width="w-12" height="h-12" rounded="rounded-lg" />
          <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton width="w-1/2" height="h-5" />
              <Skeleton width="w-20" height="h-6" rounded="rounded-full" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <Skeleton width="w-16" height="h-4" />
                <Skeleton width="w-40" height="h-8" rounded="rounded-md" />
              </div>
              <div className="flex items-center gap-4">
                <Skeleton width="w-16" height="h-4" />
                <Skeleton width="w-32" height="h-8" rounded="rounded-md" />
              </div>
            </div>
            <div className="flex gap-3">
              <Skeleton width="w-24" height="h-8" rounded="rounded-md" />
              <Skeleton width="w-20" height="h-8" rounded="rounded-md" />
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

// Directory scan skeleton
export const DirectoryScanSkeleton = () => (
  <div className="card text-center">
    <div className="space-y-6">
      <Skeleton width="w-16" height="h-16" rounded="rounded-xl" className="mx-auto" />
      <div className="space-y-3">
        <Skeleton width="w-48" height="h-5" className="mx-auto" />
        <Skeleton width="w-32" height="h-4" className="mx-auto" />
      </div>
      <div className="space-y-2">
        <Skeleton width="w-full" height="h-2" rounded="rounded-full" />
        <Skeleton width="w-24" height="h-4" className="mx-auto" />
      </div>
    </div>
  </div>
);

// Settings form skeleton
export const SettingsFormSkeleton = () => (
  <div className="space-y-8">
    {Array.from({ length: 3 }).map((_, sectionIndex) => (
      <div key={sectionIndex} className="card">
        <div className="space-y-6">
          <Skeleton width="w-48" height="h-6" />
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, fieldIndex) => (
              <div key={fieldIndex} className="space-y-2">
                <Skeleton width="w-32" height="h-4" />
                <Skeleton width="w-full" height="h-10" rounded="rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    ))}
  </div>
);

// Loading overlay for card content
export const LoadingOverlay = ({ message = 'Loading...' }) => {
  return (
    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-xl">
      <div className="text-center space-y-4">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
        <div className="text-sm text-gray-600 font-medium">{message}</div>
      </div>
    </div>
  );
};

export default Skeleton; 