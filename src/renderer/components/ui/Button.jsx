import React from 'react';

const VARIANT_TO_CLASS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  success: 'btn-success',
  danger: 'btn-danger',
  ghost: 'btn-ghost-minimal',
  outline: 'btn-outline',
  subtle: 'btn-subtle',
};

export default function Button({
  variant = 'primary',
  className = '',
  children,
  type = 'button',
  ...rest
}) {
  const variantClass = VARIANT_TO_CLASS[variant] || VARIANT_TO_CLASS.primary;
  const classes = `${variantClass} ${className}`.trim();
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
