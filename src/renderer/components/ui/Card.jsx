import React from 'react';

const VARIANT_TO_CLASS = {
  default:
    'bg-surface-primary rounded-xl border border-border-light shadow-sm p-21 hover:shadow-md hover:border-border-medium transition-all duration-200 backdrop-blur-sm',
  compact:
    'bg-surface-primary rounded-xl border border-border-light shadow-sm p-13 hover:shadow-md hover:border-border-medium transition-all duration-200 backdrop-blur-sm',
  elevated:
    'bg-surface-primary rounded-xl border border-border-light shadow-lg p-21 transition-all duration-200 backdrop-blur-sm',
  hero: 'glass-medium rounded-2xl shadow-2xl border border-white/30 p-34',
  success:
    'bg-gradient-to-br from-emerald-50 to-green-50 border-stratosort-success/30 rounded-xl p-21 shadow-sm ring-1 ring-stratosort-success/10',
  error:
    'bg-gradient-to-br from-red-50 to-rose-50 border-stratosort-accent/30 rounded-xl p-21 shadow-sm ring-1 ring-stratosort-accent/10',
  warning:
    'bg-gradient-to-br from-amber-50 to-yellow-50 border-stratosort-warning/30 rounded-xl p-21 shadow-sm ring-1 ring-stratosort-warning/10',
  interactive:
    'bg-surface-primary rounded-xl border border-border-light shadow-sm p-21 transition-transform duration-150 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] backdrop-blur-sm',
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
