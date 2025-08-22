import React, { useState, useEffect } from 'react';

function OrganizeButton({
  onClick,
  disabled = false,
  fileCount = 0,
  className = '',
  isLoading = false,
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [pulseAnimation, setPulseAnimation] = useState(false);

  // Add subtle pulse animation when files are ready
  useEffect(() => {
    if (fileCount > 0 && !disabled) {
      const interval = setInterval(() => {
        setPulseAnimation(true);
        setTimeout(() => setPulseAnimation(false), 600);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [fileCount, disabled]);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        relative overflow-hidden rounded-lg transition-all duration-300 
        ${
          disabled || isLoading
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-stratosort-blue to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 active:scale-95'
        }
        ${pulseAnimation && !isLoading ? 'animate-pulse' : ''}
        ${isLoading ? 'animate-pulse' : ''}
        ${className}
      `}
      style={{
        padding: '16px 32px',
        fontSize: '18px',
        fontWeight: '600',
        minHeight: '64px',
        boxShadow: disabled ? 'none' : '0 4px 12px rgba(59, 130, 246, 0.25)',
        transform:
          isHovered && !disabled ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      {/* Background animation */}
      {!disabled && (
        <div
          className={`absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-0 hover:opacity-10 transition-opacity duration-500 ${
            isHovered ? 'animate-pulse' : ''
          }`}
          style={{
            transform: isHovered ? 'translateX(-100%)' : 'translateX(-100%)',
            animation: isHovered ? 'shimmer 1.5s ease-in-out infinite' : 'none',
          }}
        />
      )}

      {/* Content */}
      <div className="relative flex items-center justify-center gap-3">
        {/* Animated spinner icon */}
        <div
          className={`relative w-6 h-6 ${disabled && !isLoading ? '' : 'animate-pulse'}`}
        >
          <div
            className={`absolute inset-0 rounded-full transition-all duration-300 ${
              disabled && !isLoading
                ? 'border-2 border-gray-300'
                : isLoading
                  ? 'border-2 border-blue-300 animate-spin'
                  : `border-2 border-white/30 ${isHovered ? 'animate-spin' : ''}`
            }`}
          >
            <div
              className={`absolute inset-1 rounded-full flex items-center justify-center ${
                disabled && !isLoading
                  ? 'bg-gray-200'
                  : isLoading
                    ? 'bg-blue-100'
                    : 'bg-white/10'
              }`}
            >
              <span className="text-sm">{isLoading ? '⚡' : '✨'}</span>
            </div>
          </div>
        </div>

        {/* Button text */}
        <div className="flex flex-col items-center">
          <span className="text-lg font-semibold">
            {isLoading ? 'Organizing Files...' : 'Organize Files Now'}
          </span>
          {fileCount > 0 && !isLoading && (
            <span
              className={`text-sm font-medium ${disabled ? 'text-gray-400' : 'text-white/80'}`}
            >
              {fileCount} file{fileCount !== 1 ? 's' : ''} ready
            </span>
          )}
          {isLoading && (
            <span className="text-sm font-medium text-gray-500">
              Please wait...
            </span>
          )}
        </div>

        {/* Arrow indicator */}
        <div
          className={`transition-transform duration-300 ${
            isHovered && !disabled ? 'translate-x-1' : 'translate-x-0'
          }`}
        >
          <span className="text-xl">→</span>
        </div>
      </div>

      {/* Progress-style bottom accent */}
      {!disabled && fileCount > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1">
          <div className="h-full bg-gradient-to-r from-yellow-400 to-green-400 opacity-80 animate-pulse" />
        </div>
      )}
    </button>
  );
}

export default OrganizeButton;
