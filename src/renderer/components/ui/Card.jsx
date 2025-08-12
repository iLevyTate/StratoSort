import React from 'react';

const VARIANT_TO_CLASS = {
  default: 'card-enhanced',
  compact: 'card-compact',
  elevated: 'card-elevated',
  hero: 'card-hero',
  success: 'card-success',
  error: 'card-error',
  warning: 'card-warning',
  interactive: 'card-interactive',
};

export default function Card({
  as: Component = 'div',
  variant = 'default',
  className = '',
  children,
  ...rest
}) {
  const variantClass = VARIANT_TO_CLASS[variant] || VARIANT_TO_CLASS.default;
  const classes = `${variantClass} ${className}`.trim();
  return (
    <Component className={classes} {...rest}>
      {children}
    </Component>
  );
}


