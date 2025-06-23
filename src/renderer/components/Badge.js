import React from 'react';

const Badge = ({ 
  children, 
  variant = 'default',
  size = 'md',
  dot = false,
  removable = false,
  onRemove,
  className = '',
  ...props 
}) => {
  // Base classes
  const baseClasses = 'inline-flex items-center font-medium rounded-full transition-colors duration-200';
  
  // Variant classes
  const variantClasses = {
    default: 'bg-gray-100 text-gray-700',
    primary: 'bg-blue-100 text-blue-700',
    secondary: 'bg-gray-100 text-gray-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
    // Solid variants
    'primary-solid': 'bg-blue-600 text-white',
    'success-solid': 'bg-green-600 text-white',
    'warning-solid': 'bg-amber-600 text-white',
    'danger-solid': 'bg-red-600 text-white'
  };
  
  // Size classes
  const sizeClasses = {
    xs: 'text-xs px-2 py-0.5 gap-1',
    sm: 'text-xs px-2.5 py-1 gap-1',
    md: 'text-sm px-3 py-1 gap-1.5',
    lg: 'text-base px-4 py-1.5 gap-2'
  };
  
  // Dot size classes
  const dotSizeClasses = {
    xs: 'w-1.5 h-1.5',
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3'
  };
  
  // Combine all classes
  const badgeClasses = `
    ${baseClasses}
    ${variantClasses[variant]}
    ${sizeClasses[size]}
    ${className}
  `.trim();
  
  return (
    <span className={badgeClasses} {...props}>
      {dot && (
        <span className={`${dotSizeClasses[size]} rounded-full bg-current animate-pulse`} />
      )}
      {children}
      {removable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove && onRemove();
          }}
          className="ml-1 -mr-1 hover:opacity-75 focus:outline-none"
          aria-label="Remove"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </span>
  );
};

// Badge Group Component
export const BadgeGroup = ({ children, className = '' }) => {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {children}
    </div>
  );
};

// Status Badge Component
export const StatusBadge = ({ status, ...props }) => {
  const statusConfig = {
    pending: { variant: 'warning', children: 'Pending', dot: true },
    processing: { variant: 'info', children: 'Processing', dot: true },
    completed: { variant: 'success', children: 'Completed' },
    failed: { variant: 'danger', children: 'Failed' },
    cancelled: { variant: 'default', children: 'Cancelled' }
  };
  
  const config = statusConfig[status] || { variant: 'default', children: status };
  
  return <Badge {...config} {...props} />;
};

// File Type Badge Component
export const FileTypeBadge = ({ type, count, ...props }) => {
  const typeConfig = {
    document: { variant: 'primary', icon: '📄' },
    image: { variant: 'success', icon: '🖼️' },
    audio: { variant: 'warning', icon: '🎵' },
    video: { variant: 'danger', icon: '🎬' },
    archive: { variant: 'info', icon: '📦' },
    code: { variant: 'primary-solid', icon: '💻' },
    unknown: { variant: 'default', icon: '❓' }
  };
  
  const config = typeConfig[type] || typeConfig.unknown;
  
  return (
    <Badge variant={config.variant} {...props}>
      <span>{config.icon}</span>
      <span>{type}</span>
      {count !== undefined && <span>({count})</span>}
    </Badge>
  );
};

export default Badge; 