import React, { useState, useEffect, useRef } from 'react';

function AnimatedProgressBar({
  current,
  total,
  label = '',
  showPercentage = true,
  showFraction = true,
  animated = true,
  size = 'medium',
  color = 'blue',
  className = '',
}) {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef();
  const lastProgressRef = useRef(0);

  // Calculate actual progress percentage
  const targetProgress =
    total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;

  // Smooth animation to target progress
  useEffect(() => {
    if (!animated) {
      setDisplayProgress(targetProgress);
      return;
    }

    const startProgress = lastProgressRef.current;
    const difference = targetProgress - startProgress;

    if (Math.abs(difference) < 0.1) {
      setDisplayProgress(targetProgress);
      lastProgressRef.current = targetProgress;
      return;
    }

    setIsAnimating(true);
    const duration = Math.min(1000, Math.max(200, Math.abs(difference) * 20)); // 200ms to 1s based on distance
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const currentValue = startProgress + difference * easeOutCubic;

      setDisplayProgress(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayProgress(targetProgress);
        lastProgressRef.current = targetProgress;
        setIsAnimating(false);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetProgress, animated]);

  // Size configurations
  const sizeConfig = {
    small: {
      height: 'h-1',
      width: 'w-24',
      text: 'text-xs',
      gap: 'gap-2',
    },
    medium: {
      height: 'h-2',
      width: 'w-32',
      text: 'text-sm',
      gap: 'gap-3',
    },
    large: {
      height: 'h-3',
      width: 'w-48',
      text: 'text-base',
      gap: 'gap-4',
    },
  };

  // Color configurations
  const colorConfig = {
    blue: {
      bg: 'bg-stratosort-blue',
      glow: 'shadow-stratosort-blue/30',
      pulse: 'bg-stratosort-blue/20',
    },
    green: {
      bg: 'bg-green-500',
      glow: 'shadow-green-500/30',
      pulse: 'bg-green-500/20',
    },
    yellow: {
      bg: 'bg-yellow-500',
      glow: 'shadow-yellow-500/30',
      pulse: 'bg-yellow-500/20',
    },
    purple: {
      bg: 'bg-purple-500',
      glow: 'shadow-purple-500/30',
      pulse: 'bg-purple-500/20',
    },
  };

  const config = sizeConfig[size];
  const colors = colorConfig[color];

  return (
    <div className={`flex items-center ${config.gap} ${className}`}>
      {/* Label */}
      {label && (
        <span className={`${config.text} text-system-gray-700 font-medium`}>
          {label}
        </span>
      )}

      {/* Progress Bar Container */}
      <div className="flex items-center gap-2 flex-1">
        {/* Progress Bar */}
        <div
          className={`${config.width} ${config.height} bg-system-gray-200 rounded-full overflow-hidden relative`}
        >
          {/* Background pulse animation when animating */}
          {isAnimating && (
            <div
              className={`absolute inset-0 ${colors.pulse} animate-pulse rounded-full`}
            />
          )}

          {/* Progress Fill */}
          <div
            className={`${config.height} ${colors.bg} transition-all duration-300 ease-out relative overflow-hidden`}
            style={{ width: `${displayProgress}%` }}
          >
            {/* Animated shine effect */}
            {isAnimating && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
            )}

            {/* Subtle glow effect */}
            <div
              className={`absolute inset-0 ${colors.bg} shadow-lg ${colors.glow}`}
            />
          </div>

          {/* Completion particles effect */}
          {displayProgress >= 100 && animated && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-1 h-1 bg-white rounded-full animate-ping" />
            </div>
          )}
        </div>

        {/* Percentage Display */}
        {showPercentage && (
          <div
            className={`${config.text} text-system-gray-600 font-mono min-w-[3ch] text-right`}
          >
            {Math.round(displayProgress)}%
          </div>
        )}

        {/* Fraction Display */}
        {showFraction && total > 0 && (
          <div className={`${config.text} text-system-gray-500 font-mono`}>
            {current}/{total}
          </div>
        )}
      </div>

      {/* Animated status indicator */}
      {isAnimating && (
        <div className="flex items-center gap-1">
          <div
            className={`w-1 h-1 ${colors.bg} rounded-full animate-bounce`}
            style={{ animationDelay: '0ms' }}
          />
          <div
            className={`w-1 h-1 ${colors.bg} rounded-full animate-bounce`}
            style={{ animationDelay: '150ms' }}
          />
          <div
            className={`w-1 h-1 ${colors.bg} rounded-full animate-bounce`}
            style={{ animationDelay: '300ms' }}
          />
        </div>
      )}
    </div>
  );
}

export default AnimatedProgressBar;
