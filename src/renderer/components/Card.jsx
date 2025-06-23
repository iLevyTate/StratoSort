import React from 'react';

function Card({ 
  children, 
  title,
  subtitle,
  icon,
  actions,
  variant = 'default',
  padding = 'md',
  hoverable = false,
  className = '',
  onClick,
  ...props 
}) {
  // Base classes
  const baseClasses = 'glass-card rounded-xl transition-all duration-200';
  
  // Variant classes
  const variantClasses = {
    default: 'shadow-md',
    elevated: 'shadow-lg',
    outlined: 'border-2 border-white/30',
    filled: 'bg-white/10 shadow-sm',
    gradient: 'bg-gradient-to-br from-white/20 to-white/10 shadow-md',
    glass: 'glass-morphism shadow-lg'
  };
  
  // Padding classes
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
    xl: 'p-10'
  };
  
  // Hover classes
  const hoverClasses = hoverable ? 'hover:shadow-xl hover:scale-[1.02] cursor-pointer' : '';
  
  // Combine all classes
  const cardClasses = `
    ${baseClasses}
    ${variantClasses[variant]}
    ${paddingClasses[padding]}
    ${hoverClasses}
    ${className}
  `.trim();
  
  return (
    <div 
      className={cardClasses} 
      onClick={onClick}
      {...props}
    >
      {(title || subtitle || icon || actions) && (
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            {icon && (
              <div className="flex-shrink-0">
                {typeof icon === 'string' ? (
                  <span className="text-2xl">{icon}</span>
                ) : (
                  icon
                )}
              </div>
            )}
            <div>
              {title && (
                <h3 className="text-lg font-semibold text-gray-900">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-sm text-gray-500 mt-1">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex-shrink-0">
              {actions}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

// Card Section Component
export function CardSection({ 
  children, 
  title, 
  className = '' 
}) {
  return (
    <div className={`${className}`}>
      {title && (
        <h4 className="text-sm font-medium text-gray-700 mb-3">
          {title}
        </h4>
      )}
      <div className="space-y-2">
        {children}
      </div>
    </div>
  );
}

// Card Grid Component
export function CardGrid({ 
  children, 
  columns = 3,
  gap = 'md',
  className = '' 
}) {
  const columnClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
  };
  
  const gapClasses = {
    sm: 'gap-4',
    md: 'gap-6',
    lg: 'gap-8'
  };
  
  return (
    <div className={`grid ${columnClasses[columns]} ${gapClasses[gap]} ${className}`}>
      {children}
    </div>
  );
}

// Interactive Card Component
export function InteractiveCard({ 
  children,
  selected = false,
  onSelect,
  ...props 
}) {
  return (
    <Card
      {...props}
      hoverable
      onClick={onSelect}
      className={`
        ${props.className || ''}
        ${selected ? 'ring-2 ring-blue-500 bg-blue-50' : ''}
        relative overflow-hidden
      `}
    >
      {selected && (
        <div className="absolute top-3 right-3">
          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      )}
      {children}
    </Card>
  );
}

export default Card; 