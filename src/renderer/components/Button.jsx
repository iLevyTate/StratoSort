import React from 'react';

function Button({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  disabled = false, 
  loading = false,
  icon = null,
  iconPosition = 'left',
  fullWidth = false,
  className = '',
  onClick,
  ...props 
}) {
  // Base classes
  const baseClasses = 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  // Variant classes
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 shadow-md hover:shadow-lg',
    secondary: 'glass-button text-on-glass hover:bg-white/30 focus:ring-blue-500',
    success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 shadow-md hover:shadow-lg',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-md hover:shadow-lg',
    warning: 'bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500 shadow-md hover:shadow-lg',
    ghost: 'text-on-glass hover:bg-white/10 focus:ring-blue-500',
    link: 'text-blue-600 hover:text-blue-700 underline-offset-4 hover:underline focus:ring-blue-500'
  };
  
  // Size classes
  const sizeClasses = {
    xs: 'text-xs px-2.5 py-1.5 rounded-md gap-1',
    sm: 'text-sm px-3 py-2 rounded-md gap-1.5',
    md: 'text-sm px-4 py-2.5 rounded-lg gap-2',
    lg: 'text-base px-6 py-3 rounded-lg gap-2.5',
    xl: 'text-lg px-8 py-4 rounded-xl gap-3'
  };
  
  // Width classes
  const widthClasses = fullWidth ? 'w-full' : '';
  
  // Combine all classes
  const buttonClasses = `
    ${baseClasses}
    ${variantClasses[variant]}
    ${sizeClasses[size]}
    ${widthClasses}
    ${className}
  `.trim();
  
  // Loading spinner
  function LoadingSpinner() {
    return <svg 
      className="animate-spin h-4 w-4" 
      xmlns="http://www.w3.org/2000/svg" 
      fill="none" 
      viewBox="0 0 24 24"
    >
      <circle 
        className="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        strokeWidth="4"
      />
      <path 
        className="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>;
  }
  
  return (
    <button
      className={buttonClasses}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading && iconPosition === 'left' && <LoadingSpinner />}
      {!loading && icon && iconPosition === 'left' && <span>{icon}</span>}
      {children}
      {!loading && icon && iconPosition === 'right' && <span>{icon}</span>}
      {loading && iconPosition === 'right' && <LoadingSpinner />}
    </button>
  );
}

// Button Group Component
export function ButtonGroup({ children, className = '' }) {
  return (
    <div className={`inline-flex rounded-lg shadow-sm ${className}`} role="group">
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child;
        
        const isFirst = index === 0;
        const isLast = index === React.Children.count(children) - 1;
        
        return React.cloneElement(child, {
          className: `${child.props.className || ''} ${
            !isFirst && !isLast ? 'rounded-none border-x-0' : ''
          } ${isFirst ? 'rounded-r-none' : ''} ${isLast ? 'rounded-l-none' : ''}`.trim()
        });
      })}
    </div>
  );
}

export default Button; 